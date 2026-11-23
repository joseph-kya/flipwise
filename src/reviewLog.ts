export type Rating = 'again' | 'hard' | 'good' | 'easy';
export interface ReviewEvent {
  id: string;
  cardId: string;
  subjectId: string;
  lessonId: string;
  rating: Rating;
  at: string;
  durationMs: number;
  isNew: boolean;
}
const key = 'flipwise.reviewLog.v1';
export function readReviews(): ReviewEvent[] {
  try { const data = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(data) ? data.filter(e => e && typeof e.cardId === 'string' && ['again','hard','good','easy'].includes(e.rating) && typeof e.at === 'string') : []; } catch { return []; }
}
export function appendReview(event: ReviewEvent): ReviewEvent[] {
  const events = [...readReviews(), event];
  try { localStorage.setItem(key, JSON.stringify(events)); } catch { /* Keep the current session usable when storage is unavailable. */ }
  return events;
}
