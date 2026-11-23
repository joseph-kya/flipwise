import type { ImportedData } from "./anki/types";
import { loadReviewLog, withStableId, type ReviewEvent } from "./reviewLog";
import { loadSettings, saveSettings, type AppearanceSettings } from "./settings";
import { isSyncableReview } from "./sync/demo";
import {
  BASELINE_U,
  SETTINGS_KEY,
  canonicalLog,
  emptyMeta,
  hashValue,
  markPushed,
  migrateMeta,
  pendingCount,
  stampDecks,
  stampEvents,
  stampSettings,
  type IsSyncable,
  type SyncMeta,
  type UidMeta,
} from "./sync/merge";
import type { AccountPreparation, SettingsIO, SyncLocalStore, SyncSnapshot } from "./sync/engine";

export interface LogStorage {
  read(): Promise<ReviewEvent[]>;
  /** Replace the log. Removed syncable entries become tombstones. */
  write(events: readonly ReviewEvent[]): Promise<void>;
  /** Append one rating; returns the full stored log (including anything sync merged in). */
  append(event: ReviewEvent): Promise<ReviewEvent[]>;
  /** Remove entries by id (undo, clear demo); returns the full stored log. */
  remove(ids: readonly string[]): Promise<ReviewEvent[]>;
  readDecks(): Promise<ImportedData | null>;
  /** Store decks; `events` are unioned with the stored log (never replace it). */
  importDecks(data: ImportedData, events: readonly ReviewEvent[]): Promise<ReviewEvent[]>;
  /** Record a settings change for sync (settings themselves live in localStorage). */
  noteSettings(settings: AppearanceSettings): Promise<void>;
  /** Called after every committed local mutation. */
  subscribe(listener: () => void): () => void;
  /** Sync bookkeeping; null when IndexedDB is unavailable (sync is then disabled). */
  sync: SyncLocalStore | null;
}

export interface StorageOptions {
  name?: string;
  settings?: SettingsIO;
  isSyncable?: IsSyncable;
  now?: () => number;
}

const defaultSettingsIO: SettingsIO = { load: () => loadSettings(), save: (s) => saveSettings(s) };

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

async function run<T>(db: IDBDatabase, stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => Promise<T>): Promise<T> {
  const t = db.transaction(stores, mode);
  const done = new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error("Transaction aborted"));
  });
  let result: T;
  try {
    result = await fn(t);
  } catch (e) {
    try { t.abort(); } catch { /* already finished */ }
    await done.catch(() => undefined);
    throw e;
  }
  await done;
  return result;
}

const randomId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

interface Stash {
  decks: ImportedData | null;
  events: ReviewEvent[];
  meta: SyncMeta;
  settings: AppearanceSettings | null;
}

