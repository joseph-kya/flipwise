import { State, type Card } from 'ts-fsrs';
import { subjects } from '../demoSubjects';
import type { Rating, ReviewEvent } from '../reviewLog';
import { schedule, studyDay } from '../scheduler';

export const DEMO_CLEARED_STORAGE_KEY = 'flipwise.demoCleared.v1';

function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DemoCardSpec {
  cardId: string;
  subjectId: string;
  lessonId: string;
  lessonIndex: number;
  isHardCard: boolean;
}

const DEMO_CARDS: DemoCardSpec[] = subjects.flatMap((subject) =>
  // Leave the final lesson untouched so "Not started" mastery and "New" states stay represented.
  subject.lectures.slice(0, -1).flatMap((lesson, lessonIndex) =>
    lesson.cards.map((card, cardIndex) => ({
      cardId: `${subject.id}/${lesson.id}/${card.id}`,
      subjectId: subject.id,
      lessonId: lesson.id,
      lessonIndex,
      // Designate a few specific cards as challenging so realistic leeches emerge naturally.
      isHardCard: lessonIndex === 2 && cardIndex < 2,
    })),
  ),
);

// Realistic skipped study days across 120 days while preserving a 9-day current streak ending today
// and a 17-day longest streak earlier in the window.
const REST_DAYS_AGO = new Set<number>([
  9, 15, 22, 23, 31, 38, 45, 52, 53, 60, 68, 75, 82, 83, 91, 98, 105, 112, 117,
]);

/**
 * Deterministically replays ~120 days of realistic study reviews through the real FSRS scheduler.
 * Marks every generated event with `demo: true` so it can be cleanly removed later.
 */
