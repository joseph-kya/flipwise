import { describe, expect, it } from 'vitest';
import type { ReviewEvent } from '../reviewLog';
import { schedule } from '../scheduler';
import { buildDefaultCatalog, computeInsights, type CatalogItem } from './aggregate';
import { seedDemoHistory, seedDemoHistoryIfEmpty } from './seedDemoHistory';

const REF_DATE = new Date(2026, 10, 23, 14, 0, 0); // 2026-11-23 14:00 local

function makeEvent(overrides: Partial<ReviewEvent> & { id: string; at: string }): ReviewEvent {
  return {
    cardId: 'analysis-1/lecture-1/0-0',
    subjectId: 'analysis-1',
    lessonId: 'lecture-1',
    rating: 'good',
    durationMs: 10000,
    isNew: false,
    retention: 0.9,
    fuzz: false,
    ...overrides,
  };
}

describe('insights aggregations', () => {
  const sampleCatalog: CatalogItem[] = [
    { cardId: 'analysis-1/lecture-1/0-0', subjectId: 'analysis-1', lessonId: 'lecture-1', front: 'Card A' },
    { cardId: 'analysis-1/lecture-1/0-1', subjectId: 'analysis-1', lessonId: 'lecture-1', front: 'Card B' },
    { cardId: 'analysis-1/lecture-1/0-2', subjectId: 'analysis-1', lessonId: 'lecture-1', front: 'Card C' },
    { cardId: 'robotics/L01/r-1', subjectId: 'robotics', lessonId: 'L01', front: 'Robot card' },
  ];

  it('computes heatmap buckets, stacked rating counts, and range/subject filters accurately', () => {
    const events: ReviewEvent[] = [
      makeEvent({ id: '1', rating: 'again', at: '2026-11-23T09:00:00', durationMs: 12000, isNew: true }),
      makeEvent({ id: '2', rating: 'hard', at: '2026-11-23T09:05:00', durationMs: 15000 }),
      makeEvent({ id: '3', rating: 'good', at: '2026-11-23T09:10:00', durationMs: 8000 }),
      makeEvent({
        id: '4',
        cardId: 'robotics/L01/r-1',
        subjectId: 'robotics',
        lessonId: 'L01',
        rating: 'easy',
        at: '2026-11-22T10:00:00',
        durationMs: 6000,
        isNew: true,
      }),
      // Outside 7d window (20 days ago)
      makeEvent({ id: '5', rating: 'easy', at: '2026-11-03T10:00:00', durationMs: 5000 }),
    ];

    const all7d = computeInsights(events, sampleCatalog, {
      range: '7d',
      subjectId: 'all',
      targetRetention: 0.9,
      today: REF_DATE,
    });

    expect(all7d.reviews.total).toBe(4);
    expect(all7d.reviews.totalsByRating).toEqual({ again: 1, hard: 1, good: 1, easy: 1 });
    expect(all7d.heatmap.totalYearReviews).toBe(5);
    expect(all7d.heatmap.activeYearDays).toBe(3);
    expect(all7d.time.totalMs).toBe(41000);

    // Filter to robotics only over 7d
    const robotics7d = computeInsights(events, sampleCatalog, {
      range: '7d',
      subjectId: 'robotics',
      targetRetention: 0.9,
      today: REF_DATE,
    });

    expect(robotics7d.reviews.total).toBe(1);
    expect(robotics7d.reviews.totalsByRating).toEqual({ again: 0, hard: 0, good: 0, easy: 1 });
    expect(robotics7d.states.total).toBe(1);
  });

  it('calculates true retention strictly on Review-state answers (not New/Learning)', () => {
    const t0 = new Date(2026, 10, 1, 10, 0, 0);
    // Card A graduates immediately on Easy (New -> Review)
    const c1 = schedule(undefined, 'easy', t0, 0.9, false);
    const t1 = new Date(c1.due);
    // First Review-state answer: Good (passed)
    const c2 = schedule(c1, 'good', t1, 0.9, false);
    const t2 = new Date(c2.due);
    // Second Review-state answer: Again (failed)
    const events: ReviewEvent[] = [
      makeEvent({ id: 'e0', cardId: 'analysis-1/lecture-1/0-0', rating: 'easy', at: t0.toISOString(), isNew: true }),
      makeEvent({ id: 'e1', cardId: 'analysis-1/lecture-1/0-0', rating: 'good', at: t1.toISOString() }),
      makeEvent({ id: 'e2', cardId: 'analysis-1/lecture-1/0-0', rating: 'again', at: t2.toISOString() }),
    ];

    const res = computeInsights(events, sampleCatalog, {
      range: '90d',
      subjectId: 'all',
      targetRetention: 0.9,
      today: new Date(t2.getTime() + 3600_000),
    });

    // Only e1 (Good) and e2 (Again) happened while in Review state -> 1/2 = 50%
    expect(res.retention.reviewTotal).toBe(2);
    expect(res.retention.reviewPassed).toBe(1);
    expect(res.retention.overallRate).toBe(50);
    expect(res.retention.targetPercent).toBe(90);
  });

  it('classifies New, Learning, Young, Mature, and Forecast due counts from FSRS state', () => {
    // Card A: graduated Easy long ago and reviewed Good twice -> Mature (>= 21d)
    const startA = new Date(2026, 8, 1, 10, 0, 0);
    let cardA = schedule(undefined, 'easy', startA, 0.9, false);
    const a1At = new Date(cardA.due);
    cardA = schedule(cardA, 'good', a1At, 0.9, false);
    const a2At = new Date(cardA.due);
    cardA = schedule(cardA, 'good', a2At, 0.9, false);

    // Card B: Easy today -> Young (< 21d) and due in the next 30 days
    const b0At = new Date(2026, 10, 22, 10, 0, 0);
    const cardB = schedule(undefined, 'easy', b0At, 0.9, false);

    // Card C: Again today -> Learning (due today)
    const c0At = new Date(2026, 10, 23, 9, 0, 0);

    // Robotics card: untouched -> New
    const events: ReviewEvent[] = [
      makeEvent({ id: 'a0', cardId: 'analysis-1/lecture-1/0-0', rating: 'easy', at: startA.toISOString(), isNew: true }),
      makeEvent({ id: 'a1', cardId: 'analysis-1/lecture-1/0-0', rating: 'good', at: a1At.toISOString() }),
      makeEvent({ id: 'a2', cardId: 'analysis-1/lecture-1/0-0', rating: 'good', at: a2At.toISOString() }),
      makeEvent({ id: 'b0', cardId: 'analysis-1/lecture-1/0-1', rating: 'easy', at: b0At.toISOString(), isNew: true }),
      makeEvent({ id: 'c0', cardId: 'analysis-1/lecture-1/0-2', rating: 'again', at: c0At.toISOString(), isNew: true }),
    ];

    const res = computeInsights(events, sampleCatalog, {
      range: '90d',
      subjectId: 'all',
      targetRetention: 0.9,
      today: REF_DATE,
    });

    const byId = Object.fromEntries(res.states.slices.map((s) => [s.id, s.count]));
    expect(byId.new).toBe(1);
    expect(byId.learning).toBe(1);
    expect(byId.young).toBe(cardB.scheduled_days < 21 ? 1 : 0);
    expect(byId.mature).toBe(cardA.scheduled_days >= 21 ? 1 : 0);
    expect(res.forecast.dueToday).toBeGreaterThanOrEqual(1);
    expect(res.forecast.dueNext30).toBeGreaterThanOrEqual(2);
  });

  it('finds streaks and best hourly accuracy accurately', () => {
    const events: ReviewEvent[] = [
      // 3-day streak ending today (Nov 21, 22, 23)
      // Hour 09: 5 reviews, 5 Good -> 100% (best hour)
      ...Array.from({ length: 5 }, (_, i) =>
        makeEvent({ id: `m-${i}`, rating: 'good', at: `2026-11-23T09:0${i}:00`, durationMs: 6000 }),
      ),
      // Hour 21: 5 reviews, 2 Good, 3 Again -> 40%
      ...Array.from({ length: 5 }, (_, i) =>
        makeEvent({
          id: `n-${i}`,
          rating: i < 2 ? 'good' : 'again',
          at: `2026-11-22T21:0${i}:00`,
          durationMs: 18000,
        }),
      ),
      makeEvent({ id: 'p-1', rating: 'easy', at: '2026-11-21T14:00:00', durationMs: 7000 }),
    ];

    const res = computeInsights(events, sampleCatalog, {
      range: '7d',
      subjectId: 'all',
      targetRetention: 0.9,
      today: REF_DATE,
    });

    expect(res.streaks.current).toBe(3);
    expect(res.streaks.longest).toBe(3);
    expect(res.streaks.daysInRange).toBe(3);
    expect(res.hourly.bestHour?.hour).toBe(9);
    expect(res.hourly.bestHour?.accuracy).toBe(100);
    expect(res.answerTime.medianSec).toBe(7);
  });

  it('seeds deterministic ~120-day FSRS demo history with demo:true and populates all charts', () => {
    const seededA = seedDemoHistory(REF_DATE, 0.9);
    const seededB = seedDemoHistory(REF_DATE, 0.9);
    expect(seededA).toEqual(seededB);
    expect(seededA.length).toBeGreaterThan(500);
    expect(seededA.every((e) => e.demo === true)).toBe(true);

    // seedDemoHistoryIfEmpty preserves non-empty logs untouched
    const existing = [makeEvent({ id: 'real-1', at: REF_DATE.toISOString() })];
    const unchanged = seedDemoHistoryIfEmpty(existing, REF_DATE, 0.9);
    expect(unchanged.seeded).toBe(false);
    expect(unchanged.events).toEqual(existing);

    const insights = computeInsights(seededA, buildDefaultCatalog(), {
      range: '90d',
      subjectId: 'all',
      targetRetention: 0.9,
      today: REF_DATE,
    });

    expect(insights.heatmap.activeYearDays).toBeGreaterThan(80);
    expect(insights.retention.overallRate).toBeGreaterThan(50);
    expect(insights.forecast.dueNext30).toBeGreaterThan(0);
    expect(insights.states.matureCount).toBeGreaterThan(0);
    expect(insights.streaks.current).toBeGreaterThanOrEqual(5);
    expect(insights.leeches.items.length).toBeGreaterThan(0);
    expect(insights.answerTime.medianSec).toBeGreaterThan(0);
  });
});
