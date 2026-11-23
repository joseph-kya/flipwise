import { describe, expect, it } from 'vitest';
import { seedDemoHistory } from '../insights/seedDemoHistory';
import { withStableId } from '../reviewLog';
import { DEFAULT_SETTINGS } from '../settings';
import { isSyncableReview } from './demo';
import {
  canonicalLog,
  chunk,
  compareVersion,
  decodeReview,
  decompose,
  emptyMeta,
  encodeReview,
  hashValue,
  materialize,
  mergePulled,
  planPush,
  recordKey,
  stampDecks,
  stampEvents,
  type CloudDoc,
  type SyncState,
} from './merge';
import { card, cardIds, deck, frontOf, review } from './testkit';

const state = (over: Partial<SyncState> = {}): SyncState => ({
  data: null, events: [], settings: { ...DEFAULT_SETTINGS }, meta: emptyMeta('dev-a', true), ...over,
});
const recordDoc = (c: 'card' | 'subject' | 'deck', id: string, u: number, dev: string, d: Record<string, unknown> | null, srv = 1): CloudDoc => ({
  id: recordKey(c, id), srv, data: { c, id, u, dev, h: d ? hashValue(d) : '', ...(d ? { d } : { del: true, d: null }) },
});

describe('records', () => {
  it('round-trips the imported blob through records without loss', () => {
    const data = deck([card(1), card(2), card(3, 'Q3', 'L2')]);
    const back = materialize(decompose(data).values(), data)!;
    expect(back.subjects).toEqual(data.subjects);
    expect(decompose(back)).toEqual(decompose(data));
  });

  it('orders versions by (u, dev, h) deterministically', () => {
    expect(compareVersion({ u: 2, dev: 'a', h: 'x' }, { u: 1, dev: 'z', h: 'x' })).toBe(1);
    expect(compareVersion({ u: 2, dev: 'a', h: 'x' }, { u: 2, dev: 'b', h: 'x' })).toBe(-1);
    expect(compareVersion({ u: 2, dev: 'a', h: 'x' }, { u: 2, dev: 'a', h: 'x' })).toBe(0);
  });

  it('stamps only changed records and uses a hybrid clock that beats what it has seen', () => {
    const base = deck([card(1), card(2)]);
    let meta = stampDecks(emptyMeta('dev-a'), null, base, 100);
    const u1 = meta.records[recordKey('card', 'anki:g1:0')].u;
    // Same content again: nothing is restamped.
    expect(stampDecks(meta, base, deck([card(1), card(2)]), 500)).toEqual(meta);
    // Pretend we pulled a version from a device whose clock is far ahead.
    meta.records[recordKey('card', 'anki:g1:0')] = { u: 9_999_999, dev: 'dev-b', h: 'remote' };
    meta = stampDecks(meta, base, deck([card(1, 'edited'), card(2)]), 200);
    expect(meta.records[recordKey('card', 'anki:g1:0')].u).toBe(10_000_000);
    expect(meta.records[recordKey('card', 'anki:g2:0')].u).toBe(u1);
  });

  it('turns a removed card into a tombstone', () => {
    const meta = stampDecks(stampDecks(emptyMeta('dev-a'), null, deck([card(1), card(2)]), 100), deck([card(1), card(2)]), deck([card(1)]), 200);
    expect(meta.records[recordKey('card', 'anki:g2:0')]).toMatchObject({ del: true, u: 200, dirty: true });
  });

  it('delete vs edit: the newer version wins in either order', () => {
    const data = deck([card(1), card(2)]);
    const meta = stampDecks(emptyMeta('dev-a'), null, data, 100);
    const local = state({ data, meta });
    // Older remote delete loses to our newer edit.
    const editedMeta = stampDecks(meta, data, deck([card(1), card(2, 'edited')]), 300);
    const edited = state({ data: deck([card(1), card(2, 'edited')]), meta: editedMeta });
    const r1 = mergePulled(edited, { records: [recordDoc('card', 'anki:g2:0', 200, 'dev-b', null)], reviews: [] }, { full: false, isSyncable: isSyncableReview });
    expect(frontOf(r1.state.data, 2)).toBe('edited');
    expect(r1.state.meta.records[recordKey('card', 'anki:g2:0')].dirty).toBe(true);
    // Newer remote delete beats our older version.
    const r2 = mergePulled(local, { records: [recordDoc('card', 'anki:g2:0', 400, 'dev-b', null)], reviews: [] }, { full: false, isSyncable: isSyncableReview });
    expect(cardIds(r2.state.data)).toEqual(['anki:g1:0']);
    // ...and a later edit resurrects it.
    const later = { ...decompose(deck([card(2, 'back')])).get(recordKey('card', 'anki:g2:0'))!.d };
    const r3 = mergePulled(r2.state, { records: [recordDoc('card', 'anki:g2:0', 500, 'dev-c', later)], reviews: [] }, { full: false, isSyncable: isSyncableReview });
    expect(frontOf(r3.state.data, 2)).toBe('back');
  });

  it('places orphan cards under placeholders that never become records', () => {
    const d = decompose(deck([card(7)])).get(recordKey('card', 'anki:g7:0'))!.d;
    const r = mergePulled(state(), { records: [recordDoc('card', 'anki:g7:0', 50, 'dev-b', d)], reviews: [] }, { full: false, isSyncable: isSyncableReview });
    expect(cardIds(r.state.data)).toEqual(['anki:g7:0']);
    expect([...decompose(r.state.data).keys()]).toEqual([recordKey('card', 'anki:g7:0')]);
  });
});

