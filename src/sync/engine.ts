/**
 * Sync orchestration: pull -> merge -> commit locally -> push, against two interfaces
 * (SyncLocalStore, CloudAdapter). No Firebase imports, so tests can drive full cycles
 * with an in-memory cloud.
 */
import type { AppearanceSettings } from '../settings';
import {
  chunk,
  mergePulled,
  planPush,
  type CloudCollection,
  type CloudDoc,
  type CloudWrite,
  type IsSyncable,
  type PushItem,
  type RecordKey,
  type SyncState,
  type UidMeta,
} from './merge';

export interface SettingsIO {
  load(): AppearanceSettings;
  save(settings: AppearanceSettings): void;
}

export type SyncSnapshot = SyncState & { binding: string | null };
export type AccountPreparation = 'same' | 'first' | 'switched';

export interface SyncLocalStore {
  load(): Promise<SyncSnapshot>;
  /**
   * Atomically replace data + meta if nobody mutated since `expectedRev` and the device is
   * still bound to `uid` ('foreign' = another account took over: abort, never retry).
   */
  commit(uid: string, expectedRev: number, next: SyncState, changed: { data: boolean; events: boolean; settings: boolean }): Promise<'ok' | 'conflict' | 'foreign'>;
  /** Clear confirmed items; refused (false) if the device is no longer bound to `uid`. */
  markPushed(uid: string, items: readonly PushItem[], stale: readonly string[], staleRecords: readonly RecordKey[]): Promise<boolean>;
  getUidMeta(uid: string): Promise<UidMeta | null>;
  setUidMeta(uid: string, meta: UidMeta): Promise<void>;
  noteSettings(settings: AppearanceSettings): Promise<void>;
  pending(): Promise<number>;
  /** Bind/stash/restore local data for `uid` (see docs/sync-model.md, Accounts). */
  prepareAccount(uid: string): Promise<AccountPreparation>;
}

export interface CloudAdapter {
  /** Docs in users/{uid}/{collection} with server time > sinceMs, all pages. */
  pull(uid: string, collection: CloudCollection, sinceMs: number): Promise<CloudDoc[]>;
  /** One atomic batch (<= 500 writes). Adapter stamps the server time `srv`. */
  commit(uid: string, writes: readonly CloudWrite[]): Promise<void>;
}

export type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'synced'; at: number }
  | { kind: 'offline' }
  | { kind: 'error'; message: string };

export interface SyncReport {
  pulledRecords: number;
  pulledReviews: number;
  pushedWrites: number;
  batches: number;
  changed: { data: boolean; events: boolean; settings: boolean };
  oversize: RecordKey[];
}

export const SKEW_WINDOW_MS = 2 * 60_000;

export class AccountChangedError extends Error {
  constructor() {
    super('Signed-in account changed during sync');
    this.name = 'AccountChangedError';
  }
}

export class OfflineError extends Error {
  constructor(message = 'Offline') {
    super(message);
    this.name = 'OfflineError';
  }
}

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T> =>
  ms <= 0
    ? p
    : new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new OfflineError('Timed out')), ms);
        p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
      });

export interface EngineOptions {
  local: SyncLocalStore;
  cloud: CloudAdapter;
  uid: string;
  isSyncable: IsSyncable;
  now?: () => number;
  timeoutMs?: number;
  isOnline?: () => boolean;
  onApplied?: (state: SyncState, changed: SyncReport['changed']) => void;
  onStatus?: (status: SyncStatus) => void;
}

export class SyncEngine {
  status: SyncStatus = { kind: 'idle' };
  private running: Promise<SyncReport> | null = null;
  private again = false;

  constructor(private readonly o: EngineOptions) {}

  private setStatus(status: SyncStatus) {
    this.status = status;
    this.o.onStatus?.(status);
  }

