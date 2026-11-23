export type Rating = 'again' | 'hard' | 'good' | 'easy';

export interface ReviewEvent {
  id: string;          // unique
  cardId: string;
  subjectId: string;   // e.g. 'analysis-1'
  lessonId: string;
  rating: Rating;
  at: string;          // ISO timestamp
  durationMs: number;  // time spent on the card
  isNew: boolean;      // first time this card was ever reviewed ("card learned")
}

export const REVIEW_LOG_STORAGE_KEY = 'flipwise.reviewLog.v1';

const VALID_RATINGS: ReadonlySet<string> = new Set<Rating>([
  'again',
  'hard',
  'good',
  'easy',
]);

function isReviewEvent(value: unknown): value is ReviewEvent {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.cardId === 'string' &&
    typeof e.subjectId === 'string' &&
    typeof e.lessonId === 'string' &&
    typeof e.rating === 'string' &&
    VALID_RATINGS.has(e.rating) &&
    typeof e.at === 'string' &&
    typeof e.durationMs === 'number' &&
    Number.isFinite(e.durationMs) &&
    typeof e.isNew === 'boolean'
  );
}

function getStorage(): Storage | null {
  try {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
      return null;
    }
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function loadReviewLog(): ReviewEvent[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(REVIEW_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isReviewEvent);
  } catch {
    return [];
  }
}