export async function openReviewStorage(options: StorageOptions = {}): Promise<{
  storage: LogStorage;
  fallback: boolean;
}> {
  const settingsIO = options.settings ?? defaultSettingsIO;
  const isSyncable = options.isSyncable ?? isSyncableReview;
  const now = options.now ?? Date.now;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => { try { l(); } catch { /* listener errors never break storage */ } });
  const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(options.name ?? "flipwise", 3);
      r.onupgradeneeded = () => {
        for (const name of ["reviewLog", "decks", "sync"])
          if (!r.result.objectStoreNames.contains(name))
            r.result.createObjectStore(name);
      };
      r.onsuccess = () => {
        r.result.onversionchange = () => r.result.close();
        resolve(r.result);
      };
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error("Storage blocked"));
    });
    const ALL = ["reviewLog", "decks", "sync"];
    const getEvents = async (t: IDBTransaction) => ((await req(t.objectStore("reviewLog").get("events"))) ?? []) as ReviewEvent[];
    const getDecks = async (t: IDBTransaction) => ((await req(t.objectStore("decks").get("imported"))) ?? null) as ImportedData | null;
    const getMeta = async (t: IDBTransaction) => (await req(t.objectStore("sync").get("meta"))) as SyncMeta;
    const putAll = (t: IDBTransaction, v: { events?: ReviewEvent[]; decks?: ImportedData | null; meta?: SyncMeta }) => {
      if (v.events) t.objectStore("reviewLog").put(v.events, "events");
      if (v.decks !== undefined) {
        if (v.decks) t.objectStore("decks").put(v.decks, "imported");
        else t.objectStore("decks").delete("imported");
      }
      if (v.meta) t.objectStore("sync").put(v.meta, "meta");
    };

    /** One transaction over log + decks + meta; stamps sync changes and bumps rev. */
    const mutate = async (fn: (events: ReviewEvent[], meta: SyncMeta) => ReviewEvent[] | null) => {
      const result = await run(db, ["reviewLog", "sync"], "readwrite", async (t) => {
        const events = await getEvents(t), meta = await getMeta(t);
        const next = fn(events, meta);
        if (!next) return events;
        putAll(t, { events: next, meta: { ...stampEvents(meta, events, next, isSyncable), rev: meta.rev + 1 } });
        return next;
      });
      emit();
      return result;
    };

    const sync: SyncLocalStore = {
      async load(): Promise<SyncSnapshot> {
        const settings = settingsIO.load();
        return run(db, ALL, "readonly", async (t) => ({
          events: await getEvents(t),
          data: await getDecks(t),
          meta: await getMeta(t),
          settings,
          binding: ((await req(t.objectStore("sync").get("binding"))) as { uid: string | null } | undefined)?.uid ?? null,
        }));
      },
      async commit(expectedRev, next, changed) {
        if (changed.settings && next.settings) settingsIO.save(next.settings);
        const ok = await run(db, ALL, "readwrite", async (t) => {
          const meta = await getMeta(t);
          if (meta.rev !== expectedRev) return false;
          putAll(t, {
            events: changed.events ? next.events : undefined,
            decks: changed.data ? next.data : undefined,
            meta: { ...next.meta, rev: meta.rev + 1 },
          });
          return true;
        });
        return ok;
      },
      async markPushed(items, stale, staleRecords) {
        await run(db, ["sync"], "readwrite", async (t) => {
          const meta = await getMeta(t);
          t.objectStore("sync").put({ ...markPushed(meta, items, stale, staleRecords), rev: meta.rev + 1 }, "meta");
        });
      },
      async getUidMeta(uid) {
        return run(db, ["sync"], "readonly", async (t) => ((await req(t.objectStore("sync").get(`uid:${uid}`))) as UidMeta | undefined) ?? null);
      },
      async setUidMeta(uid, value) {
        await run(db, ["sync"], "readwrite", async (t) => { t.objectStore("sync").put(value, `uid:${uid}`); });
      },
      async noteSettings(settings) {
        await storage.noteSettings(settings);
      },
      async pending() {
        return run(db, ["sync"], "readonly", async (t) => pendingCount(await getMeta(t)));
      },
      async prepareAccount(uid): Promise<AccountPreparation> {
        const currentSettings = settingsIO.load();
        let restoredSettings: AppearanceSettings | null = null;
        const outcome = await run(db, ALL, "readwrite", async (t) => {
          const store = t.objectStore("sync");
          const binding = ((await req(store.get("binding"))) as { uid: string | null } | undefined)?.uid ?? null;
          const meta = await getMeta(t);
          if (binding === uid) {
            if (!meta.bound) store.put({ ...meta, bound: true, rev: meta.rev + 1 }, "meta");
            return "same" as const;
          }
          if (binding === null) {
            store.put({ uid }, "binding");
            store.put({ ...meta, bound: true, rev: meta.rev + 1 }, "meta");
            return "first" as const;
          }
          // A different account: park the active data under the old uid, never upload it here.
          const stash: Stash = { decks: await getDecks(t), events: await getEvents(t), meta, settings: currentSettings };
          store.put(stash, `stash:${binding}`);
          const restore = (await req(store.get(`stash:${uid}`))) as Stash | undefined;
          if (restore) {
            putAll(t, { events: restore.events, decks: restore.decks, meta: { ...restore.meta, rev: meta.rev + 1 } });
            store.delete(`stash:${uid}`);
            restoredSettings = restore.settings;
          } else {
            const fresh = emptyMeta(meta.deviceId, true);
            fresh.rev = meta.rev + 1;
            fresh.records[SETTINGS_KEY] = { u: BASELINE_U, dev: meta.deviceId, h: hashValue(currentSettings) };
            putAll(t, { events: [], decks: null, meta: fresh });
          }
          store.put({ uid }, "binding");
          return "switched" as const;
        });
        if (restoredSettings) settingsIO.save(restoredSettings);
        if (outcome === "switched") emit();
        return outcome;
      },
    };

    const storage: LogStorage = {
      sync,
      subscribe,
      readDecks: () => run(db, ["decks"], "readonly", getDecks),
      read: () => run(db, ["reviewLog"], "readonly", getEvents),
      write: async (events) => { await mutate(() => [...events]); },
      append: (event) => mutate((events) => (events.some((e) => e.id === event.id) ? null : [...events, event])),
      remove: (ids) => {
        const drop = new Set(ids);
        return mutate((events) => (events.some((e) => drop.has(e.id)) ? events.filter((e) => !drop.has(e.id)) : null));
      },
      importDecks: async (data, incoming) => {
        const result = await run(db, ALL, "readwrite", async (t) => {
          const events = await getEvents(t), prev = await getDecks(t), meta = await getMeta(t);
          const have = new Set(events.map((e) => e.id));
          const added = incoming.filter((e) => !have.has(e.id) && !meta.tombs[e.id]);
          const nextEvents = added.length ? canonicalLog([...events, ...added]) : events;
          const stamped = stampEvents(stampDecks(meta, prev, data, now()), events, nextEvents, isSyncable);
          putAll(t, { events: nextEvents, decks: data, meta: { ...stamped, rev: meta.rev + 1 } });
          return nextEvents;
        });
        emit();
        return result;
      },
      noteSettings: async (settings) => {
        const changed = await run(db, ["sync"], "readwrite", async (t) => {
          const meta = await getMeta(t);
          const next = stampSettings(meta, settings, now());
          if (next === meta) return false;
          t.objectStore("sync").put({ ...next, rev: meta.rev + 1 }, "meta");
          return true;
        });
        if (changed) emit();
      },
    };

    // First open (or upgrade): seed legacy events, give id-less entries stable ids, create sync meta.
    await run(db, ALL, "readwrite", async (t) => {
      const logStore = t.objectStore("reviewLog");
      const exists = (await req(logStore.getKey("events"))) !== undefined;
      // Keep the legacy copy as a recovery backup; never delete during migration.
      let events = exists ? await getEvents(t) : loadReviewLog();
      if (!exists || events.some((e) => !e?.id)) {
        events = events.map((e) => withStableId(e) as ReviewEvent);
        logStore.put(events, "events");
      }
      const syncStore = t.objectStore("sync");
      if ((await req(syncStore.getKey("meta"))) === undefined) {
        let settings: AppearanceSettings | null = null;
        try { settings = settingsIO.load(); } catch { /* settings unavailable */ }
        syncStore.put(migrateMeta(randomId(), await getDecks(t), settings), "meta");
      }
    });
    return { storage, fallback: false };
  } catch {
    const readLog = async () => loadReviewLog();
    const writeLog = async (events: readonly ReviewEvent[]) => {
      localStorage.setItem("flipwise.reviewLog.v1", JSON.stringify(events));
      emit();
    };
    return {
      storage: {
        sync: null,
        subscribe,
        readDecks: async () => null,
        importDecks: async () => {
          throw new Error(
            "Import requires IndexedDB. Please enable browser storage.",
          );
        },
        read: readLog,
        write: writeLog,
        append: async (event) => { const next = [...(await readLog()), event]; await writeLog(next); return next; },
        remove: async (ids) => { const drop = new Set(ids); const next = (await readLog()).filter((e) => !drop.has(e.id)); await writeLog(next); return next; },
        noteSettings: async () => undefined,
      },
      fallback: true,
    };
  }
}
