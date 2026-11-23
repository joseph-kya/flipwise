import type { ImportedData } from "./anki/types";
import { loadReviewLog, type ReviewEvent } from "./reviewLog";
export interface LogStorage {
  read(): Promise<ReviewEvent[]>;
  write(events: readonly ReviewEvent[]): Promise<void>;
  readDecks(): Promise<ImportedData | null>;
  importDecks(
    data: ImportedData,
    events: readonly ReviewEvent[],
  ): Promise<void>;
}
export async function openReviewStorage(): Promise<{
  storage: LogStorage;
  fallback: boolean;
}> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("flipwise", 2);
      r.onupgradeneeded = () => {
        for (const name of ["reviewLog", "decks"])
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
    const storage: LogStorage = {
      readDecks: () =>
        new Promise((resolve, reject) => {
          const r = db
            .transaction("decks")
            .objectStore("decks")
            .get("imported");
          r.onsuccess = () => resolve(r.result ?? null);
          r.onerror = () => reject(r.error);
        }),
      importDecks: (data, events) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(["decks", "reviewLog"], "readwrite");
          t.objectStore("decks").put(data, "imported");
          t.objectStore("reviewLog").put([...events], "events");
          t.oncomplete = () => resolve();
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        }),
      read: () =>
        new Promise((resolve, reject) => {
          const t = db.transaction("reviewLog");
          const r = t.objectStore("reviewLog").get("events");
          r.onsuccess = () => resolve(r.result ?? []);
          r.onerror = () => reject(r.error);
        }),
      write: (events) =>
        new Promise((resolve, reject) => {
          const t = db.transaction("reviewLog", "readwrite");
          t.objectStore("reviewLog").put([...events], "events");
          t.oncomplete = () => resolve();
          t.onerror = () => reject(t.error);
          t.onabort = () => reject(t.error);
        }),
    };
    // Keep the legacy copy as a recovery backup; never delete during migration.
    const exists = await new Promise<boolean>((resolve, reject) => {
      const r = db
        .transaction("reviewLog")
        .objectStore("reviewLog")
        .getKey("events");
      r.onsuccess = () => resolve(r.result !== undefined);
      r.onerror = () => reject(r.error);
    });
    if (!exists) await storage.write(loadReviewLog());
    return { storage, fallback: false };
  } catch {
    return {
      storage: {
        readDecks: async () => null,
        importDecks: async () => {
          throw new Error(
            "Import requires IndexedDB. Please enable browser storage.",
          );
        },
        read: async () => loadReviewLog(),
        write: async (events) => {
          localStorage.setItem("flipwise.reviewLog.v1", JSON.stringify(events));
        },
      },
      fallback: true,
    };
  }
}
