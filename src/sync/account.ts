/**
 * Account + sync lifecycle for the app. Lives in the main bundle but has no Firebase imports:
 * Firebase is loaded with a dynamic import only when the user signs in, or when this device was
 * signed in before (a localStorage hint), so a signed-out first load never downloads it.
 */
import type { LogStorage } from '../reviewStorage';
import type { AccountUser, FirebaseClient } from './client';
import { firebaseSetup, type FirebaseSetup } from './config';
import { isSyncableReview } from './demo';
import { SyncEngine, type SyncStatus } from './engine';
import { AUTH_SETTLE_MS, AUTH_TIMEOUT_MESSAGE, nextFailureCount, readFailures, writeFailures } from './authRecovery';
import type { SyncState } from './merge';

export type AccountPhase = 'unavailable' | 'loading' | 'signedOut' | 'signingIn' | 'signedIn';

export interface AccountSnapshot {
  phase: AccountPhase;
  authSettled: boolean;
  authTimedOut: boolean;
  failures: number;
  user: AccountUser | null;
  status: SyncStatus;
  pending: number;
  error: string;
  /** Set when sign-out was asked for while changes are still waiting to upload. */
  confirmSignOut: number | null;
}

const HINT_KEY = 'flipwise.account.v1';
const DEBOUNCE_MS = 15_000;
const MAX_WAIT_MS = 60_000;
const POLL_MS = 5 * 60_000;

const hint = {
  set: (on: boolean) => { try { if (on) localStorage.setItem(HINT_KEY, '1'); else localStorage.removeItem(HINT_KEY); } catch { /* ignore */ } },
};

export interface AccountCallbacks {
  /** Remote changes were merged into local storage. */
  onApplied(state: SyncState): void;
  /** Local data was swapped for another account's (stash/restore): reload everything. */
  onReplaced(): void;
}

export class AccountController {
  private snap: AccountSnapshot;
  private listeners = new Set<() => void>();
  private client: FirebaseClient | null = null;
  private loading: Promise<FirebaseClient> | null = null;
  private engine: SyncEngine | null = null;
  private uid: string | null = null;
  private preparing: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private firstPendingAt = 0;
  private poll: ReturnType<typeof setInterval> | null = null;
  private cleanup: (() => void)[] = [];
  private disposed = false;
  private authSeq = 0;
  private readonly setup: FirebaseSetup | null;

  constructor(private readonly storage: LogStorage, private readonly callbacks: AccountCallbacks, setup = firebaseSetup()) {
    this.setup = storage.sync ? setup : null;
    this.snap = { phase: this.setup ? 'loading' : 'unavailable', authSettled: !this.setup, authTimedOut: false, failures: readFailures(), user: null, status: { kind: 'idle' }, pending: 0, error: '', confirmSignOut: null };
  }

  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getSnapshot = () => this.snap;

