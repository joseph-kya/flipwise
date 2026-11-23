import { createEmptyCard, fsrs, Rating as Grade, State, type Card } from 'ts-fsrs';
import type { ReviewEvent, Rating } from './reviewLog';
export const STUDY_CONFIG = { globalNew: 40, defaultNew: 20, rolloverHour: 4, courseNew: { 'analysis-1': 18, 'robotics': 11, 'physics-1': 6, 'programming-1': 5 } };
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
export interface QueueCard { cardId: string; subjectId: string; lessonId: string; queuePosition: number; dailyNew?: number }
export function queue<T extends QueueCard>(cards: readonly T[], events: readonly ReviewEvent[], at = new Date()): T[] {
  const states = replay(events), seen = new Set<string>(), used: Record<string, number> = {}; let total = 0;
  for (const e of events) { if (!seen.has(e.cardId) && studyDay(new Date(e.at)) === studyDay(at)) { used[e.subjectId] = (used[e.subjectId] ?? 0)+1; total++; } seen.add(e.cardId); }
  const due = cards.filter(c => { const s = states.get(c.cardId); return s && (s.state === State.Review ? studyDay(s.due) <= studyDay(at) : s.due <= at); }).sort((a,b) => {
    const x=states.get(a.cardId)!, y=states.get(b.cardId)!;
    return Number(x.state===State.Review)-Number(y.state===State.Review) || +x.due- +y.due || a.cardId.localeCompare(b.cardId);
  });
  const fresh = [...cards].filter(c=>!states.has(c.cardId)).sort((a,b)=>a.queuePosition-b.queuePosition || a.cardId.localeCompare(b.cardId)).filter(c=>{
    const cap=c.dailyNew ?? STUDY_CONFIG.courseNew[c.subjectId as keyof typeof STUDY_CONFIG.courseNew] ?? STUDY_CONFIG.defaultNew;
    if(total>=STUDY_CONFIG.globalNew || (used[c.subjectId]??0)>=cap) return false;
    total++; used[c.subjectId]=(used[c.subjectId]??0)+1; return true;
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
