/**
 * In-memory stand-in for Firestore used by the tests: users/{uid}/{collection}/{id} docs,
 * set vs set-merge (nested maps merge), atomic batches of <= 500 writes, a monotonic server
 * clock for `srv`, owner-only access (mirrors firestore.rules) and failure injection.
 */
import type { CloudAdapter } from './engine';
import type { CloudCollection, CloudDoc, CloudWrite } from './merge';

type Doc = { data: Record<string, unknown>; srv: number };

function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    const cur = out[k];
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)
        ? deepMerge(cur as Record<string, unknown>, v as Record<string, unknown>)
        : structuredClone(v);
  }
  return out;
}

export class MemoryCloud {
  docs = new Map<string, Doc>(); // `${uid}/${collection}/${id}`
  clock = 1_000;
  commits = 0;
  writes = 0;
  reads = 0;
  online = true;
  /** Throw on the commit with this (1-based) index, after counting it. */
  failOnCommit: number | null = null;

  /** An adapter authenticated as `authUid` (null = signed out). */
  as(authUid: string | null): CloudAdapter {
    const check = (uid: string) => {
      if (!this.online) throw Object.assign(new Error('offline'), { code: 'unavailable' });
      if (authUid !== uid) throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    };
    return {
      pull: async (uid: string, collection: CloudCollection, sinceMs: number): Promise<CloudDoc[]> => {
        check(uid);
        const prefix = `${uid}/${collection}/`;
        const out: CloudDoc[] = [];
        for (const [key, doc] of this.docs)
          if (key.startsWith(prefix) && doc.srv > sinceMs)
            out.push({ id: key.slice(prefix.length), data: structuredClone(doc.data), srv: doc.srv });
        this.reads += Math.max(1, out.length);
        return out.sort((a, b) => a.srv - b.srv);
      },
      commit: async (uid: string, writes: readonly CloudWrite[]) => {
        check(uid);
        if (writes.length > 500) throw Object.assign(new Error('Batch too large'), { code: 'invalid-argument' });
        this.commits++;
        if (this.failOnCommit === this.commits) throw Object.assign(new Error('network lost mid-sync'), { code: 'unavailable' });
        const srv = ++this.clock;
        for (const w of writes) {
          const key = `${uid}/${w.collection}/${w.id}`;
          const prev = this.docs.get(key);
          const data = w.merge && prev ? deepMerge(prev.data, w.data) : structuredClone(w.data);
          this.docs.set(key, { data, srv });
        }
        this.writes += writes.length;
      },
    };
  }

  /** Raw docs of a user's collection, for assertions. */
  list(uid: string, collection: CloudCollection) {
    const prefix = `${uid}/${collection}/`;
    return [...this.docs].filter(([k]) => k.startsWith(prefix)).map(([k, d]) => ({ id: k.slice(prefix.length), ...d }));
  }
}