  private set(patch: Partial<AccountSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Call once after local storage is ready. */
  start() {
    if (!this.setup) return;
    this.cleanup.push(this.storage.subscribe(() => this.schedule()));
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { if (this.timer) void this.syncNow(); }
      else void this.syncNow();
    };
    const onOnline = () => void this.syncNow();
    const onOffline = () => this.engine && this.set({ status: { kind: 'offline' } });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    this.cleanup.push(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    });
    // Check persisted Firebase auth even if an earlier interrupted attempt lost the hint.
    void this.preload();
  }

  dispose() {
    this.disposed = true;
    this.cleanup.splice(0).forEach((f) => f());
    this.stopEngine();
  }

  private load(): Promise<FirebaseClient> {
    if (this.loading) return this.loading;
    this.set({ phase: 'loading', authSettled: false, authTimedOut: false });
    const timeout = setTimeout(() => {
      if (this.disposed) return;
      this.set({ authSettled: true, authTimedOut: true, phase: 'signedOut', error: AUTH_TIMEOUT_MESSAGE });
    }, AUTH_SETTLE_MS);
    this.cleanup.push(() => clearTimeout(timeout));
    this.loading = import('./client').then(async ({ createFirebaseClient }) => {
      const client = createFirebaseClient(this.setup!);
      if (this.disposed) {
        clearTimeout(timeout);
        return client;
      }
      this.client = client;
      const error = await client.redirectError;
      if (this.disposed) {
        clearTimeout(timeout);
        return client;
      }
      if (error) this.recordFailure(error);
      await new Promise<void>((resolve) => {
        let settled = false;
        let firstSeen = false;
        const finish = (applyState: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (applyState && !this.disposed) {
            const patch: Partial<AccountSnapshot> = { authSettled: true, authTimedOut: false };
            if (this.snap.error === AUTH_TIMEOUT_MESSAGE) patch.error = '';
            this.set(patch);
          }
          resolve();
        };
        const unsub = client.onUser((user) => {
          if (this.disposed) return;
          const isFirst = !firstSeen;
          firstSeen = true;
          void this.onUser(user)
            .catch(() => {
              if (!this.disposed) this.set({ phase: 'signedOut', error: 'Couldn’t open your account. Please try again.' });
            })
            .finally(() => {
              if (isFirst) finish(true);
            });
        });
        this.cleanup.push(() => {
          unsub();
          finish(false);
        });
      });
      return client;
    });
    this.loading.catch(() => {
      clearTimeout(timeout);
      this.loading = null;
      if (this.disposed) return;
      this.set({ phase: 'signedOut', authSettled: true, authTimedOut: true, error: 'Couldn’t load sign-in. Check your connection, or continue without an account.' });
    });
    return this.loading;
  }

  private recordFailure(error: string) {
    const failures = nextFailureCount(this.snap.failures);
    writeFailures(failures);
    this.set({ failures, error });
  }

  private async onUser(user: AccountUser | null) {
    if (user && (this.uid === user.uid || this.preparing === user.uid)) { this.set({ user }); return; }
    const seq = ++this.authSeq;
    if (!user) {
      this.preparing = null;
      this.stopEngine();
      hint.set(false);
      this.set({ phase: 'signedOut', user: null, status: { kind: 'idle' }, pending: 0, confirmSignOut: null });
      return;
    }
    hint.set(true);
    writeFailures(0);
    this.set({ failures: 0 });
    this.stopEngine();
    this.preparing = user.uid;
    const local = this.storage.sync!;
    let prep: Awaited<ReturnType<typeof local.prepareAccount>>;
    try {
      prep = await local.prepareAccount(user.uid);
    } finally {
      if (this.preparing === user.uid) this.preparing = null;
    }
    if (this.disposed || this.authSeq !== seq) return;
    if (prep === 'switched') this.callbacks.onReplaced();
    this.uid = user.uid;
    const meta = await local.getUidMeta(user.uid);
    if (this.disposed || this.authSeq !== seq) return;
    const engine: SyncEngine = new SyncEngine({
      local,
      cloud: this.client!.cloud,
      uid: user.uid,
      isSyncable: isSyncableReview,
      isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
      onApplied: (state) => { if (this.engine === engine) this.callbacks.onApplied(state); },
      // A stopped engine (signed out / switched) may still finish a cycle: ignore it.
      onStatus: (status) => { if (this.engine === engine) this.set({ status }); },
    });
    this.engine = engine;
    this.set({
      phase: 'signedIn', user, error: '', confirmSignOut: null,
      status: meta?.lastSyncedAt ? { kind: 'synced', at: meta.lastSyncedAt } : { kind: 'idle' },
    });
    this.poll = setInterval(() => { if (document.visibilityState !== 'hidden') void this.syncNow(); }, POLL_MS);
    void this.syncNow();
  }

  private stopEngine() {
    if (this.timer) clearTimeout(this.timer);
    if (this.poll) clearInterval(this.poll);
    this.timer = null;
    this.poll = null;
    this.firstPendingAt = 0;
    this.engine = null;
    this.uid = null;
  }

  /** Debounced push after a local change: 15 s quiet, at most 60 s after the first change. */
  private schedule() {
    void this.refreshPending();
    if (!this.engine) return;
    const now = Date.now();
    if (!this.timer) this.firstPendingAt = now;
    else clearTimeout(this.timer);
    const wait = Math.max(0, Math.min(DEBOUNCE_MS, this.firstPendingAt + MAX_WAIT_MS - now));
    this.timer = setTimeout(() => void this.syncNow(), wait);
  }

  private async refreshPending() {
    if (!this.storage.sync || this.snap.phase !== 'signedIn') return;
    try { this.set({ pending: await this.storage.sync.pending() }); } catch { /* ignore */ }
  }

  async syncNow() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    const engine = this.engine;
    if (!engine) return;
    const run = () => engine.sync();
    try {
      const locks = (navigator as Navigator & { locks?: { request: (n: string, f: () => Promise<unknown>) => Promise<unknown> } }).locks;
      await (locks ? locks.request('flipwise-sync', run) : run());
    } catch {
      /* status already reflects the failure; the next trigger retries */
    }
    await this.refreshPending();
  }

  preload() { if (this.setup) return this.load().catch(() => null); return Promise.resolve(null); }

  async signIn() {
    if (!this.setup || this.snap.phase === 'signingIn') return;
    // No await before client.signIn: the popup must open in the original tap's call stack.
    if (!this.client || !this.snap.authSettled || this.snap.authTimedOut) {
      this.recordFailure('Sign-in is still loading. Please try again in a moment.');
      void this.preload();
      return;
    }
    this.set({ error: '', phase: 'signingIn' });
    hint.set(true);
    try {
      await this.client.signIn();
      // The auth observer owns the successful transition, including local account preparation.
    } catch (e) {
      if (!this.uid) hint.set(false);
      this.recordFailure(e instanceof Error ? e.message : String(e));
      this.set({ phase: this.uid ? 'signedIn' : 'signedOut' });
    }
  }

  /** Flush first; if changes remain (e.g. offline), ask before signing out. They stay queued for this account. */
  async signOut(force = false) {
    if (!this.client) return;
    if (!force) {
      await Promise.race([this.syncNow(), new Promise((r) => setTimeout(r, 8_000))]);
      const pending = this.storage.sync ? await this.storage.sync.pending() : 0;
      if (pending > 0) { this.set({ confirmSignOut: pending }); return; }
    }
    this.set({ confirmSignOut: null });
    await this.client.signOut();
  }

  cancelSignOut() {
    this.set({ confirmSignOut: null });
  }
}
