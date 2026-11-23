/**
 * Pure sync core: record decomposition, change stamping, merge and push planning.
 * No Firebase imports and no I/O, so every rule in docs/sync-model.md is unit-testable.
 */
import type { ImportedData } from '../anki/types';
import type { Lecture, Subject } from '../demoSubjects';
import type { Rating, ReviewEvent } from '../reviewLog';
import { sanitizeSettings, type AppearanceSettings } from '../settings';

export type RecordCollection = 'subject' | 'deck' | 'card' | 'settings';
export type RecordKey = string; // `${collection}~${encodeURIComponent(id)}`, also the Firestore doc id

export interface RecMeta {
  u: number;
  dev: string;
  h: string;
  del?: true;
  dirty?: true;
}

export interface SyncMeta {
  v: 1;
  deviceId: string;
  rev: number;
  bound: boolean;
  records: Record<RecordKey, RecMeta>;
  tombs: Record<string, string>;
  pendingReviews: string[];
  pendingTombs: string[];
}

export interface UidMeta {
  initialized: boolean;
  cursorRecords: number;
  cursorReviews: number;
  lastSyncedAt?: number;
}

export interface SyncState {
  data: ImportedData | null;
  events: ReviewEvent[];
  settings: AppearanceSettings | null;
  meta: SyncMeta;
}

export interface SyncRecord {
  c: RecordCollection;
  id: string;
  d: Record<string, unknown>;
}

/** Firestore-agnostic document as returned by a pull. `srv` is server time in ms. */
export interface CloudDoc {
  id: string;
  data: Record<string, unknown>;
  srv: number;
}

export type CloudCollection = 'records' | 'reviews';

export interface CloudWrite {
  collection: CloudCollection;
  id: string;
  data: Record<string, unknown>;
  merge: boolean;
}

export type PushItem =
  | { kind: 'record'; key: RecordKey; u: number; dev: string; write: CloudWrite; bytes: number }
  | { kind: 'bucket'; reviewIds: string[]; tombIds: string[]; write: CloudWrite; bytes: number };

export const SETTINGS_KEY: RecordKey = 'settings~appearance';
export const MAX_BATCH_WRITES = 500;
export const MAX_BATCH_BYTES = 8_000_000;
export const MAX_RECORD_BYTES = 900_000;
export const LEGACY_U = 1;
/** Baseline that is never uploaded and loses to any real version (fresh account partition). */
export const BASELINE_U = 0;

// ---------------------------------------------------------------------------
// Hashing and keys

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value instanceof Uint8Array) return `"<bytes:${value.length}>"`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

/** 64-bit FNV-1a as hex; for change detection only. */
export function hashValue(value: unknown): string {
  const s = stableStringify(value);
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x5bd1e995);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

export const recordKey = (c: RecordCollection, id: string): RecordKey => `${c}~${encodeURIComponent(id)}`;

export function parseRecordKey(key: string): { c: RecordCollection; id: string } | null {
  const i = key.indexOf('~');
  const c = key.slice(0, i) as RecordCollection;
  if (i < 1 || !['subject', 'deck', 'card', 'settings'].includes(c)) return null;
  try {
    return { c, id: decodeURIComponent(key.slice(i + 1)) };
  } catch {
    return null;
  }
}

/** Total order for record versions: (u, dev, h). */
export function compareVersion(a: Pick<RecMeta, 'u' | 'dev' | 'h'>, b: Pick<RecMeta, 'u' | 'dev' | 'h'>): number {
  if (a.u !== b.u) return a.u < b.u ? -1 : 1;
  if (a.dev !== b.dev) return a.dev < b.dev ? -1 : 1;
  if (a.h !== b.h) return a.h < b.h ? -1 : 1;
  return 0;
}

export function emptyMeta(deviceId: string, bound = false): SyncMeta {
  return { v: 1, deviceId, rev: 0, bound, records: {}, tombs: {}, pendingReviews: [], pendingTombs: [] };
}

// ---------------------------------------------------------------------------
// Decompose / materialize

