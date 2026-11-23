import { describe, expect, it } from 'vitest';
import { seedDemoReviewLog, type ReviewEvent } from '../reviewLog';
import {
  aggregateByDay,
  formatDuration,
  heatmapLevel,
  monthSummary,
  shiftDateKey,
  streak,
  toLocalDateKey,
  weekSummary,
} from './dailyStats';

function makeEvent(overrides: Partial<ReviewEvent> & { id: string; at: string }): ReviewEvent {
  return {
    cardId: `card-${overrides.id}`,
    subjectId: 'analysis-1',
    lessonId: 'lecture-1',
    rating: 'good',
    durationMs: 12000,
    isNew: false,
    ...overrides,
  };
}

describe('dailyStats', () => {
  it('handles empty input cleanly', () => {
    const byDay = aggregateByDay([], 'Europe/Berlin');
    expect(byDay.size).toBe(0);

    const month = monthSummary(byDay, 2026, 10);
    expect(month).toEqual({
      activeDays: 0,
      cardsStudied: 0,
      newCardsLearned: 0,
      durationMs: 0,
      mistakes: 0,
      hard: 0,
      correct: 0,
      accuracy: 0,
    });

    const wk = weekSummary(byDay, '2026-11-23');
    expect(wk.cardsStudied).toBe(0);
    expect(wk.accuracy).toBe(0);

    const st = streak(byDay, '2026-11-23');
    expect(st).toEqual({ current: 0, longest: 0, activeToday: false });
  });

  it('buckets events by local calendar day across UTC midnight boundaries', () => {
    // 2026-11-22T23:30:00Z is 2026-11-23 00:30 in Europe/Berlin (UTC+1)
    // and 2026-11-22 18:30 in America/New_York (UTC-5).
    const events: ReviewEvent[] = [
      makeEvent({ id: '1', at: '2026-11-22T22:45:00Z' }), // 23:45 Berlin on Nov 22
      makeEvent({ id: '2', at: '2026-11-22T23:30:00Z' }), // 00:30 Berlin on Nov 23
      makeEvent({ id: '3', at: '2026-11-23T01:15:00Z' }), // 02:15 Berlin on Nov 23; 20:15 NY on Nov 22
    ];

    const berlin = aggregateByDay(events, 'Europe/Berlin');
    expect(Array.from(berlin.keys())).toEqual(['2026-11-22']);
    expect(berlin.get('2026-11-22')?.cardsStudied).toBe(3);
    expect(berlin.get('2026-11-23')).toBeUndefined();

    const newYork = aggregateByDay(events, 'America/New_York');
    expect(Array.from(newYork.keys())).toEqual(['2026-11-22']);
    expect(newYork.get('2026-11-22')?.cardsStudied).toBe(3);

    expect(toLocalDateKey('2026-11-22T23:30:00Z', 'Europe/Berlin')).toBe('2026-11-23');
    expect(toLocalDateKey('2026-11-22T23:30:00Z', 'America/New_York')).toBe('2026-11-22');
  });

  it('computes counts, ratings, accuracy, and per-subject breakdowns accurately', () => {
    const events: ReviewEvent[] = [
      makeEvent({ id: '1', subjectId: 'analysis-1', rating: 'good', durationMs: 10000, isNew: true, at: '2026-11-23T09:00:00+01:00' }),
      makeEvent({ id: '2', subjectId: 'analysis-1', rating: 'easy', durationMs: 8000, isNew: false, at: '2026-11-23T09:01:00+01:00' }),
      makeEvent({ id: '3', subjectId: 'analysis-1', rating: 'again', durationMs: 25000, isNew: true, at: '2026-11-23T09:02:00+01:00' }),
      makeEvent({ id: '4', subjectId: 'robotics', rating: 'hard', durationMs: 17000, isNew: false, at: '2026-11-23T14:00:00+01:00' }),
      makeEvent({ id: '5', subjectId: 'robotics', rating: 'good', durationMs: 15000, isNew: true, at: '2026-11-23T14:01:00+01:00' }),
    ];

    const byDay = aggregateByDay(events, 'Europe/Berlin');
    const day = byDay.get('2026-11-23')!;

    expect(day.cardsStudied).toBe(5);
    expect(day.newCardsLearned).toBe(3);
    expect(day.durationMs).toBe(75000);
    expect(day.mistakes).toBe(1);
    expect(day.hard).toBe(1);
    expect(day.good).toBe(2);
    expect(day.easy).toBe(1);
    expect(day.correct).toBe(3); // good + easy
    expect(day.accuracy).toBeCloseTo(3 / 5);

    // Subjects sorted descending by cardsStudied
    expect(day.subjects).toHaveLength(2);
    expect(day.subjects[0]).toMatchObject({
      subjectId: 'analysis-1',
      cardsStudied: 3,
      newCardsLearned: 2,
      durationMs: 43000,
      mistakes: 1,
      hard: 0,
      correct: 2,
    });
    expect(day.subjects[0].accuracy).toBeCloseTo(2 / 3);
    expect(day.subjects[1]).toMatchObject({
      subjectId: 'robotics',
      cardsStudied: 2,
      newCardsLearned: 1,
      durationMs: 32000,
      mistakes: 0,
      hard: 1,
      correct: 1,
    });
    expect(day.subjects[1].accuracy).toBeCloseTo(0.5);
  });

  it('aggregates monthSummary and weekSummary across boundaries', () => {
    const events: ReviewEvent[] = [
      // October 31 (Saturday)
      makeEvent({ id: 'o1', rating: 'good', durationMs: 60000, isNew: true, at: '2026-10-31T10:00:00+01:00' }),
      // November 1 (Sunday, same Monday–Sunday week as Oct 31)
      makeEvent({ id: 'n1', rating: 'easy', durationMs: 120000, isNew: false, at: '2026-11-01T10:00:00+01:00' }),
      // November 2 (Monday, next week)
      makeEvent({ id: 'n2', rating: 'again', durationMs: 180000, isNew: true, at: '2026-11-02T10:00:00+01:00' }),
    ];

    const byDay = aggregateByDay(events, 'Europe/Berlin');
    const nov = monthSummary(byDay, 2026, 10); // November = 10
    expect(nov.activeDays).toBe(2);
    expect(nov.cardsStudied).toBe(2);
    expect(nov.newCardsLearned).toBe(1);
    expect(nov.durationMs).toBe(300000);
    expect(nov.correct).toBe(1);
    expect(nov.mistakes).toBe(1);
    expect(nov.accuracy).toBeCloseTo(0.5);

    const wkNov1 = weekSummary(byDay, '2026-11-01');
    expect(wkNov1.activeDays).toBe(2); // Oct 31 + Nov 1
    expect(wkNov1.cardsStudied).toBe(2);
    expect(wkNov1.correct).toBe(2);
    expect(wkNov1.accuracy).toBe(1);
  });

  it('calculates current and longest streaks including yesterday grace period and broken streaks', () => {
    const events: ReviewEvent[] = [
      // 4-day run earlier in the month
      makeEvent({ id: 'a1', at: '2026-11-01T12:00:00+01:00' }),
      makeEvent({ id: 'a2', at: '2026-11-02T12:00:00+01:00' }),
      makeEvent({ id: 'a3', at: '2026-11-03T12:00:00+01:00' }),
      makeEvent({ id: 'a4', at: '2026-11-04T12:00:00+01:00' }),
      // 2-day run ending yesterday (Nov 21–22)
      makeEvent({ id: 'b1', at: '2026-11-21T12:00:00+01:00' }),
      makeEvent({ id: 'b2', at: '2026-11-22T12:00:00+01:00' }),
    ];

    const byDay = aggregateByDay(events, 'Europe/Berlin');

    // On Nov 23 (before studying today): grace keeps 2-day streak alive
    expect(streak(byDay, '2026-11-23')).toEqual({
      current: 2,
      longest: 4,
      activeToday: false,
    });

    // On Nov 22: active today, streak is 2
    expect(streak(byDay, '2026-11-22')).toEqual({
      current: 2,
      longest: 4,
      activeToday: true,
    });

    // On Nov 24 (missed Nov 23): current streak is 0, longest remains 4
    expect(streak(byDay, '2026-11-24')).toEqual({
      current: 0,
      longest: 4,
      activeToday: false,
    });
  });

  it('shifts date keys across month and leap-year boundaries', () => {
    expect(shiftDateKey('2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDateKey('2024-02-28', 1)).toBe('2024-02-29');
    expect(shiftDateKey('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('maps heatmap levels and formats durations sensibly', () => {
    expect(heatmapLevel(0)).toBe(0);
    expect(heatmapLevel(5)).toBe(1);
    expect(heatmapLevel(20)).toBe(2);
    expect(heatmapLevel(35)).toBe(3);
    expect(heatmapLevel(55)).toBe(4);

    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(30_000)).toBe('<1m');
    expect(formatDuration(14 * 60_000)).toBe('14m');
    expect(formatDuration(60 * 60_000)).toBe('1h');
    expect(formatDuration(68 * 60_000)).toBe('1h 08m');
  });

  it('seedDemoReviewLog is deterministic and spans 6 weeks with skipped days and all 4 subjects', () => {
    const ref = new Date(2026, 10, 23, 12, 0, 0);
    const first = seedDemoReviewLog(ref);
    const second = seedDemoReviewLog(ref);

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(500);

    const subjectIds = new Set(first.map((e) => e.subjectId));
    expect(subjectIds).toEqual(new Set(['analysis-1', 'robotics', 'physics-1', 'programming-1']));

    const byDay = aggregateByDay(first);
    // 42-day window with ~9 skipped days -> roughly 33 active days
    expect(byDay.size).toBeGreaterThanOrEqual(28);
    expect(byDay.size).toBeLessThan(40);
  });
});