describe('review log', () => {
  it('encodes and decodes reviews losslessly (isNew is derived)', () => {
    const e = review('r1', 1, '2026-01-02T03:04:05.000Z', 'hard', { retention: 0.85, fuzz: true, source: 'anki' });
    expect(decodeReview('r1', encodeReview(e))).toEqual(e);
    expect(decodeReview('x', '{"bad":1}')).toBeNull();
  });

  it('migrates legacy entries without an id to a deterministic id instead of dropping them', () => {
    const legacy = { cardId: 'c', at: '2025-01-01T00:00:00.000Z', rating: 'good' };
    expect(withStableId(legacy)).toEqual({ ...legacy, id: 'legacy:c:2025-01-01T00:00:00.000Z:good' });
    expect(withStableId(legacy)).toEqual(withStableId({ ...legacy }));
  });

  it('canonical log dedupes by id, sorts by time and recomputes isNew', () => {
    const log = canonicalLog([
      review('b', 1, '2026-01-02T00:00:00.000Z'),
      review('a', 1, '2026-01-01T00:00:00.000Z'),
      review('a', 1, '2026-01-01T00:00:00.000Z'),
    ]);
    expect(log.map((e) => [e.id, e.isNew])).toEqual([['a', true], ['b', false]]);
  });

  it('union-merges remote buckets and lets tombstones win permanently', () => {
    const local = state({ events: [review('r1', 1, '2026-01-01T10:00:00.000Z'), review('r2', 1, '2026-01-01T11:00:00.000Z')] });
    const bucket: CloudDoc = {
      id: '2026-01-01', srv: 5,
      data: { e: { r2: encodeReview(review('r2', 1, '2026-01-01T11:00:00.000Z')), r3: encodeReview(review('r3', 2, '2026-01-01T12:00:00.000Z')) }, d: { r1: true } },
    };
    const r = mergePulled(local, { records: [], reviews: [bucket] }, { full: false, isSyncable: isSyncableReview });
    expect(r.state.events.map((e) => e.id)).toEqual(['r2', 'r3']);
    expect(r.state.meta.tombs.r1).toBe('2026-01-01T10:00:00.000Z');
    // Re-applying the same doc, or a doc that still carries r1 live, changes nothing.
    const again = mergePulled(r.state, { records: [], reviews: [bucket, { id: '2026-01-01', srv: 6, data: { e: { r1: encodeReview(review('r1', 1, '2026-01-01T10:00:00.000Z')) } } }] }, { full: false, isSyncable: isSyncableReview });
    expect(again.changed.events).toBe(false);
    expect(again.state.events.map((e) => e.id)).toEqual(['r2', 'r3']);
  });

  it('tracks undo as a pending tombstone only for syncable reviews', () => {
    const real = review('real', 1, '2026-01-01T10:00:00.000Z');
    const demo = { ...review('demo-1', 1, '2026-01-01T10:00:00.000Z'), demo: true };
    const meta = stampEvents(emptyMeta('d', true), [real, demo], [], isSyncableReview);
    expect(meta.pendingTombs).toEqual(['real']);
    expect(Object.keys(meta.tombs)).toEqual(['real']);
  });
});

describe('push planning', () => {
  it('never plans demo history or reviews of built-in demo cards', () => {
    const demoHistory = seedDemoHistory(new Date('2026-11-01T12:00:00Z'));
    const demoCard = { ...review('mine-on-demo', 1, '2026-11-01T10:00:00.000Z'), cardId: 'analysis-1/lecture-1/0-0', subjectId: 'analysis-1' };
    const real = review('real', 1, '2026-11-01T10:00:00.000Z');
    const events = [...demoHistory, demoCard, real];
    const meta = { ...emptyMeta('d', true), pendingReviews: events.map((e) => e.id) };
    const plan = planPush(state({ events, meta }), isSyncableReview);
    const uploaded = plan.items.flatMap((i) => (i.kind === 'bucket' ? i.reviewIds : []));
    expect(uploaded).toEqual(['real']);
    expect(demoHistory.length).toBeGreaterThan(100);
  });

  it('splits writes into batches of at most 500', () => {
    const items = Array.from({ length: 1234 }, (_, i) => ({ bytes: 10, i }));
    const batches = chunk(items);
    expect(batches.map((b) => b.length)).toEqual([500, 500, 234]);
    expect(batches.flat()).toEqual(items);
    expect(chunk([{ bytes: 6 }, { bytes: 6 }, { bytes: 6 }], 500, 10).map((b) => b.length)).toEqual([1, 1, 1]);
  });

  it('orders parents before children so a partial upload never strands cards', () => {
    const data = deck([card(1)]);
    const meta = stampDecks(emptyMeta('d', true), null, data, 100);
    const plan = planPush(state({ data, meta }), isSyncableReview);
    expect(plan.items.map((i) => (i.kind === 'record' ? i.key.split('~')[0] : 'bucket'))).toEqual(['subject', 'deck', 'card']);
  });
});
