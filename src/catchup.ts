/**
 * Quick catch-up: one fast pass over a scope (all subjects, a subject, or a lecture).
 *
 * Rules:
 * - A card that is DUE when you answer logs a real FSRS review through the normal review log
 *   (Knew it = Good, Didn't know = Again), so the backlog actually clears and syncs.
 * - Anything not due (studied-but-not-yet-due, or never studied) is practice only: no event is
 *   written, so its schedule is untouched. FSRS state is always re-derived from the log.
 */
import type { Rating, ReviewEvent } from './reviewLog';
import { isDueState, ratingEvent, replay, type QueueCard } from './scheduler';

export type CatchupKind = 'due' | 'practice';
export interface CatchupItem<T extends QueueCard> { card: T; kind: CatchupKind }

export const CATCHUP_RATING: Record<'knew' | 'missed', Rating> = { knew: 'good', missed: 'again' };
export const CATCHUP_BACKLOG = 50;

/** Due/overdue cards first (most overdue first); with `everything`, the rest follow as practice. */
export function catchupItems<T extends QueueCard>(cards: readonly T[], events: readonly ReviewEvent[], at: Date, everything = false): CatchupItem<T>[] {
  const states = replay(events);
  const due: T[] = [], rest: T[] = [];
  for (const c of cards) (isDueState(states.get(c.cardId), at) ? due : rest).push(c);
  due.sort((a, b) => +states.get(a.cardId)!.due - +states.get(b.cardId)!.due || a.cardId.localeCompare(b.cardId));
  rest.sort((a, b) => a.subjectId.localeCompare(b.subjectId) || a.queuePosition - b.queuePosition || a.cardId.localeCompare(b.cardId));
  return [...due.map((card) => ({ card, kind: 'due' as const })), ...(everything ? rest.map((card) => ({ card, kind: 'practice' as const })) : [])];
}

export function dueCount(cards: readonly QueueCard[], events: readonly ReviewEvent[], at: Date): number {
  const states = replay(events);
  return cards.reduce((n, c) => n + (isDueState(states.get(c.cardId), at) ? 1 : 0), 0);
}

/**
 * The review event for an answer, or null for practice. Due-ness is judged at answer time
 * against the current log, so a card another device already reviewed is not double-counted.
 */
export function catchupAnswer(
  card: QueueCard, knew: boolean, events: readonly ReviewEvent[], at: Date,
  durationMs: number, retention: number, id: string,
): ReviewEvent | null {
  if (!isDueState(replay(events).get(card.cardId), at)) return null;
  return ratingEvent(card, CATCHUP_RATING[knew ? 'knew' : 'missed'], events, at, durationMs, retention, id);
}
