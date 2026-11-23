import type { ReviewEvent } from './reviewLog';
export function sessionStats(events: ReviewEvent[], total: number) {
  const right = events.filter(e => e.rating === 'good' || e.rating === 'easy').length;
  return { done: events.length, remaining: Math.max(0,total-events.length), right, again: events.filter(e=>e.rating==='again').length, hard: events.filter(e=>e.rating==='hard').length, accuracy: events.length ? Math.round(right/events.length*100) : 0, durationMs: events.reduce((sum,e)=>sum+e.durationMs,0) };
}
