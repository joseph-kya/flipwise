import type { ReviewEvent } from '../reviewLog';

export interface SubjectDayStats {
  subjectId: string;
  cardsStudied: number;
  newCardsLearned: number;
  durationMs: number;
  mistakes: number; // again
  hard: number;     // hard
  correct: number;  // good + easy
  accuracy: number; // 0..1
}

export interface DayStats {
  dateKey: string;  // YYYY-MM-DD in local time (or given timeZone)
  cardsStudied: number;
  newCardsLearned: number;
  durationMs: number;
  mistakes: number; // again
  hard: number;     // hard
  correct: number;  // good + easy
  good: number;
  easy: number;
  accuracy: number; // 0..1
  subjects: SubjectDayStats[];
}

export interface PeriodSummary {
  activeDays: number;
  cardsStudied: number;
  newCardsLearned: number;
  durationMs: number;
  mistakes: number;
  hard: number;
  correct: number;
  accuracy: number; // 0..1
}

export interface StreakStats {
  current: number;
  longest: number;
  activeToday: boolean;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getDateKeyFormatter(timeZone?: string): Intl.DateTimeFormat {
  const cacheKey = timeZone ?? '__local__';
  const cached = formatterCache.get(cacheKey);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  formatterCache.set(cacheKey, formatter);
  return formatter;
}

/**
 * Formats a Date or ISO timestamp into a local 'YYYY-MM-DD' date key
 * using Intl.DateTimeFormat (never UTC slicing).
 */
export function toLocalDateKey(input: string | Date, timeZone?: string): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid date: ${String(input)}`);
  }
  const parts = getDateKeyFormatter(timeZone).formatToParts(date);
  let year = '';
  let month = '';
  let day = '';
  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    else if (part.type === 'month') month = part.value;
    else if (part.type === 'day') day = part.value;
  }
  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** Study dates use the local 04:00 boundary, including named time zones. */
export function toStudyDateKey(input: string | Date, timeZone?: string): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  const hour = Number(new Intl.DateTimeFormat('en-GB', {timeZone, hour: '2-digit', hourCycle: 'h23'}).format(date));
  const key = toLocalDateKey(date, timeZone);
  return hour < 4 ? shiftDateKey(key, -1) : key;
}

export function formatDateKey(year: number, monthIndex: number, day: number): string {
  const y = String(year).padStart(4, '0');
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateKey(dateKey: string): { year: number; monthIndex: number; day: number } {
  const [yStr, mStr, dStr] = dateKey.split('-');
  return {
    year: Number(yStr),
    monthIndex: Number(mStr) - 1,
    day: Number(dStr),
  };
}

/**
 * Pure calendar day arithmetic on 'YYYY-MM-DD' keys, immune to DST shifts.
 */
export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const { year, monthIndex, day } = parseDateKey(dateKey);
  const shifted = new Date(Date.UTC(year, monthIndex, day + deltaDays));
  return formatDateKey(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
}

/**
 * Monday = 0, Tuesday = 1, ..., Sunday = 6.
 */
export function weekdayMondayFirst(year: number, monthIndex: number, day: number): number {
  const utcDay = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
  return (utcDay + 6) % 7;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

interface MutableSubjectBucket {
  subjectId: string;
  cardsStudied: number;
  newCardsLearned: number;
  durationMs: number;
  mistakes: number;
  hard: number;
  correct: number;
}

interface MutableDayBucket {
  dateKey: string;
  cardsStudied: number;
  newCardsLearned: number;
  durationMs: number;
  mistakes: number;
  hard: number;
  correct: number;
  good: number;
  easy: number;
  subjects: Map<string, MutableSubjectBucket>;
}

/**
 * Aggregates raw ReviewEvent[] into a Map<'YYYY-MM-DD', DayStats> in local dates.
 * Correct = good | easy. Mistake = again. Hard = hard.
 */
export function aggregateByDay(
  events: readonly ReviewEvent[],
  timeZone?: string,
): Map<string, DayStats> {
  const buckets = new Map<string, MutableDayBucket>();

  for (const event of events) {
    const parsedDate = new Date(event.at);
    if (Number.isNaN(parsedDate.getTime())) continue;

    const dateKey = toStudyDateKey(parsedDate, timeZone);
    let day = buckets.get(dateKey);
    if (!day) {
      day = {
        dateKey,
        cardsStudied: 0,
        newCardsLearned: 0,
        durationMs: 0,
        mistakes: 0,
        hard: 0,
        correct: 0,
        good: 0,
        easy: 0,
        subjects: new Map(),
      };
      buckets.set(dateKey, day);
    }

    const duration = Math.max(0, Number.isFinite(event.durationMs) ? event.durationMs : 0);
    const isMistake = event.rating === 'again';
    const isHard = event.rating === 'hard';
    const isGood = event.rating === 'good';
    const isEasy = event.rating === 'easy';
    const isCorrect = isGood || isEasy;

    day.cardsStudied += 1;
    if (event.isNew) day.newCardsLearned += 1;
    day.durationMs += duration;
    if (isMistake) day.mistakes += 1;
    if (isHard) day.hard += 1;
    if (isGood) day.good += 1;
    if (isEasy) day.easy += 1;
    if (isCorrect) day.correct += 1;

    let subj = day.subjects.get(event.subjectId);
    if (!subj) {
      subj = {
        subjectId: event.subjectId,
        cardsStudied: 0,
        newCardsLearned: 0,
        durationMs: 0,
        mistakes: 0,
        hard: 0,
        correct: 0,
      };
      day.subjects.set(event.subjectId, subj);
    }
    subj.cardsStudied += 1;
    if (event.isNew) subj.newCardsLearned += 1;
    subj.durationMs += duration;
    if (isMistake) subj.mistakes += 1;
    if (isHard) subj.hard += 1;
    if (isCorrect) subj.correct += 1;
  }

  const result = new Map<string, DayStats>();
  const sortedKeys = Array.from(buckets.keys()).sort();

  for (const key of sortedKeys) {
    const b = buckets.get(key)!;
    const subjects: SubjectDayStats[] = Array.from(b.subjects.values())
      .map((s) => ({
        subjectId: s.subjectId,
        cardsStudied: s.cardsStudied,
        newCardsLearned: s.newCardsLearned,
        durationMs: s.durationMs,
        mistakes: s.mistakes,
        hard: s.hard,
        correct: s.correct,
        accuracy: s.cardsStudied > 0 ? s.correct / s.cardsStudied : 0,
      }))
      .sort((a, z) => z.cardsStudied - a.cardsStudied || a.subjectId.localeCompare(z.subjectId));

    result.set(key, {
      dateKey: b.dateKey,
      cardsStudied: b.cardsStudied,
      newCardsLearned: b.newCardsLearned,
      durationMs: b.durationMs,
      mistakes: b.mistakes,
      hard: b.hard,
      correct: b.correct,
      good: b.good,
      easy: b.easy,
      accuracy: b.cardsStudied > 0 ? b.correct / b.cardsStudied : 0,
      subjects,
    });
  }

  return result;
}

function summarizeDays(days: Iterable<DayStats>): PeriodSummary {
  let activeDays = 0;
  let cardsStudied = 0;
  let newCardsLearned = 0;
  let durationMs = 0;
  let mistakes = 0;
  let hard = 0;
  let correct = 0;

  for (const day of days) {
    if (day.cardsStudied <= 0) continue;
    activeDays += 1;
    cardsStudied += day.cardsStudied;
    newCardsLearned += day.newCardsLearned;
    durationMs += day.durationMs;
    mistakes += day.mistakes;
    hard += day.hard;
    correct += day.correct;
  }

  return {
    activeDays,
    cardsStudied,
    newCardsLearned,
    durationMs,
    mistakes,
    hard,
    correct,
    accuracy: cardsStudied > 0 ? correct / cardsStudied : 0,
  };
}

/**
 * Summarizes all studied days within a given year and 0-based monthIndex.
 */
export function monthSummary(
  byDay: ReadonlyMap<string, DayStats>,
  year: number,
  monthIndex: number,
): PeriodSummary {
  const prefix = `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}-`;
  const matching: DayStats[] = [];
  for (const [key, stats] of byDay.entries()) {
    if (key.startsWith(prefix)) {
      matching.push(stats);
    }
  }
  return summarizeDays(matching);
}

/**
 * Summarizes the Monday–Sunday calendar week containing anchorDateKey.
 */
export function weekSummary(
  byDay: ReadonlyMap<string, DayStats>,
  anchorDateKey: string,
): PeriodSummary {
  const { year, monthIndex, day } = parseDateKey(anchorDateKey);
  const offsetFromMonday = weekdayMondayFirst(year, monthIndex, day);
  const mondayKey = shiftDateKey(anchorDateKey, -offsetFromMonday);

  const matching: DayStats[] = [];
  for (let i = 0; i < 7; i++) {
    const key = shiftDateKey(mondayKey, i);
    const stats = byDay.get(key);
    if (stats) matching.push(stats);
  }
  return summarizeDays(matching);
}

/**
 * Computes current and longest consecutive-day study streaks.
 * Current streak stays alive if today has reviews OR yesterday had reviews
 * (so opening the app before today's session doesn't zero out an active streak).
 */
export function streak(
  byDay: ReadonlyMap<string, DayStats>,
  todayKey: string,
): StreakStats {
  const isActive = (key: string) => (byDay.get(key)?.cardsStudied ?? 0) > 0;
  const activeToday = isActive(todayKey);

  // Current streak
  let current = 0;
  let cursor = activeToday ? todayKey : shiftDateKey(todayKey, -1);
  while (isActive(cursor)) {
    current += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  // Longest streak across all recorded days
  const activeKeys = Array.from(byDay.entries())
    .filter(([, stats]) => stats.cardsStudied > 0)
    .map(([key]) => key)
    .sort();

  let longest = 0;
  let run = 0;
  let prevKey: string | null = null;

  for (const key of activeKeys) {
    if (prevKey && shiftDateKey(prevKey, 1) === key) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prevKey = key;
  }

  return { current, longest, activeToday };
}

export function heatmapLevel(cardsStudied: number): 0 | 1 | 2 | 3 | 4 {
  if (cardsStudied <= 0) return 0;
  if (cardsStudied < 15) return 1;
  if (cardsStudied < 30) return 2;
  if (cardsStudied < 45) return 3;
  return 4;
}

export function formatDuration(durationMs: number): string {
  if (durationMs <= 0) return '0m';
  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 60) return '<1m';
  const totalMinutes = Math.round(durationMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
