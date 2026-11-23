import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ReviewEvent } from './reviewLog';
import { replay } from './scheduler';
import { forecast, intakePlan, secondsPerAnswer, type ForecastInput } from './forecast';
import type { StarterPack } from './onboarding/starterPack';

const today = new Date(2026, 10, 23, 12);
const base = (over: Partial<ForecastInput> = {}): ForecastInput => ({
  states: new Map(), courses: [{ id: 'A', unseen: 904, newPerDay: 15 }], globalNew: Infinity,
  reviewsPerDay: null, retention: 0.9, secondsPerAnswer: 8, today, ...over,
});
const total = (f: ReturnType<typeof forecast>) => f.days.reduce((a, d) => a + d.reviews, 0);

describe('forecast sanity', () => {
  it('more new cards per day: earlier finish and more reviews (monotonic)', () => {
    let prevFinish = Infinity, prevReviews = -1;
    for (const n of [5, 10, 15, 20, 30, 40]) {
      const f = forecast(base({ courses: [{ id: 'A', unseen: 904, newPerDay: n }] }));
      expect(f.finishDay!).toBeLessThanOrEqual(prevFinish);
      expect(total(f)).toBeGreaterThan(prevReviews);
      prevFinish = f.finishDay!; prevReviews = total(f);
    }
    expect(forecast(base({ courses: [{ id: 'A', unseen: 904, newPerDay: 20 }] })).finishDay).toBe(Math.ceil(904 / 20) - 1);
  });
  it('higher retention: more reviews for the same intake', () => {
    expect(total(forecast(base({ retention: 0.95 })))).toBeGreaterThan(total(forecast(base({ retention: 0.85 }))));
  });
  it('load builds up realistically: ~2-4x new/day by week 8, ~5-8x after a year (FSRS-6, 90%)', () => {
    const f = forecast(base({ courses: [{ id: 'A', unseen: 100000, newPerDay: 10 }], days: 365 }));
    expect(f.weeks[7].reviewsPerDay).toBeGreaterThan(20);
    expect(f.weeks[7].reviewsPerDay).toBeLessThan(40);
    expect(f.weeks[51].reviewsPerDay).toBeGreaterThan(f.weeks[25].reviewsPerDay);
    expect(f.weeks[51].reviewsPerDay).toBeGreaterThan(50);
    expect(f.weeks[51].reviewsPerDay).toBeLessThan(80);
  });
  it('zero new cards: never finishes, and with no history there is nothing to review', () => {
    const f = forecast(base({ courses: [{ id: 'A', unseen: 100, newPerDay: 0 }] }));
    expect(f.finishDay).toBeNull();
    expect(f.finishDate).toBeNull();
    expect(total(f)).toBe(0);
  });
  it('everything already seen: finished today, reviews still come from the history', () => {
    const events: ReviewEvent[] = Array.from({ length: 50 }, (_, i) => ({ id: `e${i}`, cardId: `c${i}`, subjectId: 'A', lessonId: 'l', rating: 'good', at: new Date(2026, 10, 1 + (i % 20), 9).toISOString(), durationMs: 5000, isNew: true, retention: 0.9, fuzz: false }));
    const f = forecast(base({ states: replay(events), courses: [{ id: 'A', unseen: 0, newPerDay: 20 }] }));
    expect(f.finishDay).toBe(0);
    expect(total(f)).toBeGreaterThan(50);
  });
  it('empty deck: nothing at all', () => {
    const f = forecast(base({ courses: [] }));
    expect(f.finishDay).toBe(0);
    expect(total(f)).toBe(0);
    expect(f.heavy).toBe(false);
  });
  it('a review cap below demand builds a growing backlog, and lifting it clears it', () => {
    const capped = forecast(base({ courses: [{ id: 'A', unseen: 3000, newPerDay: 40 }], reviewsPerDay: 60 }));
    expect(capped.backlogGrowing).toBe(true);
    expect(Math.max(...capped.days.map((d) => d.reviews))).toBeLessThanOrEqual(60 + 1e-9);
    const free = forecast(base({ courses: [{ id: 'A', unseen: 3000, newPerDay: 40 }] }));
    expect(free.backlogGrowing).toBe(false);
    expect(free.backlogEnd).toBe(0);
  });
  it('flags a heavy load', () => {
    expect(forecast(base({ courses: [{ id: 'A', unseen: 5000, newPerDay: 80 }], secondsPerAnswer: 12 })).heavy).toBe(true);
    expect(forecast(base({ courses: [{ id: 'A', unseen: 5000, newPerDay: 5 }] })).heavy).toBe(false);
  });
});

describe('intake across courses', () => {
  it('honours each course cap and the global cap, in queue order', () => {
    const plan = intakePlan([{ id: 'A', unseen: 100, newPerDay: 18 }, { id: 'B', unseen: 30, newPerDay: 11 }, { id: 'C', unseen: 50, newPerDay: 20 }], 40, 3);
    expect(plan.perDay).toEqual([40, 40, 40]);
    const loose = intakePlan([{ id: 'A', unseen: 10, newPerDay: 18 }, { id: 'B', unseen: 30, newPerDay: 11 }], 1000, 4);
    expect(loose.perDay).toEqual([21, 11, 8, 0]);
    expect(loose.finishDay).toBe(2);
  });
});

describe('seconds per answer', () => {
  it('uses the median of real answers, ignores demo, falls back to 8 s', () => {
    const e = (ms: number, demo = false) => ({ id: String(Math.random()), cardId: 'c', subjectId: 'A', lessonId: 'l', rating: 'good' as const, at: today.toISOString(), durationMs: ms, isNew: false, ...(demo ? { demo } : {}) });
    expect(secondsPerAnswer([e(5000)])).toBe(8);
    expect(secondsPerAnswer(Array.from({ length: 30 }, (_, i) => e(4000 + i * 100)))).toBeCloseTo(5.5, 1);
    expect(secondsPerAnswer(Array.from({ length: 30 }, () => e(99_000, true)))).toBe(8);
  });
});

describe('performance on the 2,568-card starter set', () => {
  it('runs fast enough to update live (measured)', () => {
    const pack = JSON.parse(readFileSync('public/starter/ai-robotics.json', 'utf8')) as StarterPack;
    const courses = pack.subjects.map((s) => ({ id: s.id, unseen: s.total, newPerDay: 20 }));
    // Simulate two months of history on 600 cards so existing cohorts matter too.
    const events: ReviewEvent[] = [];
    const ids = pack.subjects.flatMap((s) => s.lectures.flatMap((l) => l.cards.map((c) => c.id))).slice(0, 600);
    ids.forEach((id, i) => events.push({ id: `h${i}`, cardId: id, subjectId: 'A', lessonId: 'l', rating: i % 9 ? 'good' : 'again', at: new Date(2026, 8, 1 + (i % 80), 10).toISOString(), durationMs: 6000, isNew: true, retention: 0.9, fuzz: false }));
    const states = replay(events);
    const input = base({ states, courses, globalNew: 40 });
    forecast(input); // warm-up (JIT)
    const runs = 5, t0 = performance.now();
    for (let i = 0; i < runs; i++) forecast(input);
    const ms = (performance.now() - t0) / runs;
    console.log(`forecast: ${ms.toFixed(1)} ms per run (2,568 cards, 600 with history, 56 days)`);
    expect(ms).toBeLessThan(250);
  });
});
