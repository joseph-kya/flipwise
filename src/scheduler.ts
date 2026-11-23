import { createEmptyCard, fsrs, Rating as Grade, State, type Card } from 'ts-fsrs';
import type { ReviewEvent, Rating } from './reviewLog';
export const STUDY_CONFIG = { globalNew: 40, defaultNew: 20, rolloverHour: 4, courseNew: { 'analysis-1': 6, 'robotics': 11, 'physics-1': 18, 'programming-1': 5 } };
export const grades = { again: Grade.Again, hard: Grade.Hard, good: Grade.Good, easy: Grade.Easy };
export function engine(retention = .9, fuzz = true) {
  return fsrs({ request_retention: retention, maximum_interval: 36500, enable_fuzz: fuzz, learning_steps: ['1m', '10m'], relearning_steps: ['10m'] });
}
export function schedule(card: Card | undefined, rating: Rating, at: Date, retention = .9, fuzz = true): Card {
  return engine(retention, fuzz).next(card ?? createEmptyCard(at), at, grades[rating]).card;
}
export function replay(events: readonly ReviewEvent[]): Map<string, Card> {
  const states = new Map<string, Card>();
  for (const e of events) states.set(e.cardId, schedule(states.get(e.cardId), e.rating, new Date(e.at), e.retention ?? .9, e.fuzz ?? true));
  return states;
}
export function studyDay(at: Date): string {
  const d = new Date(at); if (d.getHours() < STUDY_CONFIG.rolloverHour) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
/** A studied card is due when its review day has come (reviews) or its step time has passed (learning). */
export function isDueState(s: Card | undefined, at: Date): boolean {
  return !!s && (s.state === State.Review ? studyDay(s.due) <= studyDay(at) : s.due <= at);
}
export interface QueueCard { cardId: string; subjectId: string; lessonId: string; queuePosition: number; dailyNew?: number }
/** Effective daily limits by level; absent/null = no limit at that level (see docs/study-pace.md). */
export interface QueueLimits {
  globalNew: number;
  globalReviews: number | null;
  course(subjectId: string): { newPerDay: number; reviewsPerDay: number | null } | undefined;
  lecture(subjectId: string, lessonId: string): { newPerDay: number | null; reviewsPerDay: number | null } | undefined;
}

/** The pre-settings behaviour: per-card dailyNew, else the built-in course table, global 40, no review caps. */
export const DEFAULT_LIMITS: QueueLimits = {
  globalNew: STUDY_CONFIG.globalNew,
  globalReviews: null,
  course: () => undefined,
  lecture: () => undefined,
};

/** FSRS-6 retrievability (probability of recall) of a studied card at `at`. */
export function retrievability(card: Card, at: Date, w: readonly number[] = engine().parameters.w): number {
  if (!card.last_review || card.state === State.New) return 0;
  const t = Math.max(0, (+at - +card.last_review) / 86_400_000);
  const decay = -w[20];
  const factor = Math.pow(0.9, 1 / decay) - 1;
  return Math.pow(1 + (factor * t) / Math.max(card.stability, 0.01), decay);
}

/** Today's usage: first introductions and answers to review-state cards, by course/lecture/total. */
function usageToday(events: readonly ReviewEvent[], at: Date) {
  const today = studyDay(at);
  const states = new Map<string, Card>(), seen = new Set<string>();
  const usage = { newTotal: 0, reviewTotal: 0, newBy: new Map<string, number>(), reviewBy: new Map<string, number>() };
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const e of events) {
    const prev = states.get(e.cardId);
    if (studyDay(new Date(e.at)) === today) {
      if (!seen.has(e.cardId)) { usage.newTotal++; bump(usage.newBy, e.subjectId); bump(usage.newBy, `${e.subjectId}/${e.lessonId}`); }
      else if (prev?.state === State.Review) { usage.reviewTotal++; bump(usage.reviewBy, e.subjectId); bump(usage.reviewBy, `${e.subjectId}/${e.lessonId}`); }
    }
    seen.add(e.cardId);
    states.set(e.cardId, schedule(prev, e.rating, new Date(e.at), e.retention ?? .9, e.fuzz ?? true));
  }
  return { states, usage };
}

