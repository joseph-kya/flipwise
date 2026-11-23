import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { catchupAnswer, catchupItems, dueCount } from './catchup';
import type { ReviewEvent } from './reviewLog';
import { isDueState, replay, type QueueCard } from './scheduler';
import { pendingCount } from './sync/merge';
import { MemoryCloud } from './sync/memoryCloud';
import { makeDevice } from './sync/testkit';

const card = (n: number): QueueCard => ({ cardId: `anki:g${n}:0`, subjectId: 'anki-course', lessonId: 'L1', queuePosition: n });
const cards = [card(1), card(2), card(3), card(4)];
const day = (d: number, h = 10, m = 0) => new Date(2026, 10, d, h, m, 0);
const ev = (id: string, n: number, at: Date, rating: ReviewEvent['rating'] = 'good'): ReviewEvent =>
  ({ id, cardId: `anki:g${n}:0`, subjectId: 'anki-course', lessonId: 'L1', rating, at: at.toISOString(), durationMs: 1000, isNew: false, retention: 0.9, fuzz: true });

// Card 1 and 2 reviewed long ago (overdue by now), card 3 reviewed just now (not due), card 4 never studied.
const history: ReviewEvent[] = [
  ev('a1', 1, day(1)), ev('a2', 1, day(1, 10, 12)),
  ev('b1', 2, day(2)), ev('b2', 2, day(2, 10, 12)),
  ev('c1', 3, day(22)), ev('c2', 3, day(22, 10, 12)),
];
const now = day(22, 12);

describe('catch-up scheduling rules', () => {
  it('scopes to due/overdue cards, most overdue first; "everything" adds the rest as practice', () => {
    const states = replay(history);
    expect(isDueState(states.get('anki:g1:0'), now)).toBe(true);
    expect(isDueState(states.get('anki:g3:0'), now)).toBe(false);
    expect(catchupItems(cards, history, now).map((i) => [i.card.cardId, i.kind])).toEqual([
      ['anki:g1:0', 'due'], ['anki:g2:0', 'due'],
    ]);
    expect(catchupItems(cards, history, now, true).map((i) => [i.card.cardId, i.kind])).toEqual([
      ['anki:g1:0', 'due'], ['anki:g2:0', 'due'], ['anki:g3:0', 'practice'], ['anki:g4:0', 'practice'],
    ]);
    expect(dueCount(cards, history, now)).toBe(2);
  });

  it('maps Knew it to Good and Didn\'t know to Again for due cards, and clears them', () => {
    const knew = catchupAnswer(card(1), true, history, now, 800, 0.9, 'k1')!;
    const missed = catchupAnswer(card(2), false, history, now, 800, 0.9, 'm1')!;
    expect(knew).toMatchObject({ id: 'k1', rating: 'good', cardId: 'anki:g1:0', isNew: false });
    expect(missed).toMatchObject({ id: 'm1', rating: 'again', cardId: 'anki:g2:0' });
    const after = [...history, knew, missed];
    const states = replay(after);
    expect(+states.get('anki:g1:0')!.due).toBeGreaterThan(+now + 86_400_000); // pushed out by days
    expect(+states.get('anki:g2:0')!.due).toBeLessThan(+now + 3_600_000);    // relearning soon
    expect(states.get('anki:g2:0')!.lapses).toBe(1);
    expect(catchupItems(cards, after, now).map((i) => i.card.cardId)).toEqual([]);
  });

  it('a practice answer on a not-yet-due or new card writes nothing and leaves its schedule alone', () => {
    const before = replay(history).get('anki:g3:0');
    expect(catchupAnswer(card(3), false, history, now, 500, 0.9, 'p1')).toBeNull();
    expect(catchupAnswer(card(4), true, history, now, 500, 0.9, 'p2')).toBeNull();
    expect(replay(history).get('anki:g3:0')).toEqual(before);
    expect(replay(history).has('anki:g4:0')).toBe(false);
  });

  it('judges due-ness at answer time: a card reviewed elsewhere meanwhile becomes practice', () => {
    const synced = [...history, ev('other-device', 1, day(22, 11))];
    expect(catchupAnswer(card(1), true, synced, now, 500, 0.9, 'x')).toBeNull();
  });

  it('catch-up reviews go through the normal review log, outbox and sync; undo tombstones them', async () => {
    const cloud = new MemoryCloud();
    const dev = await makeDevice('catchup');
    const s = await dev.signIn('uid-c', cloud.as('uid-c'));
    for (const e of history) await dev.storage.append(e);
    await s.engine.sync();
    let log = await dev.storage.read();
    const a = catchupAnswer(card(1), true, log, now, 700, 0.9, 'catch-1')!;
    log = await dev.storage.append(a);
    const b = catchupAnswer(card(2), false, log, now, 700, 0.9, 'catch-2')!;
    log = await dev.storage.append(b);
    expect((await dev.state()).meta.pendingReviews.sort()).toEqual(['catch-1', 'catch-2']);
    // Undo the last catch-up answer: same remove() path as study undo -> tombstone.
    log = await dev.storage.remove(['catch-2']);
    expect((await dev.state()).meta.pendingTombs).toEqual(['catch-2']);
    await s.engine.sync();
    expect(pendingCount((await dev.state()).meta)).toBe(0);
    // A second device re-derives exactly the same FSRS state from the synced log.
    const other = await makeDevice('catchup-other');
    const o = await other.signIn('uid-c', cloud.as('uid-c'));
    await o.engine.sync();
    const remote = (await other.state()).events;
    expect(remote.map((e) => e.id)).toContain('catch-1');
    expect(remote.map((e) => e.id)).not.toContain('catch-2');
    expect([...replay(remote)]).toEqual([...replay(log)]);
  });
});