  /** Run one cycle; concurrent callers share it and a follow-up cycle runs once. */
  sync(): Promise<SyncReport> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    const run = async (): Promise<SyncReport> => {
      let report: SyncReport;
      do {
        this.again = false;
        report = await this.cycle();
      } while (this.again);
      return report;
    };
    this.running = run().finally(() => { this.running = null; });
    return this.running;
  }

  private async cycle(): Promise<SyncReport> {
    const { local, cloud, uid, isSyncable } = this.o;
    const now = this.o.now ?? Date.now;
    const timeout = this.o.timeoutMs ?? 30_000;
    if (this.o.isOnline && !this.o.isOnline()) {
      this.setStatus({ kind: 'offline' });
      throw new OfflineError();
    }
    this.setStatus({ kind: 'syncing' });
    try {
      const uidMeta: UidMeta = (await local.getUidMeta(uid)) ?? { initialized: false, cursorRecords: 0, cursorReviews: 0 };
      const full = !uidMeta.initialized;
      const first = await local.load();
      if (first.binding !== uid) throw new AccountChangedError();
      if (first.settings) await local.noteSettings(first.settings);

      const since = (cursor: number) => (full ? 0 : Math.max(0, cursor - SKEW_WINDOW_MS));
      const records = await withTimeout(cloud.pull(uid, 'records', since(uidMeta.cursorRecords)), timeout);
      const reviews = await withTimeout(cloud.pull(uid, 'reviews', since(uidMeta.cursorReviews)), timeout);

      let changed = { data: false, events: false, settings: false };
      for (let attempt = 0; ; attempt++) {
        const snap = await local.load();
        if (snap.binding !== uid) throw new AccountChangedError();
        const merged = mergePulled(snap, { records, reviews }, { full, isSyncable });
        const result = await local.commit(uid, snap.meta.rev, merged.state, merged.changed);
        if (result === 'foreign') throw new AccountChangedError();
        if (result === 'ok') {
          changed = merged.changed;
          if (changed.data || changed.events || changed.settings) this.o.onApplied?.(merged.state, changed);
          break;
        }
        if (attempt >= 8) throw new Error('Local data kept changing during sync; will retry.');
      }

      const maxSrv = (docs: CloudDoc[], prev: number) => docs.reduce((m, d) => Math.max(m, d.srv), prev);
      const cursors: UidMeta = {
        ...uidMeta,
        cursorRecords: maxSrv(records, full ? 0 : uidMeta.cursorRecords),
        cursorReviews: maxSrv(reviews, full ? 0 : uidMeta.cursorReviews),
      };
      await local.setUidMeta(uid, cursors);

      const pushFrom = await local.load();
      if (pushFrom.binding !== uid) throw new AccountChangedError();
      const plan = planPush(pushFrom, isSyncable);
      const batches = chunk(plan.items);
      let pushedWrites = 0;
      for (const batch of batches) {
        await withTimeout(cloud.commit(uid, batch.map((i) => i.write)), timeout);
        if (!(await local.markPushed(uid, batch, [], []))) throw new AccountChangedError();
        pushedWrites += batch.length;
      }
      if (plan.stale.length || plan.staleRecords.length) await local.markPushed(uid, [], plan.stale, plan.staleRecords);

      await local.setUidMeta(uid, { ...cursors, initialized: true, lastSyncedAt: now() });
      if (plan.oversize.length)
        this.setStatus({ kind: 'error', message: `${plan.oversize.length} card${plan.oversize.length === 1 ? ' is' : 's are'} too large to sync` });
      else this.setStatus({ kind: 'synced', at: now() });
      return { pulledRecords: records.length, pulledReviews: reviews.length, pushedWrites, batches: batches.length, changed, oversize: plan.oversize };
    } catch (e) {
      const offline = e instanceof OfflineError || isUnavailable(e) || (this.o.isOnline ? !this.o.isOnline() : false);
      this.setStatus(offline ? { kind: 'offline' } : { kind: 'error', message: errorMessage(e) });
      throw e;
    }
  }
}

export function isUnavailable(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === 'unavailable' || code === 'deadline-exceeded' || code === 'auth/network-request-failed';
}

export function errorMessage(e: unknown): string {
  const code = (e as { code?: string } | null)?.code;
  if (code === 'permission-denied') return 'Permission denied by the server';
  if (code === 'resource-exhausted') return 'Daily sync quota reached; will retry later';
  return e instanceof Error ? e.message : String(e);
}