/** Imported blob -> per-record map. Placeholders created by materialize are never records. */
export function decompose(data: ImportedData | null): Map<RecordKey, SyncRecord> {
  const out = new Map<RecordKey, SyncRecord>();
  if (!data) return out;
  data.subjects.forEach((subject, si) => {
    const { lectures, total: _total, ...subjectRest } = subject;
    if (!subject.syncPlaceholder) out.set(recordKey('subject', subject.id), { c: 'subject', id: subject.id, d: { ...subjectRest, pos: si } });
    lectures.forEach((lecture, li) => {
      const { cards, ...lectureRest } = lecture;
      const deckId = `${subject.id}/${lecture.id}`;
      if (!lecture.syncPlaceholder)
        out.set(recordKey('deck', deckId), { c: 'deck', id: deckId, d: { ...lectureRest, subjectId: subject.id, pos: li } });
      cards.forEach((card, ci) => {
        const id = card.stableId ?? `${subject.id}/${lecture.id}/${card.id}`;
        out.set(recordKey('card', id), { c: 'card', id, d: { ...card, subjectId: subject.id, lessonId: lecture.id, pos: ci } });
      });
    });
  });
  return out;
}

const byPos = (a: SyncRecord, b: SyncRecord) =>
  (Number(a.d.pos) || 0) - (Number(b.d.pos) || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Live records -> imported blob, keeping local media and package metadata from `base`. */
export function materialize(records: Iterable<SyncRecord>, base: ImportedData | null): ImportedData | null {
  const subjects: SyncRecord[] = [], decks: SyncRecord[] = [], cards: SyncRecord[] = [];
  for (const r of records) (r.c === 'subject' ? subjects : r.c === 'deck' ? decks : r.c === 'card' ? cards : []).push(r);
  if (!subjects.length && !decks.length && !cards.length && !base) return null;

  const subjectMap = new Map<string, Subject>();
  const lectureMap = new Map<string, Lecture>();
  const strip = (d: Record<string, unknown>, ...keys: string[]) => {
    const copy = { ...d };
    for (const k of keys) delete copy[k];
    return copy;
  };
  const ensureSubject = (id: string): Subject => {
    let s = subjectMap.get(id);
    if (!s) {
      s = { id, name: id, total: 0, lectures: [], syncPlaceholder: true };
      subjectMap.set(id, s);
    }
    return s;
  };
  const ensureLecture = (subjectId: string, lectureId: string): Lecture => {
    const key = `${subjectId}/${lectureId}`;
    let l = lectureMap.get(key);
    if (!l) {
      l = { id: lectureId, title: lectureId, cards: [], syncPlaceholder: true };
      lectureMap.set(key, l);
      ensureSubject(subjectId).lectures.push(l);
    }
    return l;
  };
  for (const r of [...subjects].sort(byPos))
    subjectMap.set(r.id, { ...(strip(r.d, 'pos') as unknown as Subject), id: r.id, total: 0, lectures: [] });
  for (const r of [...decks].sort(byPos)) {
    const subjectId = String(r.d.subjectId ?? r.id.split('/')[0]);
    const lecture = { ...(strip(r.d, 'pos', 'subjectId') as unknown as Lecture), cards: [] } as Lecture;
    lectureMap.set(`${subjectId}/${lecture.id}`, lecture);
    ensureSubject(subjectId).lectures.push(lecture);
  }
  for (const r of [...cards].sort(byPos)) {
    const lecture = ensureLecture(String(r.d.subjectId), String(r.d.lessonId));
    lecture.cards.push(strip(r.d, 'pos', 'subjectId', 'lessonId') as never);
  }
  const ordered = [
    ...[...subjects].sort(byPos).map((r) => subjectMap.get(r.id)!),
    ...[...subjectMap.values()].filter((s) => s.syncPlaceholder),
  ];
  for (const s of ordered) s.total = s.lectures.reduce((n, l) => n + l.cards.length, 0);
  const guids = new Set(ordered.flatMap((s) => s.lectures.flatMap((l) => l.cards.map((c) => (c as { guid?: string }).guid ?? c.id))));
  return {
    media: base?.media ?? {},
    packageName: base?.packageName ?? 'Synced',
    revlog: base?.revlog ?? [],
    warnings: base?.warnings ?? [],
    subjects: ordered,
    notes: guids.size,
  };
}

// ---------------------------------------------------------------------------
// Local stamping (called inside the same IndexedDB transaction as the data write)

const nextU = (now: number, prev?: RecMeta) => Math.max(now, (prev?.u ?? 0) + 1);

export function cloneMeta(meta: SyncMeta): SyncMeta {
  return {
    ...meta,
    records: { ...meta.records },
    tombs: { ...meta.tombs },
    pendingReviews: [...meta.pendingReviews],
    pendingTombs: [...meta.pendingTombs],
  };
}

/** Records that existed before sync: stamped as legacy so newer cloud versions win on first sign-in. */
export function migrateMeta(deviceId: string, data: ImportedData | null, settings: AppearanceSettings | null): SyncMeta {
  const meta = emptyMeta(deviceId);
  for (const [key, rec] of decompose(data)) meta.records[key] = { u: LEGACY_U, dev: deviceId, h: hashValue(rec.d) };
  if (settings) meta.records[SETTINGS_KEY] = { u: LEGACY_U, dev: deviceId, h: hashValue(settings) };
  return meta;
}

export function stampDecks(meta: SyncMeta, prev: ImportedData | null, next: ImportedData | null, now: number): SyncMeta {
  const out = cloneMeta(meta);
  const before = decompose(prev), after = decompose(next);
  for (const [key, rec] of after) {
    const h = hashValue(rec.d), m = out.records[key];
    if (!m || m.del || m.h !== h) out.records[key] = { u: nextU(now, m), dev: meta.deviceId, h, dirty: true };
  }
  for (const key of before.keys()) {
    if (after.has(key)) continue;
    const m = out.records[key];
    if (!m?.del) out.records[key] = { u: nextU(now, m), dev: meta.deviceId, h: '', del: true, dirty: true };
  }
  return out;
}

export function stampSettings(meta: SyncMeta, settings: AppearanceSettings, now: number): SyncMeta {
  const h = hashValue(settings), m = meta.records[SETTINGS_KEY];
  if (m && m.h === h && !m.del) return meta;
  const out = cloneMeta(meta);
  out.records[SETTINGS_KEY] = m
    ? { u: nextU(now, m), dev: meta.deviceId, h, dirty: true }
    : { u: LEGACY_U, dev: meta.deviceId, h };
  return out;
}

export type IsSyncable = (e: ReviewEvent) => boolean;

export const makeIsSyncable = (demoCardIds: ReadonlySet<string>): IsSyncable =>
  (e) => !e.demo && !demoCardIds.has(e.cardId);

export function stampEvents(meta: SyncMeta, prev: readonly ReviewEvent[], next: readonly ReviewEvent[], isSyncable: IsSyncable): SyncMeta {
  const prevIds = new Set(prev.map((e) => e.id)), nextIds = new Set(next.map((e) => e.id));
  const added = next.filter((e) => !prevIds.has(e.id) && isSyncable(e));
  const removed = prev.filter((e) => !nextIds.has(e.id) && isSyncable(e));
  if (!added.length && !removed.length) return meta;
  const out = cloneMeta(meta);
  const pending = new Set(out.pendingReviews), pendingTombs = new Set(out.pendingTombs);
  if (out.bound) for (const e of added) if (!out.tombs[e.id]) pending.add(e.id);
  for (const e of removed) {
    out.tombs[e.id] = e.at;
    pending.delete(e.id);
    if (out.bound) pendingTombs.add(e.id);
  }
  out.pendingReviews = [...pending];
  out.pendingTombs = [...pendingTombs];
  return out;
}

// ---------------------------------------------------------------------------
// Review log

const RATINGS: readonly Rating[] = ['again', 'hard', 'good', 'easy'];

/** Deterministic id for any legacy entry that predates ids. */
export const legacyReviewId = (e: Pick<ReviewEvent, 'cardId' | 'at' | 'rating'>) => `legacy:${e.cardId}:${e.at}:${e.rating}`;

/** Dedupe by id, sort by (at, id), recompute isNew = first live review of the card. */
export function canonicalLog(events: readonly ReviewEvent[]): ReviewEvent[] {
  const byId = new Map<string, ReviewEvent>();
  for (const e of events) if (!byId.has(e.id)) byId.set(e.id, e);
  const sorted = [...byId.values()].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const seen = new Set<string>();
  return sorted.map((e) => {
    const isNew = !seen.has(e.cardId);
    seen.add(e.cardId);
    return e.isNew === isNew ? e : { ...e, isNew };
  });
}

export const reviewBucket = (at: string) => {
  const t = Date.parse(at);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : 'unknown';
};

export function encodeReview(e: ReviewEvent): string {
  return JSON.stringify({
    c: e.cardId, s: e.subjectId, l: e.lessonId, r: e.rating, t: e.at, ms: e.durationMs,
    ...(e.retention !== undefined ? { ret: e.retention } : {}),
    ...(e.fuzz !== undefined ? { fz: e.fuzz } : {}),
    ...(e.source ? { src: e.source } : {}),
  });
}

export function decodeReview(id: string, raw: unknown): ReviewEvent | null {
  if (typeof raw !== 'string') return null;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o.c !== 'string' || typeof o.s !== 'string' || typeof o.l !== 'string' ||
      !RATINGS.includes(o.r) || typeof o.t !== 'string' || !Number.isFinite(Date.parse(o.t))) return null;
    return {
      id, cardId: o.c, subjectId: o.s, lessonId: o.l, rating: o.r, at: o.t,
      durationMs: Number.isFinite(o.ms) ? o.ms : 0, isNew: false,
      ...(typeof o.ret === 'number' ? { retention: o.ret } : {}),
      ...(typeof o.fz === 'boolean' ? { fuzz: o.fz } : {}),
      ...(o.src === 'anki' ? { source: 'anki' as const } : {}),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Merge pulled cloud docs into local state

function readRecordDoc(doc: CloudDoc): (RecMeta & { key: RecordKey; c: RecordCollection; id: string; d: Record<string, unknown> | null }) | null {
  const parsed = parseRecordKey(doc.id), x = doc.data;
  if (!parsed || typeof x.u !== 'number' || typeof x.dev !== 'string' || typeof x.h !== 'string') return null;
  const del = x.del === true;
  if (!del && (!x.d || typeof x.d !== 'object')) return null;
  return { key: doc.id, c: parsed.c, id: parsed.id, u: x.u, dev: x.dev, h: x.h, ...(del ? { del: true as const } : {}), d: del ? null : (x.d as Record<string, unknown>) };
}

export interface MergeResult {
  state: SyncState;
  changed: { data: boolean; events: boolean; settings: boolean };
}

/**
 * Merge pulled docs. `full` means the pull covered the whole cloud state (first sync for this
 * account on this device), so anything local that the cloud lacks or loses to is queued for upload.
 */
export function mergePulled(
  state: SyncState,
  pulled: { records: readonly CloudDoc[]; reviews: readonly CloudDoc[] },
  opts: { full: boolean; isSyncable: IsSyncable },
): MergeResult {
  const meta = cloneMeta(state.meta);
  const live = decompose(state.data);
  let dataChanged = false, settingsChanged = false, settings = state.settings;
  const seen = new Set<RecordKey>(), won = new Set<RecordKey>();

  for (const doc of pulled.records) {
    const r = readRecordDoc(doc);
    if (!r) continue;
    seen.add(r.key);
    const local = meta.records[r.key];
    const cmp = local ? compareVersion(r, local) : 1;
    if (cmp > 0) {
      meta.records[r.key] = { u: r.u, dev: r.dev, h: r.d ? hashValue(r.d) : '', ...(r.del ? { del: true as const } : {}) };
      if (r.c === 'settings') {
        if (r.d) {
          const next = sanitizeSettings(r.d);
          meta.records[r.key].h = hashValue(next);
          if (!settings || hashValue(settings) !== hashValue(next)) { settings = next; settingsChanged = true; }
        }
      } else if (r.del) {
        if (live.delete(r.key)) dataChanged = true;
      } else {
        const prev = live.get(r.key);
        if (!prev || hashValue(prev.d) !== hashValue(r.d)) { live.set(r.key, { c: r.c, id: r.id, d: r.d! }); dataChanged = true; won.add(r.key); }
      }
    } else if (cmp < 0) {
      if (local.u > BASELINE_U) meta.records[r.key] = { ...local, dirty: true }; // repair a stale cloud doc
    } else if (local.dirty) {
      const { dirty: _d, ...clean } = local;
      meta.records[r.key] = clean; // cloud already holds exactly this version
    }
  }
  if (opts.full) {
    for (const [key, m] of Object.entries(meta.records))
      if (!seen.has(key) && m.u > BASELINE_U && !m.dirty) meta.records[key] = { ...m, dirty: true };
    for (const [key, rec] of live)
      if (!meta.records[key]) meta.records[key] = { u: LEGACY_U, dev: meta.deviceId, h: hashValue(rec.d), dirty: true };
  }

  let data = state.data;
  if (dataChanged) {
    data = materialize(live.values(), state.data);
    // Absorb harmless normalisation (e.g. pos renumbering) so it is not mistaken for a local edit.
    const again = decompose(data);
    for (const key of won) {
      const rec = again.get(key);
      if (rec && meta.records[key]) meta.records[key].h = hashValue(rec.d);
    }
  }

  // Reviews: grow-only union minus grow-only tombstones.
  const byId = new Map(state.events.map((e) => [e.id, e]));
  const cloudE = new Set<string>(), cloudD = new Set<string>();
  let eventsChanged = false;
  for (const doc of pulled.reviews) {
    const e = (doc.data.e ?? {}) as Record<string, unknown>;
    const d = (doc.data.d ?? {}) as Record<string, unknown>;
    for (const id of Object.keys(d)) {
      if (d[id] !== true) continue;
      cloudD.add(id);
      if (!meta.tombs[id]) meta.tombs[id] = byId.get(id)?.at ?? decodeReview(id, e[id])?.at ?? doc.id;
      if (byId.delete(id)) eventsChanged = true;
    }
    for (const [id, raw] of Object.entries(e)) {
      cloudE.add(id);
      if (meta.tombs[id] || byId.has(id)) continue;
      const ev = decodeReview(id, raw);
      if (ev) { byId.set(id, ev); eventsChanged = true; }
    }
  }
  const pending = new Set(meta.pendingReviews.filter((id) => !cloudE.has(id) && !meta.tombs[id]));
  const pendingTombs = new Set(meta.pendingTombs.filter((id) => !cloudD.has(id)));
  if (opts.full) {
    for (const ev of byId.values()) if (!cloudE.has(ev.id) && opts.isSyncable(ev)) pending.add(ev.id);
    for (const id of Object.keys(meta.tombs)) if (!cloudD.has(id)) pendingTombs.add(id);
  }
  meta.pendingReviews = [...pending];
  meta.pendingTombs = [...pendingTombs];
  const events = eventsChanged ? canonicalLog([...byId.values()]) : state.events;

  return {
    state: { data, events, settings, meta },
    changed: { data: dataChanged, events: eventsChanged, settings: settingsChanged },
  };
}

// ---------------------------------------------------------------------------
// Push planning

const RANK: Record<RecordCollection, number> = { settings: 0, subject: 1, deck: 2, card: 3 };

export interface PushPlan {
  items: PushItem[];
  /** Pending review ids that no longer need uploading (gone or not syncable). */
  stale: string[];
  /** Dirty records with no local data to send (not materialised); their flag is cleared. */
  staleRecords: RecordKey[];
  /** Records too large for a Firestore document; left dirty and reported. */
  oversize: RecordKey[];
}

export function planPush(state: SyncState, isSyncable: IsSyncable): PushPlan {
  const { meta } = state;
  const live = decompose(state.data);
  const records: PushItem[] = [], oversize: RecordKey[] = [], staleRecords: RecordKey[] = [];
  for (const [key, m] of Object.entries(meta.records)) {
    if (!m.dirty || m.u <= BASELINE_U) continue;
    const parsed = parseRecordKey(key);
    if (!parsed) continue;
    const d = m.del ? null : parsed.c === 'settings' ? (state.settings as unknown as Record<string, unknown> | null) : (live.get(key)?.d ?? null);
    if (!m.del && !d) { staleRecords.push(key); continue; }
    const data = { c: parsed.c, id: parsed.id, u: m.u, dev: m.dev, h: m.h, ...(m.del ? { del: true } : {}), d };
    const bytes = JSON.stringify(data).length;
    if (bytes > MAX_RECORD_BYTES) { oversize.push(key); continue; }
    records.push({ kind: 'record', key, u: m.u, dev: m.dev, bytes, write: { collection: 'records', id: key, data, merge: false } });
  }
  const keyOf = (i: PushItem) => (i.kind === 'record' ? i.key : '');
  records.sort((a, b) => {
    const ca = parseRecordKey(keyOf(a))!.c, cb = parseRecordKey(keyOf(b))!.c;
    return RANK[ca] - RANK[cb] || (keyOf(a) < keyOf(b) ? -1 : 1);
  });

  const byId = new Map(state.events.map((e) => [e.id, e]));
  const buckets = new Map<string, { e: Record<string, string>; d: Record<string, true>; reviewIds: string[]; tombIds: string[] }>();
  const bucket = (day: string) => {
    let b = buckets.get(day);
    if (!b) buckets.set(day, (b = { e: {}, d: {}, reviewIds: [], tombIds: [] }));
    return b;
  };
  const stale: string[] = [];
  for (const id of meta.pendingReviews) {
    const ev = byId.get(id);
    if (!ev || !isSyncable(ev) || meta.tombs[id]) { stale.push(id); continue; }
    const b = bucket(reviewBucket(ev.at));
    b.e[id] = encodeReview(ev);
    b.reviewIds.push(id);
  }
  for (const id of meta.pendingTombs) {
    const b = bucket(reviewBucket(meta.tombs[id] ?? ''));
    b.d[id] = true;
    b.tombIds.push(id);
  }
  const reviews: PushItem[] = [...buckets.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, b]) => {
    const data: Record<string, unknown> = {};
    if (b.reviewIds.length) data.e = b.e;
    if (b.tombIds.length) data.d = b.d;
    return { kind: 'bucket', reviewIds: b.reviewIds, tombIds: b.tombIds, bytes: JSON.stringify(data).length, write: { collection: 'reviews', id: day, data, merge: true } };
  });
  return { items: [...records, ...reviews], stale, staleRecords, oversize };
}

