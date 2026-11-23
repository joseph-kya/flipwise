/**
 * Study forecast: a deterministic expected-value cohort simulation on ts-fsrs (docs/study-pace.md).
 * Cohorts (a typical card + an expected count) split at every review into recalled (p = target
 * retention) and lapsed (1 - p); cohorts with similar stability/difficulty due on the same day are
 * merged, which keeps the work bounded however many cards there are.
 */
import { State, type Card } from 'ts-fsrs';
import type { ReviewEvent } from './reviewLog';
import { STUDY_CONFIG, retrievability, schedule, engine } from './scheduler';

export const FORECAST_DAYS = 56;
export const HEAVY_MINUTES = 60;
const MIN_MASS = 0.01;
const DAY = 86_400_000;

export interface IntakeCourse { id: string; unseen: number; newPerDay: number }

export interface ForecastInput {
  /** Current FSRS states of the studied cards in scope. */
  states: ReadonlyMap<string, Card>;
  /** Courses in scope, in queue order, with their unseen cards and effective new/day. */
  courses: readonly IntakeCourse[];
  /** Combined new/day cap across the scope (global cap); Infinity for none. */
  globalNew: number;
  /** Reviews/day cap for the scope; null = none. */
  reviewsPerDay: number | null;
  retention: number;
  secondsPerAnswer: number;
  today: Date;
  days?: number;
}

export interface ForecastDay { reviews: number; newCards: number; answers: number; minutes: number; backlog: number }
export interface Forecast {
  days: ForecastDay[];
  weeks: { reviewsPerDay: number; minutesPerDay: number; newPerDay: number }[];
  unseen: number;
  /** Days from today until the last unseen card is introduced; 0 = already all seen; null = never. */
  finishDay: number | null;
  finishDate: Date | null;
  firstWeekMinutes: number;
  busiestWeekMinutes: number;
  backlogEnd: number;
  backlogGrowing: boolean;
  heavy: boolean;
}

/** Study-day start (rollover 04:00) of `at`, as local midnight of that study day. */
export function studyDayStart(at: Date): Date {
  const d = new Date(at);
  if (d.getHours() < STUDY_CONFIG.rolloverHour) d.setDate(d.getDate() - 1);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
/** Study-day index of `when` relative to `start` (a study-day midnight): days since start + rollover. */
const dayIndex = (start: Date, when: Date) => Math.floor((+when - +start - STUDY_CONFIG.rolloverHour * 3_600_000) / DAY);
const noonOf = (start: Date, d: number) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + d, 12);

/** Daily intake allocation across courses (queue order), honouring each course's and the global cap. */
export function intakePlan(courses: readonly IntakeCourse[], globalNew: number, horizon: number): { perDay: number[]; finishDay: number | null } {
  const left = courses.map((c) => Math.max(0, c.unseen));
  const total = left.reduce((a, b) => a + b, 0);
  if (total === 0) return { perDay: Array(horizon).fill(0), finishDay: 0 };
  const perDay: number[] = [];
  let introduced = 0;
  for (let d = 0; d < 3650; d++) {
    let budget = globalNew, today = 0;
    for (let i = 0; i < courses.length && budget > 0; i++) {
      const n = Math.min(left[i], Math.max(0, Math.floor(courses[i].newPerDay)), budget);
      left[i] -= n; budget -= n; today += n;
    }
    if (d < horizon) perDay.push(today);
    introduced += today;
    if (introduced >= total) {
      while (perDay.length < horizon) perDay.push(0);
      return { perDay, finishDay: d };
    }
    if (today === 0) break; // nothing can ever be introduced
  }
  while (perDay.length < horizon) perDay.push(0);
  return { perDay, finishDay: null };
}

interface Cohort { card: Card; mass: number }