export function seedDemoHistory(
  referenceDate: Date = new Date(),
  retention = 0.9,
): ReviewEvent[] {
  const rand = createPrng(0xf11b0120);
  const events: ReviewEvent[] = [];
  const states = new Map<string, Card>();
  const seen = new Set<string>();

  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth();
  const refDay = referenceDate.getDate();

  let seq = 1;
  let newCursor = 0;

  // Deterministic order of cards to introduce progressively over 120 days.
  const introOrder = [...DEMO_CARDS].sort((a, b) => {
    const bucketA = a.lessonIndex * 10 + (a.isHardCard ? 0 : 1);
    const bucketB = b.lessonIndex * 10 + (b.isHardCard ? 0 : 1);
    return bucketA - bucketB || a.cardId.localeCompare(b.cardId);
  });

  // Realistic study hours weighted toward 09:00–10:00 (best focus) and 18:00–21:00.
  const hourBuckets = [8, 9, 9, 9, 10, 10, 11, 14, 15, 16, 18, 19, 19, 20, 21, 22];

  const record = (spec: DemoCardSpec, rating: Rating, at: Date) => {
    const prev = states.get(spec.cardId);
    const next = schedule(prev, rating, at, retention, false);
    states.set(spec.cardId, next);

    const isNew = !seen.has(spec.cardId);
    seen.add(spec.cardId);

    const baseMs =
      rating === 'again'
        ? 18500
        : rating === 'hard'
          ? 14500
          : rating === 'good'
            ? 8800
            : 5200;
    const durationMs = Math.round(baseMs + rand() * 7500);

    events.push({
      id: `demo-fsrs-${seq++}`,
      cardId: spec.cardId,
      subjectId: spec.subjectId,
      lessonId: spec.lessonId,
      rating,
      at: at.toISOString(),
      durationMs,
      retention,
      fuzz: false,
      isNew,
      demo: true,
    });
    return next;
  };

  for (let daysAgo = 119; daysAgo >= 0; daysAgo--) {
    if (REST_DAYS_AGO.has(daysAgo)) {
      rand();
      continue;
    }

    const dayDate = new Date(refYear, refMonth, refDay - daysAgo, 12, 0, 0);
    const currentDayKey = studyDay(dayDate);

    // Choose a realistic primary study hour (09:00–10:00 gets higher accuracy).
    const startHour = hourBuckets[Math.floor(rand() * hourBuckets.length)];
    let cursorSec = startHour * 3600 + Math.floor(rand() * 1800);

    const nextTimestamp = (gapSec = 14 + Math.floor(rand() * 28)) => {
      cursorSec = Math.min(23 * 3600 + 30 * 60, cursorSec + gapSec);
      const h = Math.floor(cursorSec / 3600);
      const m = Math.floor((cursorSec % 3600) / 60);
      const s = cursorSec % 60;
      return new Date(refYear, refMonth, refDay - daysAgo, h, m, s);
    };

    // 1. Collect cards due on or before today from FSRS state.
    const dueSpecs = introOrder.filter((spec) => {
      const card = states.get(spec.cardId);
      return card !== undefined && studyDay(card.due) <= currentDayKey;
    });

    // Cap daily review burst to keep history natural and fast (~12–38 cards/day).
    const maxReviewsToday = daysAgo === 0 ? 22 : 14 + Math.floor(rand() * 22);
    const reviewBatch = dueSpecs.slice(0, maxReviewsToday);

    for (const spec of reviewBatch) {
      const card = states.get(spec.cardId)!;
      const at = nextTimestamp();
      const hour = at.getHours();
      const morningBonus = hour >= 9 && hour <= 10 ? 0.06 : hour >= 21 ? -0.05 : 0;

      const roll = rand();
      let rating: Rating;
      if (spec.isHardCard && card.lapses < 9 && roll < 0.56) {
        rating = 'again';
      } else if (spec.lessonIndex === 0 && roll > 0.15) {
        rating = roll > 0.55 ? 'easy' : 'good';
      } else if (spec.lessonIndex === 1) {
        rating = roll < 0.08 - morningBonus ? 'again' : roll < 0.2 ? 'hard' : roll < 0.8 ? 'good' : 'easy';
      } else if (spec.lessonIndex === 2) {
        rating = roll < 0.16 - morningBonus ? 'again' : roll < 0.36 ? 'hard' : roll < 0.85 ? 'good' : 'easy';
      } else {
        rating = roll < 0.11 - morningBonus ? 'again' : roll < 0.24 ? 'hard' : roll < 0.78 ? 'good' : 'easy';
      }

      const updated = record(spec, rating, at);
      // Complete same-day learning/relearning step cleanly (except on today so a couple remain in Learning).
      if (updated.state !== State.Review && daysAgo > 0) {
        const followUpAt = nextTimestamp(620);
        const followRating: Rating = spec.isHardCard && rand() < 0.35 ? 'hard' : 'good';
        record(spec, followRating, followUpAt);
      }
    }

    // 2. Introduce a few new cards on most days so the deck matures organically over 120 days.
    const newQuota = daysAgo === 0 ? 3 : daysAgo > 10 ? (rand() < 0.65 ? 2 : 1) : 1;
    let introduced = 0;
    while (introduced < newQuota && newCursor < introOrder.length) {
      const spec = introOrder[newCursor++];
      const at = nextTimestamp();
      const roll = rand();
      const firstRating: Rating = spec.isHardCard
        ? 'again'
        : spec.lessonIndex === 0
          ? 'easy'
          : roll < 0.14
            ? 'again'
            : roll < 0.32
              ? 'hard'
              : roll < 0.84
                ? 'good'
                : 'easy';
      const afterFirst = record(spec, firstRating, at);
      // Graduate most new cards unless it's today (leaving a couple in Learning state for the donut!).
      if (afterFirst.state !== State.Review && daysAgo > 0) {
        const gradAt = nextTimestamp(640);
        record(spec, spec.lessonIndex === 0 ? 'easy' : 'good', gradAt);
      }
      introduced++;
    }
  }

  return events;
}

export function isDemoCleared(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(DEMO_CLEARED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markDemoCleared(cleared: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (cleared) localStorage.setItem(DEMO_CLEARED_STORAGE_KEY, '1');
    else localStorage.removeItem(DEMO_CLEARED_STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}

/**
 * Seeds deterministic ~120-day FSRS demo history when the review log is empty
 * (unless the user explicitly cleared demo history).
 */
export function seedDemoHistoryIfEmpty(
  existing: readonly ReviewEvent[],
  referenceDate: Date = new Date(),
  retention = 0.9,
): { events: ReviewEvent[]; seeded: boolean } {
  if (existing.length > 0 || isDemoCleared()) {
    return { events: [...existing], seeded: false };
  }
  return { events: seedDemoHistory(referenceDate, retention), seeded: true };
}
