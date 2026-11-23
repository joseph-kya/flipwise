import { afterEach, expect, it, vi } from 'vitest';
import { appendReview, loadReviewLog, seedDemoReviewLog, type ReviewEvent } from './reviewLog';
import { aggregateByDay, toLocalDateKey } from './calendar/dailyStats';
import { mastery } from './mastery';
import { sessionStats } from './sessionStats';
import { subjects } from './demoSubjects';
afterEach(() => vi.unstubAllGlobals());
it('records a session rating in today’s calendar and lesson mastery through one persisted log', () => {
  const storage = new Map<string,string>();
  vi.stubGlobal('localStorage', { getItem: (key:string) => storage.get(key) ?? null, setItem: (key:string,value:string) => storage.set(key,value) });
  const event: ReviewEvent = { id:'session-review',cardId:'analysis-1/lecture-1/0-0',subjectId:'analysis-1',lessonId:'lecture-1',rating:'easy',at:new Date().toISOString(),durationMs:12345,isNew:true };
  appendReview(event);
  const log = loadReviewLog();
  expect(aggregateByDay(log).get(toLocalDateKey(event.at))).toMatchObject({cardsStudied:1,correct:1,easy:1,newCardsLearned:1,durationMs:12345});
  expect(mastery(log,event.subjectId,event.lessonId,[event.cardId])).toEqual({score:1,label:'Aced'});
  expect(sessionStats(log,1)).toMatchObject({done:1,right:1,remaining:0});
});
it('seeds actual cards with mastery variety and never-revised lessons', () => {
 const log = seedDemoReviewLog();
 const labels = subjects[0].lectures.map(l => mastery(log,subjects[0].id,l.id,l.cards.map(c=>`${subjects[0].id}/${l.id}/${c.id}`)).label);
 expect(labels).toContain('Not started'); expect(labels).toContain('Aced'); expect(labels).toContain('Shaky');
});
