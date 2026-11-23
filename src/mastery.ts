import type { ReviewEvent } from './reviewLog';
export function mastery(events: ReviewEvent[], subjectId: string, lessonId: string, cardIds: string[]) {
  const latest = new Map<string, ReviewEvent>();
  for (const event of events) if (event.subjectId === subjectId && event.lessonId === lessonId && cardIds.includes(event.cardId)) {
    const previous = latest.get(event.cardId);
    if (!previous || event.at >= previous.at) latest.set(event.cardId, event);
  }
  const score = cardIds.length ? [...latest.values()].reduce((sum,e) => sum + (e.rating === 'easy' ? 1 : e.rating === 'good' ? .75 : 0),0) / cardIds.length : 0;
  return { score, label: !latest.size ? 'Not started' : score >= .9 ? 'Aced' : score >= .6 ? 'Solid' : 'Shaky' };
}
