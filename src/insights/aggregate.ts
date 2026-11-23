import { State, type Card } from 'ts-fsrs';
import { subjects as demoSubjects, type Subject } from '../demoSubjects';
import { stableCardId } from '../anki/types';
import { mastery } from '../mastery';
import type { Rating, ReviewEvent } from '../reviewLog';
import { isLeech, schedule, studyDay } from '../scheduler';
import {
  aggregateByDay,
  parseDateKey,
  shiftDateKey,
  streak,
  toStudyDateKey,
} from '../calendar/dailyStats';

export type RangeKey = '7d' | '30d' | '90d' | '1y';
export type SubjectFilter = 'all' | string;
export type ChartId =
  | 'heatmap'
  | 'reviews'
  | 'time'
  | 'retention'
  | 'forecast'
  | 'states'
  | 'distributions'
  | 'hourly'
  | 'subjects'
  | 'streaks'
  | 'leeches'
  | 'answer-time';

export interface CatalogItem {
  cardId: string;
  subjectId: string;
  lessonId: string;
  front: string;
}

export interface InsightsFilter {
  range: RangeKey;
  subjectId: SubjectFilter;
  targetRetention: number;
  today?: Date;
  timeZone?: string;
}

export interface HeatmapCell {
  dateKey: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
  weekIndex: number;
  dayOfWeek: number; // 0 = Mon .. 6 = Sun
}

export interface StackedBucket {
  key: string;
  label: string;
  again: number;
  hard: number;
  good: number;
  easy: number;
  total: number;
}

export interface TimeBucket {
  key: string;
  label: string;
  durationMs: number;
  minutes: number;
}

export interface RetentionPoint {
  key: string;
  label: string;
  passed: number;
  total: number;
  rate: number; // 0..100
}

export interface ForecastDay {
  dayOffset: number;
  dateKey: string;
  label: string;
  count: number;
  cumulative: number;
}

export interface CardStateSlice {
  id: 'new' | 'learning' | 'young' | 'mature' | 'leech';
  label: string;
  count: number;
  percent: number;
}

export interface HistogramBin {
  label: string;
  count: number;
  isMedian?: boolean;
}

export interface HourBucket {
  hour: number;
  label: string;
  reviews: number;
  correct: number;
  accuracy: number; // 0..100
  isBest: boolean;
}

export interface LessonAccuracyRow {
  lessonId: string;
  title: string;
  reviews: number;
  accuracy: number | null;
  masteryLabel: string;
  cardCount: number;
}

export interface SubjectAccuracyRow {
  subjectId: string;
  name: string;
  reviews: number;
  accuracy: number | null;
  lessons: LessonAccuracyRow[];
}

export interface HardCardItem {
  cardId: string;
  subjectId: string;
  subjectName: string;
  lessonId: string;
  lessonTitle: string;
  front: string;
  lapses: number;
  difficulty: number;
  isLeech: boolean;
}

export interface InsightsData {
  todayKey: string;
  rangeDays: number;
  totalReviewsInRange: number;
  heatmap: {
    cells: HeatmapCell[];
    weeks: number;
    monthLabels: Array<{ weekIndex: number; label: string }>;
    totalYearReviews: number;
    activeYearDays: number;
  };
  reviews: {
    buckets: StackedBucket[];
    total: number;
    avgPerDay: number;
    totalsByRating: Record<Rating, number>;
  };
  time: {
    buckets: TimeBucket[];
    totalMs: number;
    avgMsPerActiveDay: number;
  };
  retention: {
    points: RetentionPoint[];
    overallRate: number | null; // 0..100
    reviewTotal: number;
    reviewPassed: number;
    targetPercent: number;
  };
  forecast: {
    days: ForecastDay[];
    dueToday: number;
    dueNext7: number;
    dueNext30: number;
  };
  states: {
    slices: CardStateSlice[];
    total: number;
    matureCount: number;
    maturePercent: number;
    leechCount: number;
  };
  distributions: {
    interval: HistogramBin[];
    difficulty: HistogramBin[];
    stability: HistogramBin[];
    medianIntervalDays: number;
    avgDifficulty: number;
    medianStabilityDays: number;
  };
  hourly: {
    buckets: HourBucket[];
    bestHour: HourBucket | null;
  };
  subjects: SubjectAccuracyRow[];
  streaks: {
    current: number;
    longest: number;
    activeToday: boolean;
    daysInRange: number;
    rangeDays: number;
    recentDays: Array<{ dateKey: string; count: number; level: 0 | 1 | 2 | 3 | 4 }>;
  };
  leeches: {
    items: HardCardItem[];
    leechCount: number;
  };
  answerTime: {
    bins: HistogramBin[];
    medianSec: number | null;
    avgSec: number | null;
    sampleCount: number;
  };
}

