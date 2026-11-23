import { describe, it, expect } from 'vitest';
import { createEmptyCard, State } from 'ts-fsrs';
import { ratingEvent, queueCounts, engine, schedule, replay, queue, studyDay, STUDY_CONFIG } from './scheduler';
import type { ReviewEvent } from './reviewLog';
const at=new Date(2026,10,23,12);
const event=(cardId: string, rating: ReviewEvent['rating'], time=at): ReviewEvent=>({id:cardId+ +time,cardId,subjectId:'analysis-1',lessonId:'a',rating,at:time.toISOString(),durationMs:1000,isNew:true,fuzz:false});
describe('scheduler',()=>{
 it('advances 1m then 10m then graduates',()=>{
  const a=schedule(undefined,'again',at,.9,false); expect(+a.due- +at).toBe(60000);
  const b=schedule(a,'good',a.due,.9,false); expect(+b.due- +a.due).toBe(600000);
  expect(schedule(b,'good',b.due,.9,false).state).toBe(State.Review);
 });
 it('grows consecutive Good review intervals and relearns lapses',()=>{
  let c=schedule(undefined,'easy',at,.9,false);
  for(let i=0;i<4;i++){const next=schedule(c,'good',c.due,.9,false);expect(next.scheduled_days).toBeGreaterThan(c.scheduled_days);c=next;}
  const lapse=schedule(c,'again',c.due,.9,false);expect(lapse.state).toBe(State.Relearning);expect(lapse.lapses).toBe(c.lapses+1);
 });
 it.each(['again','hard','good','easy'] as const)('matches direct reference for %s',rating=>{
  const grade={again:1,hard:2,good:3,easy:4} as const;
  expect(schedule(undefined,rating,at,.9,false)).toEqual(engine(.9,false).next(createEmptyCard(at),at,grade[rating]).card);
 });
 it('replays exactly including fuzz and historical retention',()=>{
  const a={...event('x','easy'),fuzz:true,retention:.95};const first=schedule(undefined,a.rating,at,.95,true);
  const b={...event('x','good',first.due),fuzz:true,retention:.85};
  expect(replay([a,b]).get('x')).toEqual(schedule(first,'good',first.due,.85,true));
 });
 const cards=Object.keys(STUDY_CONFIG.courseNew).flatMap(subjectId=>Array.from({length:60},(_,queuePosition)=>({subjectId,lessonId:'a',cardId:subjectId+queuePosition,queuePosition})));
 it('respects all course caps and global cap',()=>{const q=queue(cards,[],at);expect(q).toHaveLength(40);for(const [id,cap] of Object.entries(STUDY_CONFIG.courseNew)) expect(q.filter(c=>c.subjectId===id)).toHaveLength(cap);});
 it('counts first introductions only and resets at local 4am',()=>{
  const before=new Date(2026,10,23,3,59),after=new Date(2026,10,23,4);
  const events=cards.filter(c=>c.subjectId==='analysis-1').slice(0,18).map(c=>event(c.cardId,'easy',before));
  expect(queue(cards.filter(c=>c.subjectId==='analysis-1'),events,before)).toHaveLength(0);
  expect(queue(cards.filter(c=>c.subjectId==='analysis-1'),events,after)).toHaveLength(18);
  expect(studyDay(before)).not.toBe(studyDay(after));
 });
 it('orders learning then due reviews then positions with stable ties',()=>{
  const cs=['new2','review','learn','new1'].map((cardId,i)=>({cardId,subjectId:'analysis-1',lessonId:'a',queuePosition:4-i}));
  const past=new Date(+at-86400000*10);
  expect(queue(cs,[event('review','easy',past),event('learn','again',past)],at).map(c=>c.cardId)).toEqual(['learn','review','new1','new2']);
 });
});
it('matches the direct reference on a mature card for all four grades',()=>{
 const c=schedule(undefined,'easy',at,.9,false);
 for (const [rating,grade] of Object.entries({again:1,hard:2,good:3,easy:4} as const)) {
  expect(schedule(c,rating as ReviewEvent['rating'],c.due,.9,false)).toEqual(engine(.9,false).next(c,c.due,grade).card);
 }
});
it('counts repeated ratings as one new introduction',()=>{
 const cs=Array.from({length:30},(_,i)=>({cardId:String(i),subjectId:'analysis-1',lessonId:'a',queuePosition:i}));
 const first=event('0','again');const second={...event('0','good'),isNew:false};
 expect(queue(cs,[first,second],at).filter(c=>c.cardId!=='0')).toHaveLength(17);
});

it('rates copied queue cards from a fresh session and resumes after three ratings',()=>{
 const catalog=Array.from({length:8},(_,i)=>({cardId:`analysis-1/lecture-1/${i}`,subjectId:'analysis-1',lessonId:'lecture-1',queuePosition:i}));
 let log: ReviewEvent[]=[];
 expect(queueCounts(queue(catalog,log,at),log)).toEqual({total:8,new:8,review:0,learning:0});
 for(let i=0;i<3;i++) {
  const card={...queue(catalog,log,at)[0]};
  const e=ratingEvent(card,'good',log,at,1000,.9,String(i));
  expect(e.lessonId).toBe('lecture-1');expect(e.cardId).toBe(catalog[i].cardId);
  log=[...log,e];
 }
 const reloaded=JSON.parse(JSON.stringify(log));
 expect(reloaded).toHaveLength(3);
 expect(queue(catalog,reloaded,at)[0].cardId).toBe(catalog[3].cardId);
 expect(queueCounts(queue(catalog,reloaded,at),reloaded).new).toBe(5);
});
