/** Real numbers for the explainer, computed with the app's own scheduler (no fuzz, retention 0.9). */
import type { Card } from 'ts-fsrs';
import type { Rating } from '../reviewLog';
import { schedule } from '../scheduler';

const START = new Date(2026, 0, 5, 9, 0, 0);

/** Gaps between reviews when a new card is answered Good every time it comes back. */
export function goodChain(steps = 5, retention = 0.9): number[] {
  let card: Card | undefined, at = START;
  const gaps: number[] = [];
  for (let i = 0; i < steps; i++) {
    card = schedule(card, 'good', at, retention, false);
    gaps.push(+card.due - +at);
    at = new Date(card.due);
  }
  return gaps;
}

/** For a card answered Good three times, the next gap each rating would give. */
export function ratingOutcomes(retention = 0.9): Record<Rating, number> {
  let card: Card | undefined, at = START;
  for (let i = 0; i < 3; i++) { card = schedule(card, 'good', at, retention, false); at = new Date(card.due); }
  const out = {} as Record<Rating, number>;
  for (const r of ['again', 'hard', 'good', 'easy'] as const) out[r] = +schedule(card, r, at, retention, false).due - +at;
  return out;
}

export function formatGap(ms: number): string {
  const min = ms / 60_000, day = min / 1440;
  if (min < 60) return `${Math.round(min)} min`;
  if (day < 1) return `${Math.round(min / 60)} h`;
  if (day < 14) return `${Math.round(day)} ${Math.round(day) === 1 ? 'day' : 'days'}`;
  if (day < 60) return `${Math.round(day / 7)} weeks`;
  if (day < 365) return `${Math.round(day / 30.4)} months`;
  return `${(day / 365).toFixed(1)} years`;
}

/** Short label for chart ticks: 10m, 2d, 11d, 7w, 5mo. */
export function shortGap(ms: number): string {
  const min = ms / 60_000, day = min / 1440;
  if (min < 60) return `${Math.round(min)}m`;
  if (day < 1) return `${Math.round(min / 60)}h`;
  if (day < 14) return `${Math.round(day)}d`;
  if (day < 60) return `${Math.round(day / 7)}w`;
  if (day < 365) return `${Math.round(day / 30.4)}mo`;
  return `${(day / 365).toFixed(1)}y`;
}