export const RANGE_DAYS: Record<RangeKey, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
};

function shortDayLabel(dateKey: string): string {
  const { year, monthIndex, day } = parseDateKey(dateKey);
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(
    new Date(year, monthIndex, day, 12, 0, 0),
  );
}

function shortMonthLabel(dateKey: string): string {
  const { year, monthIndex } = parseDateKey(dateKey);
  return new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(
    new Date(year, monthIndex, 1, 12, 0, 0),
  );
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function heatmapBucketLevel(count: number, maxCount: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  const scale = Math.max(20, maxCount);
  const ratio = count / scale;
  if (ratio < 0.25) return 1;
  if (ratio < 0.5) return 2;
  if (ratio < 0.78) return 3;
  return 4;
}

function getLocalHour(iso: string, timeZone?: string): number {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 12;
  if (!timeZone) return date.getHours();
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return Number(formatted) % 24;
}

interface ReplayEntry {
  event: ReviewEvent;
  dateKey: string;
  stateBefore: State;
}

function replayHistory(
  events: readonly ReviewEvent[],
  timeZone?: string,
): { states: Map<string, Card>; entries: ReplayEntry[] } {
  const ordered = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const states = new Map<string, Card>();
  const entries: ReplayEntry[] = [];

  for (const event of ordered) {
    const at = new Date(event.at);
    if (Number.isNaN(at.getTime())) continue;
    const prev = states.get(event.cardId);
    const stateBefore = prev ? prev.state : State.New;
    const next = schedule(prev, event.rating, at, event.retention ?? 0.9, event.fuzz ?? true);
    states.set(event.cardId, next);
    entries.push({
      event,
      dateKey: toStudyDateKey(at, timeZone),
      stateBefore,
    });
  }

  return { states, entries };
}

function buildBuckets(todayKey: string, rangeDays: number): Array<{ keys: string[]; key: string; label: string }> {
  const bucketSize = rangeDays <= 30 ? 1 : rangeDays <= 90 ? 3 : 14;
  const startKey = shiftDateKey(todayKey, -(rangeDays - 1));
  const buckets: Array<{ keys: string[]; key: string; label: string }> = [];

  for (let offset = 0; offset < rangeDays; offset += bucketSize) {
    const size = Math.min(bucketSize, rangeDays - offset);
    const keys: string[] = [];
    for (let i = 0; i < size; i++) {
      keys.push(shiftDateKey(startKey, offset + i));
    }
    const first = keys[0];
    const last = keys[keys.length - 1];
    buckets.push({
      keys,
      key: first,
      label: size === 1 ? shortDayLabel(first) : `${shortDayLabel(first)}–${shortDayLabel(last)}`,
    });
  }
  return buckets;
}

export function buildDefaultCatalog(subjects: Subject[] = demoSubjects): CatalogItem[] {
  return subjects.flatMap((s) =>
    s.lectures.flatMap((l) =>
      l.cards.map((c) => ({
        cardId: stableCardId(s.id,l.id,c),
        subjectId: s.id,
        lessonId: l.id,
        front: c.front,
      })),
    ),
  );
}

/**
 * Pure aggregation engine powering all 12 Insights charts and detail views.
 */
export function computeInsights(
  allEvents: readonly ReviewEvent[],
  catalog: readonly CatalogItem[],
  filter: InsightsFilter,
  subjects: Subject[] = demoSubjects,
): InsightsData {
  const today = filter.today ?? new Date();
  const todayKey = toStudyDateKey(today, filter.timeZone);
  const rangeDays = RANGE_DAYS[filter.range];
  const rangeStartKey = shiftDateKey(todayKey, -(rangeDays - 1));

  // Subject-filtered datasets
  const subjectEvents =
    filter.subjectId === 'all'
      ? allEvents
      : allEvents.filter((e) => e.subjectId === filter.subjectId);
  const subjectCatalog =
    filter.subjectId === 'all'
      ? catalog
      : catalog.filter((c) => c.subjectId === filter.subjectId);

  // Single-pass chronological FSRS replay on subject-filtered history
  const { states, entries } = replayHistory(subjectEvents, filter.timeZone);

  // Range-filtered entries
  const rangeEntries = entries.filter(
    (entry) => entry.dateKey >= rangeStartKey && entry.dateKey <= todayKey,
  );
  const rangeEvents = rangeEntries.map((e) => e.event);

  const byDayAll = aggregateByDay(subjectEvents, filter.timeZone);

  // 1. Year heatmap (52 weeks ending on the Sunday of today's week, or ending today aligned to Mon..Sun)
  const { year: ty, monthIndex: tm, day: td } = parseDateKey(todayKey);
  const todayDow = (new Date(Date.UTC(ty, tm, td)).getUTCDay() + 6) % 7; // 0=Mon..6=Sun
  const totalHeatmapDays = 51 * 7 + (todayDow + 1);
  const heatmapStartKey = shiftDateKey(todayKey, -(totalHeatmapDays - 1));

  let maxHeat = 0;
  const rawHeat: Array<{ dateKey: string; count: number; weekIndex: number; dayOfWeek: number }> = [];
  let totalYearReviews = 0;
  let activeYearDays = 0;
  const monthLabels: Array<{ weekIndex: number; label: string }> = [];
  let lastMonthSeen = -1;

  for (let i = 0; i < totalHeatmapDays; i++) {
    const dateKey = shiftDateKey(heatmapStartKey, i);
    const count = byDayAll.get(dateKey)?.cardsStudied ?? 0;
    const weekIndex = Math.floor(i / 7);
    const dayOfWeek = i % 7;
    if (count > maxHeat) maxHeat = count;
    if (count > 0) {
      totalYearReviews += count;
      activeYearDays++;
    }
    const { monthIndex } = parseDateKey(dateKey);
    if (dayOfWeek === 0 && monthIndex !== lastMonthSeen) {
      monthLabels.push({ weekIndex, label: shortMonthLabel(dateKey) });
      lastMonthSeen = monthIndex;
    }
    rawHeat.push({ dateKey, count, weekIndex, dayOfWeek });
  }

  const heatmapCells: HeatmapCell[] = rawHeat.map((c) => ({
    ...c,
    level: heatmapBucketLevel(c.count, maxHeat),
  }));

  // Index range entries by day for fast bucket construction
  const rangeByDay = new Map<string, ReplayEntry[]>();
  for (const entry of rangeEntries) {
    const list = rangeByDay.get(entry.dateKey);
    if (list) list.push(entry);
    else rangeByDay.set(entry.dateKey, [entry]);
  }

  const bucketDefs = buildBuckets(todayKey, rangeDays);

  // 2. Daily reviews stacked by rating & 3. Time studied & 4. True retention
  const reviewBuckets: StackedBucket[] = [];
  const timeBuckets: TimeBucket[] = [];
  const retentionPoints: RetentionPoint[] = [];

  const totalsByRating: Record<Rating, number> = { again: 0, hard: 0, good: 0, easy: 0 };
  let totalRangeDurationMs = 0;
  let activeRangeDays = 0;
  let totalReviewAnswers = 0;
  let totalReviewPassed = 0;

  for (const b of bucketDefs) {
    let again = 0;
    let hard = 0;
    let good = 0;
    let easy = 0;
    let durationMs = 0;
    let revTotal = 0;
    let revPassed = 0;

    for (const dk of b.keys) {
      const list = rangeByDay.get(dk);
      if (!list || list.length === 0) continue;
      activeRangeDays++;
      for (const item of list) {
        const r = item.event.rating;
        if (r === 'again') again++;
        else if (r === 'hard') hard++;
        else if (r === 'good') good++;
        else easy++;

        totalsByRating[r]++;
        const dur = Math.max(0, Number.isFinite(item.event.durationMs) ? item.event.durationMs : 0);
        durationMs += dur;
        totalRangeDurationMs += dur;

        if (item.stateBefore === State.Review) {
          revTotal++;
          totalReviewAnswers++;
          if (r !== 'again') {
            revPassed++;
            totalReviewPassed++;
          }
        }
      }
    }

    const total = again + hard + good + easy;
    reviewBuckets.push({ key: b.key, label: b.label, again, hard, good, easy, total });
    timeBuckets.push({
      key: b.key,
      label: b.label,
      durationMs,
      minutes: Math.round((durationMs / 60000) * 10) / 10,
    });
    if (revTotal > 0) {
      retentionPoints.push({
        key: b.key,
        label: b.label,
        passed: revPassed,
        total: revTotal,
        rate: Math.round((revPassed / revTotal) * 100),
      });
    }
  }

  const totalReviewsInRange = rangeEntries.length;

  // 5. Forecast of due cards for next 30 days
  const forecastCounts = new Array<number>(30).fill(0);
  for (const item of subjectCatalog) {
    const card = states.get(item.cardId);
    if (!card) continue;
    const dueKey = studyDay(card.due);
    if (dueKey <= todayKey) {
      forecastCounts[0]++;
    } else {
      // Compute offset from todayKey
      const a = parseDateKey(todayKey);
      const b = parseDateKey(dueKey);
      const diffDays = Math.round(
        (Date.UTC(b.year, b.monthIndex, b.day) - Date.UTC(a.year, a.monthIndex, a.day)) / 86400000,
      );
      if (diffDays >= 0 && diffDays < 30) {
        forecastCounts[diffDays]++;
      }
    }
  }

  let runningDue = 0;
  const forecastDays: ForecastDay[] = forecastCounts.map((count, dayOffset) => {
    const dateKey = shiftDateKey(todayKey, dayOffset);
    runningDue += count;
    return {
      dayOffset,
      dateKey,
      label: dayOffset === 0 ? 'Today' : dayOffset === 1 ? 'Tomorrow' : shortDayLabel(dateKey),
      count,
      cumulative: runningDue,
    };
  });

  // 6. Card states donut (New / Learning / Young / Mature / Leech)
  let newCount = 0;
  let learningCount = 0;
  let youngCount = 0;
  let matureCount = 0;
  let leechCount = 0;

  const intervals: number[] = [];
  const difficulties: number[] = [];
  const stabilities: number[] = [];

  for (const item of subjectCatalog) {
    const card = states.get(item.cardId);
    if (!card || card.state === State.New) {
      newCount++;
      continue;
    }

    if (card.scheduled_days > 0 || card.state === State.Review) {
      intervals.push(Math.max(0, card.scheduled_days));
    }
    if (Number.isFinite(card.difficulty) && card.difficulty > 0) {
      difficulties.push(card.difficulty);
    }
    if (Number.isFinite(card.stability) && card.stability > 0) {
      stabilities.push(card.stability);
    }

    if (isLeech(card)) {
      leechCount++;
    } else if (card.state === State.Learning || card.state === State.Relearning) {
      learningCount++;
    } else if (card.scheduled_days < 21) {
      youngCount++;
    } else {
      matureCount++;
    }
  }

  const totalCatalog = subjectCatalog.length;
  const pct = (n: number) => (totalCatalog > 0 ? Math.round((n / totalCatalog) * 100) : 0);
  const stateSlices: CardStateSlice[] = [
    { id: 'mature', label: 'Mature', count: matureCount, percent: pct(matureCount) },
    { id: 'young', label: 'Young', count: youngCount, percent: pct(youngCount) },
    { id: 'learning', label: 'Learning', count: learningCount, percent: pct(learningCount) },
    { id: 'new', label: 'New', count: newCount, percent: pct(newCount) },
    ...(leechCount > 0
      ? [{ id: 'leech' as const, label: 'Leech', count: leechCount, percent: pct(leechCount) }]
      : []),
  ];

  // 7. Distributions: interval, difficulty, stability histograms
  const intervalRanges: Array<{ label: string; min: number; max: number }> = [
    { label: '<1d', min: 0, max: 1 },
    { label: '1–3d', min: 1, max: 4 },
    { label: '4–7d', min: 4, max: 8 },
    { label: '8–21d', min: 8, max: 21 },
    { label: '21–60d', min: 21, max: 60 },
    { label: '60d+', min: 60, max: Infinity },
  ];
  const medianInt = median(intervals);
  const intervalBins: HistogramBin[] = intervalRanges.map((r) => ({
    label: r.label,
    count: intervals.filter((v) => v >= r.min && v < r.max).length,
    isMedian: intervals.length > 0 && medianInt >= r.min && medianInt < r.max,
  }));

  const avgDifficulty =
    difficulties.length > 0
      ? Math.round((difficulties.reduce((s, v) => s + v, 0) / difficulties.length) * 10) / 10
      : 0;
  const difficultyBins: HistogramBin[] = Array.from({ length: 10 }, (_, idx) => {
    const low = idx + 1;
    const high = idx === 9 ? 11 : idx + 2;
    return {
      label: String(low),
      count: difficulties.filter((v) => v >= low && v < high).length,
      isMedian: difficulties.length > 0 && Math.round(avgDifficulty) === low,
    };
  });

  const stabilityRanges: Array<{ label: string; min: number; max: number }> = [
    { label: '<2d', min: 0, max: 2 },
    { label: '2–7d', min: 2, max: 7 },
    { label: '7–21d', min: 7, max: 21 },
    { label: '21–60d', min: 21, max: 60 },
    { label: '60d+', min: 60, max: Infinity },
  ];
  const medianStab = median(stabilities);
  const stabilityBins: HistogramBin[] = stabilityRanges.map((r) => ({
    label: r.label,
    count: stabilities.filter((v) => v >= r.min && v < r.max).length,
    isMedian: stabilities.length > 0 && medianStab >= r.min && medianStab < r.max,
  }));

  // 8. Hourly breakdown
  const hourAccum = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    reviews: 0,
    correct: 0,
  }));
  for (const event of rangeEvents) {
    const h = getLocalHour(event.at, filter.timeZone);
    hourAccum[h].reviews++;
    if (event.rating === 'good' || event.rating === 'easy') {
      hourAccum[h].correct++;
    }
  }

  const eligibleHours = hourAccum.filter((h) => h.reviews >= 5);
  const candidatePool = eligibleHours.length > 0 ? eligibleHours : hourAccum.filter((h) => h.reviews > 0);
  let bestHourNum: number | null = null;
  let bestScore = -1;
  for (const h of candidatePool) {
    const acc = h.correct / h.reviews;
    if (acc > bestScore || (acc === bestScore && bestHourNum !== null && h.reviews > hourAccum[bestHourNum].reviews)) {
      bestScore = acc;
      bestHourNum = h.hour;
    }
  }

  const hourlyBuckets: HourBucket[] = hourAccum.map((h) => ({
    hour: h.hour,
    label: h.label,
    reviews: h.reviews,
    correct: h.correct,
    accuracy: h.reviews > 0 ? Math.round((h.correct / h.reviews) * 100) : 0,
    isBest: h.hour === bestHourNum,
  }));

  // 9. Per-subject and per-lesson accuracy table + mastery
  const visibleSubjects =
    filter.subjectId === 'all'
      ? subjects
      : subjects.filter((s) => s.id === filter.subjectId);

  const subjectRows: SubjectAccuracyRow[] = visibleSubjects.map((s) => {
    const sEvents = rangeEvents.filter((e) => e.subjectId === s.id);
    const sCorrect = sEvents.filter((e) => e.rating === 'good' || e.rating === 'easy').length;
    const lessons: LessonAccuracyRow[] = s.lectures.map((l) => {
      const lEvents = sEvents.filter((e) => e.lessonId === l.id);
      const lCorrect = lEvents.filter((e) => e.rating === 'good' || e.rating === 'easy').length;
      const m = mastery(
        subjectEvents as ReviewEvent[],
        s.id,
        l.id,
        l.cards.map((c) => stableCardId(s.id,l.id,c)),
      );
      return {
        lessonId: l.id,
        title: l.title,
        reviews: lEvents.length,
        accuracy: lEvents.length > 0 ? Math.round((lCorrect / lEvents.length) * 100) : null,
        masteryLabel: m.label,
        cardCount: l.cards.length,
      };
    });
    return {
      subjectId: s.id,
      name: s.name,
      reviews: sEvents.length,
      accuracy: sEvents.length > 0 ? Math.round((sCorrect / sEvents.length) * 100) : null,
      lessons,
    };
  });

  // 10. Streaks
  const streakStats = streak(byDayAll, todayKey);
  const recentDays = Array.from({ length: 14 }, (_, idx) => {
    const dateKey = shiftDateKey(todayKey, -(13 - idx));
    const count = byDayAll.get(dateKey)?.cardsStudied ?? 0;
    return { dateKey, count, level: heatmapBucketLevel(count, maxHeat) };
  });

  // 11. Leeches & hardest cards (top 10)
  const subjectNameMap = new Map(subjects.map((s) => [s.id, s.name]));
  const lessonTitleMap = new Map(
    subjects.flatMap((s) => s.lectures.map((l) => [`${s.id}/${l.id}`, l.title] as const)),
  );

  const hardCandidates: HardCardItem[] = [];
  for (const item of subjectCatalog) {
    const card = states.get(item.cardId);
    if (!card || card.reps === 0) continue;
    hardCandidates.push({
      cardId: item.cardId,
      subjectId: item.subjectId,
      subjectName: subjectNameMap.get(item.subjectId) ?? item.subjectId,
      lessonId: item.lessonId,
      lessonTitle: lessonTitleMap.get(`${item.subjectId}/${item.lessonId}`) ?? item.lessonId,
      front: item.front,
      lapses: card.lapses,
      difficulty: Math.round(card.difficulty * 10) / 10,
      isLeech: isLeech(card),
    });
  }

  hardCandidates.sort(
    (a, b) =>
      Number(b.isLeech) - Number(a.isLeech) ||
      b.lapses - a.lapses ||
      b.difficulty - a.difficulty ||
      a.cardId.localeCompare(b.cardId),
  );

  // 12. Answer time distribution
  const durationsSec = rangeEvents
    .map((e) => e.durationMs / 1000)
    .filter((sec) => Number.isFinite(sec) && sec > 0 && sec < 600);

  const answerRanges: Array<{ label: string; min: number; max: number }> = [
    { label: '<5s', min: 0, max: 5 },
    { label: '5–10s', min: 5, max: 10 },
    { label: '10–15s', min: 10, max: 15 },
    { label: '15–20s', min: 15, max: 20 },
    { label: '20–30s', min: 20, max: 30 },
    { label: '30s+', min: 30, max: Infinity },
  ];
  const medianSec = durationsSec.length > 0 ? Math.round(median(durationsSec) * 10) / 10 : null;
  const avgSec =
    durationsSec.length > 0
      ? Math.round((durationsSec.reduce((s, v) => s + v, 0) / durationsSec.length) * 10) / 10
      : null;
  const answerBins: HistogramBin[] = answerRanges.map((r) => ({
    label: r.label,
    count: durationsSec.filter((v) => v >= r.min && v < r.max).length,
    isMedian: medianSec !== null && medianSec >= r.min && medianSec < r.max,
  }));

  return {
    todayKey,
    rangeDays,
    totalReviewsInRange,
    heatmap: {
      cells: heatmapCells,
      weeks: Math.ceil(totalHeatmapDays / 7),
      monthLabels,
      totalYearReviews,
      activeYearDays,
    },
    reviews: {
      buckets: reviewBuckets,
      total: totalReviewsInRange,
      avgPerDay: Math.round((totalReviewsInRange / rangeDays) * 10) / 10,
      totalsByRating,
    },
    time: {
      buckets: timeBuckets,
      totalMs: totalRangeDurationMs,
      avgMsPerActiveDay: activeRangeDays > 0 ? Math.round(totalRangeDurationMs / activeRangeDays) : 0,
    },
    retention: {
      points: retentionPoints,
      overallRate:
        totalReviewAnswers > 0 ? Math.round((totalReviewPassed / totalReviewAnswers) * 100) : null,
      reviewTotal: totalReviewAnswers,
      reviewPassed: totalReviewPassed,
      targetPercent: Math.round(filter.targetRetention * 100),
    },
    forecast: {
      days: forecastDays,
      dueToday: forecastDays[0]?.count ?? 0,
      dueNext7: forecastDays.slice(0, 7).reduce((s, d) => s + d.count, 0),
      dueNext30: runningDue,
    },
    states: {
      slices: stateSlices,
      total: totalCatalog,
      matureCount,
      maturePercent: pct(matureCount),
      leechCount,
    },
    distributions: {
      interval: intervalBins,
      difficulty: difficultyBins,
      stability: stabilityBins,
      medianIntervalDays: Math.round(medianInt * 10) / 10,
      avgDifficulty,
      medianStabilityDays: Math.round(medianStab * 10) / 10,
    },
    hourly: {
      buckets: hourlyBuckets,
      bestHour: bestHourNum !== null ? hourlyBuckets[bestHourNum] : null,
    },
    subjects: subjectRows,
    streaks: {
      current: streakStats.current,
      longest: streakStats.longest,
      activeToday: streakStats.activeToday,
      daysInRange: activeRangeDays,
      rangeDays,
      recentDays,
    },
    leeches: {
      items: hardCandidates.slice(0, 10),
      leechCount,
    },
    answerTime: {
      bins: answerBins,
      medianSec,
      avgSec,
      sampleCount: durationsSec.length,
    },
  };
}
