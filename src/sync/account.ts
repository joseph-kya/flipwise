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
import type { SyncState } from './merge';

export type AccountPhase = 'unavailable' | 'loading' | 'signedOut' | 'signingIn' | 'signedIn';

export interface AccountSnapshot {
  phase: AccountPhase;
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
  get: () => { try { return localStorage.getItem(HINT_KEY) === '1'; } catch { return false; } },
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
  private readonly setup: FirebaseSetup | null;

  constructor(private readonly storage: LogStorage, private readonly callbacks: AccountCallbacks, setup = firebaseSetup()) {
    this.setup = storage.sync ? setup : null;
    this.snap = { phase: this.setup ? 'signedOut' : 'unavailable', user: null, status: { kind: 'idle' }, pending: 0, error: '', confirmSignOut: null };
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
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', () => this.engine && this.set({ status: { kind: 'offline' } }));
    this.cleanup.push(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onVisibility);
      window.removeEventListener('online', onOnline);
    });
    if (hint.get()) void this.load().catch(() => this.set({ phase: 'signedOut' }));
  }

  dispose() {
    this.cleanup.forEach((f) => f());
    this.stopEngine();
  }

  private load(): Promise<FirebaseClient> {
    if (this.loading) return this.loading;
    this.set({ phase: 'loading' });
    this.loading = import('./client').then(({ createFirebaseClient }) => {
      const client = createFirebaseClient(this.setup!);
      this.client = client;
      void client.redirectError.then((error) => error && this.set({ error }));
      this.cleanup.push(client.onUser((user) => void this.onUser(user)));
      return client;
    });
    this.loading.catch(() => { this.loading = null; this.set({ phase: 'signedOut', error: 'Couldn’t load sign-in. Check your connection.' }); });
    return this.loading;
  }

  private async onUser(user: AccountUser | null) {
    if (!user) {
      this.stopEngine();
      hint.set(false);
      this.set({ phase: 'signedOut', user: null, status: { kind: 'idle' }, pending: 0, confirmSignOut: null });
      return;
    }
    if (this.uid === user.uid || this.preparing === user.uid) { this.set({ user }); return; }
    hint.set(true);
    this.stopEngine();
    this.preparing = user.uid;
    const local = this.storage.sync!;
    let prep: Awaited<ReturnType<typeof local.prepareAccount>>;
    try {
      prep = await local.prepareAccount(user.uid);
    } finally {
      this.preparing = null;
    }
    if (prep === 'switched') this.callbacks.onReplaced();
    this.uid = user.uid;
    const meta = await local.getUidMeta(user.uid);
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

  async signIn() {
    if (!this.setup) return;
    this.set({ error: '', phase: 'signingIn' });
    try {
      const client = await this.load();
      hint.set(true); // survives a redirect so Firebase loads on return
      await client.signIn();
      if (!this.uid && !this.preparing) {
        hint.set(false); // popup closed: don't preload Firebase next visit
        this.set({ phase: 'signedOut' });
      }
    } catch (e) {
      if (!this.uid) hint.set(false);
      this.set({ phase: this.uid ? 'signedIn' : 'signedOut', error: e instanceof Error ? e.message : String(e) });
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