export function queue<T extends QueueCard>(cards: readonly T[], events: readonly ReviewEvent[], at = new Date(), limits: QueueLimits = DEFAULT_LIMITS): T[] {
  const { states, usage } = usageToday(events, at);
  const room = (cap: number | null | undefined, used: number) => cap === null || cap === undefined || used < cap;

  // Due cards: learning/relearning are never capped; review-state cards respect review caps,
  // admitting the lowest-retrievability (most at risk) first.
  const dueCards = cards.filter(c => isDueState(states.get(c.cardId), at));
  const learning = dueCards.filter(c => states.get(c.cardId)!.state !== State.Review);
  const reviewsUsed = { total: usage.reviewTotal, by: new Map(usage.reviewBy) };
  const w = engine().parameters.w;
  const candidates = dueCards.filter(c => states.get(c.cardId)!.state === State.Review)
    .map(c => ({ c, r: retrievability(states.get(c.cardId)!, at, w) }))
    .sort((a, b) => a.r - b.r || a.c.cardId.localeCompare(b.c.cardId));
  const reviews: T[] = [];
  for (const { c } of candidates) {
    const lessonKey = `${c.subjectId}/${c.lessonId}`;
    const courseCap = limits.course(c.subjectId)?.reviewsPerDay;
    const lectureCap = limits.lecture(c.subjectId, c.lessonId)?.reviewsPerDay;
    if (!room(limits.globalReviews, reviewsUsed.total) || !room(courseCap, reviewsUsed.by.get(c.subjectId) ?? 0) || !room(lectureCap, reviewsUsed.by.get(lessonKey) ?? 0)) continue;
    reviewsUsed.total++;
    reviewsUsed.by.set(c.subjectId, (reviewsUsed.by.get(c.subjectId) ?? 0) + 1);
    reviewsUsed.by.set(lessonKey, (reviewsUsed.by.get(lessonKey) ?? 0) + 1);
    reviews.push(c);
  }
  const due = [...learning, ...reviews].sort((a,b) => {
    const x=states.get(a.cardId)!, y=states.get(b.cardId)!;
    return Number(x.state===State.Review)-Number(y.state===State.Review) || +x.due- +y.due || a.cardId.localeCompare(b.cardId);
  });

  // New cards: queue position order; admitted while lecture, course and global all have room.
  let total = usage.newTotal;
  const used = new Map(usage.newBy);
  const fresh = [...cards].filter(c=>!states.has(c.cardId)).sort((a,b)=>a.queuePosition-b.queuePosition || a.cardId.localeCompare(b.cardId)).filter(c=>{
    const lessonKey = `${c.subjectId}/${c.lessonId}`;
    const cap = limits.course(c.subjectId)?.newPerDay ?? c.dailyNew ?? STUDY_CONFIG.courseNew[c.subjectId as keyof typeof STUDY_CONFIG.courseNew] ?? STUDY_CONFIG.defaultNew;
    const lectureCap = limits.lecture(c.subjectId, c.lessonId)?.newPerDay;
    if (total >= limits.globalNew || (used.get(c.subjectId) ?? 0) >= cap || !room(lectureCap, used.get(lessonKey) ?? 0)) return false;
    total++; used.set(c.subjectId, (used.get(c.subjectId) ?? 0) + 1); used.set(lessonKey, (used.get(lessonKey) ?? 0) + 1);
    return true;
  });
  return [...due,...fresh];
}
export function intervalLabel(card: Card, at: Date): string {
  const minutes=Math.max(0,(+card.due- +at)/60000);
  return minutes<1 ? '<1m' : minutes<60 ? `${Math.round(minutes)}m` : minutes<1440 ? `${Math.round(minutes/60)}h` : `${Math.round(minutes/1440)}d`;
}
export const isLeech = (card: Card) => card.lapses >= 8;

/** Note tags derived from history, never a second mutable source of truth. */
export function leechTags(events: readonly ReviewEvent[]): Map<string, string[]> {
  return new Map([...replay(events)].filter(([,card]) => isLeech(card)).map(([id]) => [id, ['leech']]));
}
export type SchedulingState =
  | { kind: 'new'; queuePosition: number }
  | { kind: 'learning' | 'relearning'; stepIndex: number; dueAtMs: number; memory: Card }
  | { kind: 'review'; dueDay: string; stability: number; difficulty: number; reps: number; lapses: number; lastReviewAtMs: number; memory: Card };
export function schedulingState(card: Card | undefined, queuePosition: number): SchedulingState {
  if (!card || card.state === State.New) return {kind:'new',queuePosition};
  if (card.state !== State.Review) return {kind:card.state===State.Learning?'learning':'relearning',stepIndex:card.learning_steps,dueAtMs:+card.due,memory:card};
  return {kind:'review',dueDay:studyDay(card.due),stability:card.stability,difficulty:card.difficulty,reps:card.reps,lapses:card.lapses,lastReviewAtMs:+card.last_review!,memory:card};
}
/** Queue cards carry stable ownership; never recover it through object identity. */
export function ratingEvent(card: QueueCard, rating: Rating, events: readonly ReviewEvent[], at: Date, durationMs: number, retention: number, id: string): ReviewEvent {
  return { id, cardId: card.cardId, subjectId: card.subjectId, lessonId: card.lessonId, rating, at: at.toISOString(), durationMs, retention, fuzz: true, isNew: !events.some(e => e.cardId === card.cardId) };
}
export function queueCounts(cards: readonly QueueCard[], events: readonly ReviewEvent[]) {
  const states = replay(events);
  const counts = { total: cards.length, new: 0, review: 0, learning: 0 };
  for (const card of cards) { const state=states.get(card.cardId); if (!state) counts.new++; else if(state.state===State.Review) counts.review++; else counts.learning++; }
  return counts;
}
/** An empty queue is only a completed session after at least one saved rating. */
export function sessionOutcome(studying: boolean, available: number, ratings: number) {
  return !studying ? 'idle' : available > 0 ? 'studying' : ratings > 0 ? 'complete' : 'caught-up';
}
export function nextAvailableAt(cards: readonly QueueCard[], events: readonly ReviewEvent[], at: Date): Date | null {
  const states = replay(events);
  const candidates = cards.map(c => {
    const state = states.get(c.cardId);
    if (!state) { const next = new Date(at); next.setDate(next.getDate()+1); next.setHours(STUDY_CONFIG.rolloverHour,0,0,0); return next; }
    const due = new Date(state.due);
    if (state.state === State.Review) { if (due.getHours()<STUDY_CONFIG.rolloverHour) due.setDate(due.getDate()-1); due.setHours(STUDY_CONFIG.rolloverHour,0,0,0); }
    return due;
  }).filter(date => date > at).sort((a,b)=>+a- +b);
  return candidates[0] ?? null;
}