export function forecast(input: ForecastInput): Forecast {
  const horizon = input.days ?? FORECAST_DAYS;
  const r = input.retention;
  const start = studyDayStart(input.today);
  const w = engine(r, false).parameters.w;
  const buckets: Map<string, Cohort>[] = Array.from({ length: horizon + 1 }, () => new Map());
  const key = (c: Card) => `${Math.round(Math.log(Math.max(c.stability, 0.01)) / Math.log(1.05))}|${Math.round(c.difficulty * 2)}`;
  const add = (day: number, card: Card, mass: number) => {
    if (mass < MIN_MASS || day > horizon) return;
    const b = buckets[Math.max(0, day)], k = key(card), have = b.get(k);
    if (have) have.mass += mass; else b.set(k, { card, mass });
  };

  // Transitions only depend on (stability, difficulty, elapsed days, rating): memoise them.
  const memo = new Map<string, Card>();
  const step = (card: Card, rating: 'good' | 'again', at: Date): Card => {
    const elapsed = Math.round((+at - +(card.last_review ?? at)) / DAY);
    // Same granularity as cohort merging (5% stability, 0.5 difficulty), so no extra approximation.
    const k = `${card.state}|${key(card)}|${elapsed}|${rating}`;
    let next = memo.get(k);
    if (!next) {
      next = schedule(card, rating, at, r, false);
      if (rating === 'again') next = schedule(next, 'good', new Date(+at + 600_000), r, false); // relearning step, same day
      memo.set(k, next);
    }
    // Re-anchor the memoised result to this date.
    const shift = +at - +(next.last_review ?? at);
    return shift ? { ...next, last_review: new Date(+(next.last_review ?? at) + shift), due: new Date(+next.due + shift) } : next;
  };

  // Existing cards: review cards start on their due day (overdue = today); learning cards finish
  // their steps today (a Good) and join as reviews.
  for (const card of input.states.values()) {
    if (card.state === State.Review) add(Math.max(0, dayIndex(start, card.due)), card, 1);
    else if (card.state !== State.New) {
      const at = noonOf(start, 0);
      const graduated = schedule(card, 'good', at, r, false);
      add(Math.max(1, dayIndex(start, graduated.due)), graduated, 1);
    }
  }

  const { perDay, finishDay } = intakePlan(input.courses, input.globalNew, horizon);
  const unseen = input.courses.reduce((a, c) => a + Math.max(0, c.unseen), 0);
  // A new card: Good, its 10-minute step, Good again -> a review card due after its first interval.
  const fresh = (at: Date) => {
    const a = schedule(undefined, 'good', at, r, false);
    return a.state === State.Review ? a : schedule(a, 'good', new Date(+at + 600_000), r, false);
  };
  const freshProto = fresh(noonOf(start, 0));
  const freshGap = dayIndex(start, freshProto.due);

  const days: ForecastDay[] = [];
  const cap = input.reviewsPerDay ?? Infinity;
  for (let d = 0; d < horizon; d++) {
    const at = noonOf(start, d);
    const n = perDay[d];
    let answers = 2 * n, reviews = 0;
    if (n > 0) {
      const shift = +at - +noonOf(start, 0);
      add(d + freshGap, { ...freshProto, last_review: new Date(+freshProto.last_review! + shift), due: new Date(+freshProto.due + shift) }, n);
    }
    // Due today, most at-risk first; anything over the cap rolls to tomorrow. (Retrievability is
    // computed once per cohort; ordering only matters when a review cap binds.)
    let due = [...buckets[d].values()];
    if (Number.isFinite(cap)) due = due.map((c) => ({ c, r: retrievability(c.card, at, w) })).sort((a, b) => a.r - b.r).map((x) => x.c);
    let room = cap, carried = 0;
    for (const c of due) {
      const take = Math.min(c.mass, room);
      if (take < c.mass) { carried += c.mass - take; add(d + 1, c.card, c.mass - take); }
      if (take <= 0) continue;
      room -= take;
      reviews += take;
      answers += take + take * (1 - r); // the review, plus a relearning step for lapses
      const ok = step(c.card, 'good', at), lapse = step(c.card, 'again', at);
      add(Math.max(d + 1, dayIndex(start, ok.due)), ok, take * r);
      add(Math.max(d + 1, dayIndex(start, lapse.due)), lapse, take * (1 - r));
    }
    buckets[d].clear();
    days.push({ reviews, newCards: n, answers, minutes: (answers * input.secondsPerAnswer) / 60, backlog: carried });
  }

  const weeks = Array.from({ length: Math.ceil(horizon / 7) }, (_, i) => {
    const slice = days.slice(i * 7, i * 7 + 7);
    const avg = (f: (x: ForecastDay) => number) => slice.reduce((a, x) => a + f(x), 0) / Math.max(1, slice.length);
    return { reviewsPerDay: avg((x) => x.reviews), minutesPerDay: avg((x) => x.minutes), newPerDay: avg((x) => x.newCards) };
  });
  const busiestWeekMinutes = Math.max(0, ...weeks.map((x) => x.minutesPerDay));
  const backlogEnd = days.at(-1)?.backlog ?? 0;
  const backlogGrowing = Number.isFinite(cap) && backlogEnd > 1 && backlogEnd > (days[Math.max(0, horizon - 8)]?.backlog ?? 0) + 0.5;
  return {
    days, weeks, unseen, finishDay,
    finishDate: finishDay === null ? null : new Date(start.getFullYear(), start.getMonth(), start.getDate() + finishDay),
    firstWeekMinutes: weeks[0]?.minutesPerDay ?? 0,
    busiestWeekMinutes,
    backlogEnd,
    backlogGrowing,
    heavy: busiestWeekMinutes > HEAVY_MINUTES,
  };
}

/** The user's typical seconds per answer: median of recent real answers, else 8 s. */
export function secondsPerAnswer(events: readonly ReviewEvent[]): number {
  const recent = events.filter((e) => !e.demo && e.durationMs > 0).slice(-500).map((e) => e.durationMs / 1000).sort((a, b) => a - b);
  if (recent.length < 20) return 8;
  return Math.min(60, Math.max(2, recent[Math.floor(recent.length / 2)]));
}

/** Memoised forecast keyed by every input that matters. */
const cache = new Map<string, Forecast>();
export function peekForecast(cacheKey: string): Forecast | undefined {
  return cache.get(cacheKey);
}
export function cachedForecast(cacheKey: string, input: () => ForecastInput): Forecast {
  const hit = cache.get(cacheKey);
  if (hit) { cache.delete(cacheKey); cache.set(cacheKey, hit); return hit; }
  const result = forecast(input());
  cache.set(cacheKey, result);
  if (cache.size > 40) cache.delete(cache.keys().next().value!);
  return result;
}
