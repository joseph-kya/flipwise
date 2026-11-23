/** CloudAdapter over the modular Firestore SDK. All paths live under users/{uid}/... */
import {
  Timestamp,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  where,
  writeBatch,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
  type Firestore,
} from 'firebase/firestore/lite';
import type { CloudAdapter } from './engine';
import { MAX_BATCH_WRITES, type CloudDoc } from './merge';

const PAGE = 500;

export function firestoreAdapter(db: Firestore): CloudAdapter {
  return {
    async pull(uid, name, sinceMs) {
      const out: CloudDoc[] = [];
      let last: DocumentSnapshot | null = null;
      for (;;) {
        const base = collection(db, 'users', uid, name);
        const q: Query = last
          ? query(base, where('srv', '>', Timestamp.fromMillis(sinceMs)), orderBy('srv'), startAfter(last), limit(PAGE))
          : query(base, where('srv', '>', Timestamp.fromMillis(sinceMs)), orderBy('srv'), limit(PAGE));
        const snap: QuerySnapshot = await getDocs(q);
        for (const d of snap.docs) {
          const data = d.data();
          const srv = data.srv instanceof Timestamp ? data.srv.toMillis() : 0;
          delete data.srv;
          out.push({ id: d.id, data, srv });
        }
        if (snap.docs.length < PAGE) return out;
        last = snap.docs[snap.docs.length - 1];
      }
    },
    async commit(uid, writes) {
      if (writes.length > MAX_BATCH_WRITES) throw new Error(`Batch of ${writes.length} exceeds ${MAX_BATCH_WRITES}`);
      const batch = writeBatch(db);
      for (const w of writes) {
        const ref = doc(db, 'users', uid, w.collection, w.id);
        const data = { ...w.data, srv: serverTimestamp() };
        if (w.merge) batch.set(ref, data, { merge: true });
        else batch.set(ref, data);
      }
      await batch.commit();
    },
  };
}
