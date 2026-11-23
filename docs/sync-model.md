# Flipwise sync model

Status: design for Google sign-in + Firebase cloud sync. Written before the code, then updated with
what the adversarial review found (see the last section).

## Goals and non-goals

- **Local-first.** IndexedDB `flipwise` stays the source of truth for the UI. The app works signed
  out and offline exactly as before. With no `VITE_FIREBASE_*` config the account UI is hidden and
  Firebase is never downloaded.
- **Sync never loses data.** Every merge is per record (or per review), never per collection, and
  every step is idempotent, so retrying after any crash is safe.
- **Cheap.** Stay far inside Spark (50k reads / 20k writes per day).
- Not a goal (yet): media blobs, real-time listeners, sharing between users.

## What syncs

| Local data | Synced as | Merge rule |
| --- | --- | --- |
| Review log entries (`ReviewEvent`) | entries inside per-day review bucket docs | union by `id`; undo = permanent tombstone |
| Imported subjects (`Subject` minus lectures) | `subject` records | LWW per record |
| Lectures / Anki decks (`Lecture` minus cards) | `deck` records | LWW per record |
| Cards (`ImportedCard`, which carry their note's fields, tags and guid) | `card` records | LWW per record |
| Appearance + study settings (`AppearanceSettings`) | one `settings` record | LWW per record |

There is no separate note entity in Flipwise. A note's fields are carried by each of its cards,
and a re-import updates all sibling cards in the same local write.

**Never synced:**

- The built-in demo decks (they're not in the imported blob).
- Demo review history (`demo: true`).
- Any review of a built-in demo card (card id in the demo catalog).
- `showDemo`, the "demo cleared" flag, and package metadata (`packageName`, `warnings`).
- **Media blobs.** Anki images are kept in the local blob only. Firestore documents must stay under
  1 MiB and media can be many MB, so syncing them would need Cloud Storage. Until then a card
  that references an image shows its text on other devices, but not the image. Re-importing the
  `.apkg` on that device restores the images.

## Types

```ts
type RecordCollection = 'subject' | 'deck' | 'card' | 'settings';
type RecordKey = `${RecordCollection}~${string}`;      // also the Firestore doc id (id is URI-encoded)

interface RecMeta {          // per record, stored locally in sync meta
  u: number;                 // logical updatedAt (ms, hybrid clock: max(now, prev.u + 1))
  dev: string;               // deviceId that wrote this version (tiebreak)
  h: string;                 // hash of the local decomposed record data (change detection)
  del?: true;                // tombstone
  dirty?: true;              // local version not yet confirmed in the cloud
}

interface SyncMeta {         // IndexedDB store `sync`, key `meta`, written in the same tx as data
  v: 1;
  deviceId: string;          // random, per browser profile
  rev: number;               // bumped by every local mutation (optimistic concurrency for sync)
  bound: boolean;            // device data is linked to an account (pending lists are tracked)
  records: Record<RecordKey, RecMeta>;
  tombs: Record<string, string>;   // review id -> `at`, permanent (undo)
  pendingReviews: string[];        // review ids not yet uploaded (only while bound)
  pendingTombs: string[];          // tombstones not yet uploaded
}

interface UidMeta {          // key `uid:<uid>`, one per account that ever signed in here
  initialized: boolean;      // the first full merge for this uid on this device has finished
  cursorRecords: number;     // max server time seen (ms)
  cursorReviews: number;
  lastSyncedAt?: number;
}
// key `binding` -> { uid: string | null }: which account the active local data belongs to
// key `stash:<uid>` -> { decks, events, meta, settings }: parked data of an inactive account
```

## Firestore layout (everything under `users/{uid}/…`)

```
users/{uid}/records/{collection}~{encodedId}
  { c, id, u, dev, h, del?: true, d: <record data> | null, srv: serverTimestamp() }

users/{uid}/reviews/{yyyy-mm-dd}            // UTC day of the review's `at`
  { e: { [reviewId]: "<compact JSON string>" },
    d: { [reviewId]: true },                // tombstones (undo), never removed
    srv: serverTimestamp() }
```

- Review buckets are written with `set(…, { merge: true })`. Firestore merges nested map fields,
  so two devices that append to the same day at the same time both survive. The bucket is a
  grow-only set (`e`) plus a grow-only tombstone set (`d`). Nothing ever writes `d[id] = false`, so
  a late re-upload of `e[id]` can't resurrect an undone review.
- Each entry is a single string field, so each review costs about 2 index entries. That keeps a
  day bucket far below the 40k index-entry and 1 MiB limits (about 150 B per review, so roughly
  5,000 reviews per day per doc).
- `srv` is a server timestamp and is only used for the incremental pull cursor. Client clocks are
  never compared to it.
- The published rules (mirrored in `firestore.rules`) let only `request.auth.uid == uid` read or
  write `users/{uid}/**`.

## Merge rules

### Records (subject, deck, card, settings): last writer wins per record

- Order: `(u, dev, h)` lexicographic. It's a total order, so every device picks the same winner
  no matter in which order it sees the versions.
- **Hybrid clock.** A local edit is stamped `u = max(Date.now(), previous.u + 1)`, where
  `previous` is the version this device currently holds, whether local or pulled. So an edit made
  *after* seeing a version always beats it, even if this device's clock is behind. Clock skew only
  matters for truly concurrent edits (neither device had seen the other's), where the device with
  the later clock wins. That's acceptable for flashcard metadata, and it's deterministic.
- **Tombstones** are records with `del: true` and their own `u`. They win over older edits and
  lose to newer ones (for example, a re-import after a delete brings the card back). Local deletes
  are detected only for records present in the previous local blob and absent from the next one.
- **Change detection** is by hash. A local write stamps only the records whose decomposed data
  hash differs from `meta.records[key].h`. A re-import of an unchanged deck stamps nothing and
  uploads nothing.
- **Materialization.** Records are decomposed from, and re-materialized into, the existing
  `ImportedData` blob (subjects → lectures → cards, ordered by `pos` then id, `total` recomputed).
  Local media and package metadata are kept. A card whose deck hasn't arrived yet goes under a
  placeholder lecture (`syncPlaceholder: true`). Placeholders are never decomposed back into
  records, so they can't be uploaded or win LWW.
- **Legacy data** (stored before sync existed) is stamped `u = 1` on migration. On the first
  sign-in, newer cloud versions therefore win where they overlap, and local-only records are still
  uploaded.
- **Repair.** If a pull returns a version that loses to our local one, the local one is marked
  dirty and re-pushed. Without this, a stale device that pushed blindly over a newer cloud doc
  would leave the cloud stale forever. With it, every device converges on the maximum.

### Review log: append-only union by stable id

- Every entry has a stable id. Ratings use `crypto.randomUUID()`, Anki imports use
  `anki-review:<revlog id>:<card>` (deterministic, so importing the same `.apkg` on two devices
  deduplicates), and the demo seed uses `demo-N`. Any legacy entry without an id is migrated to a
  deterministic `legacy:<cardId>:<at>:<rating>` id instead of being dropped.
- Merge = union of entries by id, minus the union of tombstones. It's commutative, associative and
  idempotent (a 2P-set).
- After a merge the log is sorted by `(at, id)` and `isNew` is recomputed as "first live review of
  this card". Every device derives the same log.

### FSRS state: re-derived from the merged log (decision)

Card memory state (`stability`, `difficulty`, `due`, …) is **never stored or synced**. It's
computed by `replay(log)`, as the app already did. Why:

- Union of reviews + deterministic replay means two devices that reviewed the same card offline
  both count. Their reviews interleave by time and both devices compute the identical state. With
  "newest stored state wins", one device's reviews would be silently thrown away.
- **Undo** removes exactly one review. Locally that's a tombstone for its id. Replaying without
  it gives exactly the pre-rating state, on this device and on every device that pulls the
  tombstone. A stored-state model would need an inverse operation that could disagree with the log.
- Cost: replay is O(reviews). It already runs on every render, so nothing changes.

## Local storage and concurrency

All mutations go through `LogStorage` operations that run as **single IndexedDB transactions over
data + sync meta**:

- `append(event)`: rating.
- `remove(ids)`: undo or clear demo; syncable ids become tombstones.
- `importDecks(data, events)`: the events are *unioned* with what is stored, never replaced.
- `write(events)`: legacy and seeding; removals of syncable ids become tombstones.

Each one stamps changes and bumps `meta.rev` in the same transaction, so data and its sync
bookkeeping can never disagree after a crash.

The UI now uses `append` and `remove` (base-free operations) instead of writing back its whole
in-memory log. A sync that lands between two ratings can therefore never be clobbered by a stale
React state.

The sync engine reads a snapshot, merges in memory, and commits with `expectedRev`. If a rating
happened in between, the commit is refused and the merge is redone on a fresh snapshot.

## Sync cycle (`SyncEngine.sync()`)

1. Load the local snapshot and `UidMeta`. Reconcile settings: if the hash of the settings in
   `localStorage` differs from the meta, stamp a local edit.
2. **Pull** `records` and `reviews` with `srv > cursor − 2 min`. The 2-minute overlap is the
   safety window for server-timestamp ordering around the cursor. Re-reading a doc is harmless
   because the merge is idempotent. Pages hold 500 docs. The first sync for a uid on this device
   pulls from 0.
3. **Merge** (pure `mergePulled`), then commit locally with the rev check. On the first sync the
   whole cloud state is known, so every local record or review that the cloud doesn't have, or
   that beats the cloud's version, is queued.
4. Save the cursors, but only after the local commit, so a crash re-pulls instead of skipping.
5. **Push** the dirty records, pending reviews and tombstones. They're grouped one write per record
   doc and one merge-write per day bucket, ordered settings → subjects → decks → cards →
   reviews, and split into batches of at most 500 writes. Each batch is atomic. After each batch,
   exactly the items in it are marked clean, and only if they're unchanged since they were sent.
6. Set `initialized` once a first sync's push has fully succeeded.

Scheduling:

- After a local change, debounce 15 s, with a maximum wait of 60 s.
- When the page is hidden or on `pagehide`: best effort, immediately.
- On becoming visible, on `online`, and every 5 minutes while visible: pull.
- On "Sync now".
- One cycle at a time per tab, plus `navigator.locks` across tabs where available.
- Cloud calls time out after 30 s and report "Offline, will sync". No per-keystroke or per-render
  writes.

## Accounts

- **First sign-in on a device** (`binding = null`): bind the active local data to this uid and run
  the first sync, a full merge both ways. Nothing local or in the cloud is deleted. This is the
  only case where pre-existing local data is uploaded.
- **Same account again** (`binding = uid`): normal incremental sync. Changes made while signed out
  were tracked (`bound = true`) and upload now.
- **Sign-out:** first a flush with a short timeout. Local data stays on the device, still bound to
  that account, and the app keeps working. If changes are still pending (for example offline),
  the UI says so before signing out. They stay queued for that account.
- **A different account signs in** (`binding = A`, new uid `B`):
  1. In one transaction, A's active data (decks, log, meta, pending lists, settings) is moved to
     `stash:A`.
  2. B's stash is restored if it exists. Otherwise the device starts empty for B (demo only), and
     the current appearance is kept as an unstamped baseline, so it's not uploaded into B.
  3. B syncs.

  A's data is never uploaded into B. When A signs in again the stashes swap back, and A's pending
  changes upload then.
- Cursors and `initialized` are per uid (`uid:<uid>`), so A's cursor can never make B skip data.

## Quota estimate (Spark: 50k reads / 20k writes per day)

**Typical day** (about 300 reviews in 3 sessions on 2 devices, a few settings tweaks):

- **Writes.** Reviews go into today's bucket. With a 60 s max-wait that's at most about 1 write per
  minute of studying, so a 30-minute session is about 30 writes, plus 1 per page-hide. That comes
  to about 100 writes per day.
- **Reads.** Each pull is 2 queries, and an empty query bills 1 read. Polling every 5 minutes for
  10 visible hours is about 240 reads. Re-reading our own and the other device's changed buckets
  adds about 200 more. That's under 1,000 reads per day per device.

**First sync of about 3,000 cards plus history** (for example 30,000 Anki reviews over 400 days):

- **Writes:** 1 settings + about 20 subjects/decks + 3,000 cards + 400 day buckets = about 3,420
  writes in 7 batches, once.
- **First pull on each further device:** about 3,420 reads.
- **Worst case** (100k reviews over 3 years): about 4,100 writes or reads.

After any push, the next pull re-reads the docs we just wrote, about +1 read per write (see the
review costs below).

**Re-importing an updated deck** costs one write per *changed* card only, because of hash
detection.

**Storage:** cards about 1 KB each (3 MB) plus reviews about 150 B each (4.5 MB). That's well under
1 GiB.

## Failure modes and answers

| Scenario | What happens |
| --- | --- |
| Two devices edit the same card | Higher `(u, dev, h)` wins on both. An edit made after seeing the other version always wins (hybrid clock). |
| Both devices review offline | Union of both logs; FSRS state replayed identically everywhere; no duplicates (ids). |
| Clock skew | LWW is only affected for truly concurrent edits. The cursor uses server time with a 2-minute overlap, so skew never skips data. |
| Delete vs edit | Tombstone is a versioned record: newer wins in both orders. |
| Crash or offline mid-push (partial batches) | Each batch is atomic. Unconfirmed items stay dirty and are re-sent (idempotent). Parents are written before children, and placeholders cover orphans. |
| Crash mid-pull or before the cursor is saved | The cursor only advances after the local commit. Re-pull plus idempotent merge. |
| Rating during a sync | The rev check refuses the stale commit, and the merge is redone on fresh data. |
| Stale device overwrites a newer cloud record | The newer device pulls it, sees that its local version wins, marks it dirty and re-pushes. Convergence. |
| Undo after the review already synced | Tombstone in `d`. Every device drops the entry and re-derives FSRS. |
| Sign-out with a pending outbox | The queue is kept and bound to that account, and uploads on its next sign-in. The UI warns before signing out. |
| A different account on the same device | Stash swap. No cross-account upload or display. |
| Demo data | Filtered out by `demo` flag and demo card ids before anything is queued or pushed. |
| Firestore doc limits | Records are far under 1 MiB, and a record over 900 KB is skipped with an error status rather than failing the batch. Buckets are per day. |
| Missing Firebase config | `firebaseConfig()` returns null, the account section is not rendered, and Firebase is never imported. |

## Known limitations

- Media isn't synced (see above).
- LWW is per card, not per field. Concurrent re-imports of different versions of the same note on
  two devices keep one whole version.
- Another uid's stash stays on the device until that account signs in again. Nothing is deleted
  automatically.
- iOS standalone PWAs use `signInWithRedirect`. With the app on `github.io` and `authDomain` on
  `firebaseapp.com`, Safari's storage partitioning can break redirect sign-in. If that happens,
  sign in once in Safari itself, or serve the auth handler from the app's own domain.

## Adversarial review (after implementation)

Every scenario below is a test in `src/sync/sync.test.ts` or `src/sync/merge.test.ts`, unless
marked otherwise. The key rules were mutation-tested: disabling each one makes at least one test
fail. The rules covered are the tombstone check, repair push, hybrid clock, demo card filter,
first-sync upload, conditional `markPushed`, skew window and the storage binding check.

| Attack | Result |
| --- | --- |
| Two devices edit the same card offline | The later edit wins on both. A device whose clock is far *behind* still wins when it edits after seeing the other version (hybrid clock). |
| Both devices review offline, plus the same `.apkg` history imported on both | Exact union, no duplicates (deterministic Anki ids), identical `isNew`, identical FSRS replay on both. |
| Delete vs edit, both orders | The newer change wins on both devices. A later edit resurrects a deleted card. |
| Undo after the review synced, then a stale client re-uploads it | It stays undone everywhere, because `d[id]` is grow-only. |
| First sign-in, local legacy data plus existing cloud data | Union of cards and reviews. A newer cloud version beats legacy local. Untouched default settings don't override the cloud. |
| Account B signs in on A's device, with A changes pending | B sees an empty device. B's cloud contains nothing of A's. B can't read A's tree. A gets its data and pending changes back on return, uploaded only to A. |
| **B signs in while A's sync is mid-flight** | **Found a leak during review:** A's retry would merge A's cloud docs into B's fresh partition, and later push them to B. Fixed: `commit` and `markPushed` verify `binding == uid` inside the transaction, remote settings are saved inside that checked transaction, and a stopped engine's status and callbacks are ignored. |
| Sign-out with a pending queue (offline), keep studying, sign in again | Everything is uploaded on return (`prep = 'same'`). |
| Crash or network loss between batches | Unconfirmed items stay dirty. The next run completes, and a fresh device gets exactly 700 cards and 1 review. |
| Edit lands while its batch is in flight | `markPushed` only clears an unchanged version, so the edit uploads on the next run. |
| Rating during a sync | The rev check refuses the stale commit, the merge is redone, and the rating survives and uploads. |
| A stale client blindly overwrites a newer cloud record | The newer device repairs it on its next sync. A fresh device gets the newest version. |
| A doc that becomes visible with a server time just below our cursor | Picked up by the 2-minute overlap window. |
| Re-sync twice | Zero writes. Cloud docs and local data are byte-identical. |
| Demo data | Demo history, reviews of demo cards and demo decks never reach the cloud. |
| 1,200-card first upload | Batches of 500, 500 and 203. |
| Missing config | Account section renders nothing and Firebase is never imported (jsdom test). |
| Duplicate auth callbacks | A `preparing` guard stops a second engine or poller from starting for the same uid. (Code review; not unit-tested.) |

Emulator proof (`npm run test:emulator`): two real Firebase clients signed in as one emulator user
exchange offline reviews and edits through Firestore, including a review id containing `.`
and `:` as a map key. A second sync writes nothing. Another user, and a signed-out client, get
`permission-denied` from `firestore.rules` for reads, queries and writes.

### Costs found in review

- After pushing, the next pull re-reads our own just-written docs, because the cursor is set by
  the pull, not the push. That's about +1 read per write: roughly 100 per day normally, and
  +3,400 once after a first upload of 3,000 cards. Both stay far inside quota.
- Cards are ordered by `pos`. Inserting a card in the *middle* of an existing lecture re-stamps the
  cards after it (one write each, once). New Anki notes normally append at the end, so this is
  rare.
- Firestore **Lite** (REST, no local cache) is used. Our IndexedDB outbox already covers offline,
  and Lite cut the lazy Firebase chunk from 713 kB to 312 kB.