export function saveReviewLog(events: readonly ReviewEvent[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(REVIEW_LOG_STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Ignore storage quota or private-mode errors.
  }
}

export function appendReview(event: ReviewEvent): ReviewEvent[] {
  const next = [...loadReviewLog(), event];
  saveReviewLog(next);
  return next;
}

/**
 * Deterministic Mulberry32 PRNG (no Math.random).
 */
function createPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SubjectSpec {
  subjectId: string;
  lessons: readonly string[];
  poolSize: number;
}

const DEMO_SUBJECTS: readonly SubjectSpec[] = [
  {
    subjectId: 'analysis-1',
    lessons: ['lecture-1', 'lecture-2', 'lecture-3', 'lecture-4', 'lecture-5'],
    poolSize: 48,
  },
  {
    subjectId: 'robotics',
    lessons: ['L01', 'L02', 'L03', 'L04', 'L05', 'L06'],
    poolSize: 56,
  },
  {
    subjectId: 'physics-1',
    lessons: ['lecture-1', 'lecture-2', 'lecture-3', 'lecture-4', 'lecture-5'],
    poolSize: 44,
  },
  {
    subjectId: 'programming-1',
    lessons: ['lecture-1', 'lecture-2', 'lecture-3', 'lecture-4'],
    poolSize: 36,
  },
];

// Explicit skipped day offsets (days ago) to guarantee realistic rest days
// while keeping a natural multi-day current streak ending on referenceDate.
const REST_DAYS_AGO = new Set<number>([5, 11, 14, 19, 24, 28, 33, 37, 40]);

/**
 * Generates ~6 weeks (42 days) of deterministic demo study history
 * ending on referenceDate (defaults to today).
 */
export function seedDemoReviewLog(referenceDate: Date = new Date()): ReviewEvent[] {
  const rand = createPrng(0xf11b2026);
  const events: ReviewEvent[] = [];
  const seenCards = new Set<string>();

  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth();
  const refDay = referenceDate.getDate();

  let seq = 1;

  for (let daysAgo = 41; daysAgo >= 0; daysAgo--) {
    if (REST_DAYS_AGO.has(daysAgo)) {
      // Advance PRNG slightly for stability across days.
      rand();
      continue;
    }

    // Determine daily session size across all four heatmap tiers.
    const tierRoll = rand();
    let cardCount: number;
    if (daysAgo === 0) {
      // Today: solid, realistic study session so initial screen feels grounded.
      cardCount = 34;
    } else if (tierRoll < 0.24) {
      cardCount = 8 + Math.floor(rand() * 7); // 8..14 (level 1)
    } else if (tierRoll < 0.56) {
      cardCount = 17 + Math.floor(rand() * 12); // 17..28 (level 2)
    } else if (tierRoll < 0.82) {
      cardCount = 31 + Math.floor(rand() * 13); // 31..43 (level 3)
    } else {
      cardCount = 46 + Math.floor(rand() * 16); // 46..61 (level 4)
    }

    // Pick 2 to 4 subjects studied on this day.
    const subjectCount = daysAgo === 0 ? 3 : 2 + Math.floor(rand() * 3);
    const orderedSubjects = [...DEMO_SUBJECTS].sort(() => rand() - 0.5);
    const activeSubjects = orderedSubjects.slice(0, subjectCount);

    // Choose 1 or 2 local study windows (morning / afternoon / evening).
    const startHour = 8 + Math.floor(rand() * 11); // 08:00 .. 18:59 local
    let cursorMinutes = startHour * 60 + Math.floor(rand() * 35);

    for (let i = 0; i < cardCount; i++) {
      // Weight earlier chosen subjects slightly higher for realistic focus blocks.
      const sRoll = rand();
      const sIdx =
        sRoll < 0.45
          ? 0
          : sRoll < 0.78 && activeSubjects.length > 1
            ? 1
            : Math.min(activeSubjects.length - 1, Math.floor(rand() * activeSubjects.length));
      const spec = activeSubjects[sIdx];
      // Gradually expand card pool over the 6 weeks so new cards appear organically
      // while mature cards repeat like a real spaced-repetition schedule.
      const progress = (42 - daysAgo) / 42;
      const unlockedPool = Math.max(8, Math.floor(spec.poolSize * (0.3 + 0.7 * progress)));
      const cardNum = 1 + Math.floor(rand() * unlockedPool);
      const lessonId = spec.lessons[(cardNum - 1) % spec.lessons.length];
      const cardId = `${spec.subjectId}:c${cardNum}`;

      const isNew = !seenCards.has(cardId);
      seenCards.add(cardId);

      // Rating distribution: new cards are slightly harder than mature reviews.
      const rRoll = rand();
      let rating: Rating;
      if (isNew) {
        if (rRoll < 0.14) rating = 'again';
        else if (rRoll < 0.30) rating = 'hard';
        else if (rRoll < 0.84) rating = 'good';
        else rating = 'easy';
      } else {
        if (rRoll < 0.06) rating = 'again';
        else if (rRoll < 0.16) rating = 'hard';
        else if (rRoll < 0.72) rating = 'good';
        else rating = 'easy';
      }

      // Duration per card (ms): harder/mistake cards take longer.
      const baseMs =
        rating === 'again'
          ? 24000
          : rating === 'hard'
            ? 19000
            : rating === 'good'
              ? 13500
              : 8500;
      const durationMs = Math.round(baseMs + rand() * 14000);

      // Keep timestamps safely within the local calendar day (before 23:45).
      const clampedMinutes = Math.min(23 * 60 + 40, cursorMinutes);
      const hour = Math.floor(clampedMinutes / 60);
      const minute = clampedMinutes % 60;
      const second = Math.floor(rand() * 60);

      const atDate = new Date(refYear, refMonth, refDay - daysAgo, hour, minute, second);

      events.push({
        id: `demo-${seq++}`,
        cardId,
        subjectId: spec.subjectId,
        lessonId,
        rating,
        at: atDate.toISOString(),
        durationMs,
        isNew,
      });

      // Advance clock by ~0.3–1.2 min between cards, occasionally adding an afternoon break.
      if (i === Math.floor(cardCount / 2) && cursorMinutes < 15 * 60) {
        cursorMinutes += 90 + Math.floor(rand() * 90);
      } else {
        cursorMinutes += rand() < 0.65 ? 0 : 1;
      }
    }
  }

  return events;
}