/** Split into Firestore batches: at most 500 writes and ~8 MB each. */
export function chunk<T extends { bytes: number }>(items: readonly T[], maxWrites = MAX_BATCH_WRITES, maxBytes = MAX_BATCH_BYTES): T[][] {
  const out: T[][] = [];
  let cur: T[] = [], size = 0;
  for (const item of items) {
    if (cur.length && (cur.length >= maxWrites || size + item.bytes > maxBytes)) { out.push(cur); cur = []; size = 0; }
    cur.push(item);
    size += item.bytes;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Clear exactly what a committed batch confirmed, and only if unchanged since it was sent. */
export function markPushed(meta: SyncMeta, items: readonly PushItem[], stale: readonly string[] = [], staleRecords: readonly RecordKey[] = []): SyncMeta {
  const out = cloneMeta(meta);
  for (const key of staleRecords) {
    const m = out.records[key];
    if (m?.dirty) { const { dirty: _d, ...clean } = m; out.records[key] = clean; }
  }
  const doneReviews = new Set(stale), doneTombs = new Set<string>();
  for (const item of items) {
    if (item.kind === 'record') {
      const m = out.records[item.key];
      if (m && m.dirty && m.u === item.u && m.dev === item.dev) {
        const { dirty: _d, ...clean } = m;
        out.records[item.key] = clean;
      }
    } else {
      item.reviewIds.forEach((id) => doneReviews.add(id));
      item.tombIds.forEach((id) => doneTombs.add(id));
    }
  }
  out.pendingReviews = out.pendingReviews.filter((id) => !doneReviews.has(id));
  out.pendingTombs = out.pendingTombs.filter((id) => !doneTombs.has(id));
  return out;
}

export function pendingCount(meta: SyncMeta): number {
  let n = meta.pendingReviews.length + meta.pendingTombs.length;
  for (const m of Object.values(meta.records)) if (m.dirty && m.u > BASELINE_U) n++;
  return n;
}
