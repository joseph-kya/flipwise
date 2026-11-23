import { describe, it, expect } from 'vitest';
import { mastery } from './mastery';
import { sessionStats } from './sessionStats';
import type { ReviewEvent, Rating } from './reviewLog';
const event = (rating: Rating, cardId='a', at='2026-01-01'): ReviewEvent => ({id:cardId+at,cardId,subjectId:'s',lessonId:'l',rating,at,durationMs:1000,isNew:true});
describe('mastery',()=>{
 it('starts red and requires all cards for mastery',()=>{expect(mastery([],'s','l',['a']).label).toBe('Not started');expect(mastery([event('easy')],'s','l',['a','b']).label).toBe('Shaky');});
 it('uses latest timestamp, weights easy and isolates lessons',()=>{expect(mastery([event('again','a','2026-02-01'),event('easy')],'s','l',['a']).score).toBe(0);expect(mastery([event('good')],'s','l',['a']).label).toBe('Solid');expect(mastery([event('easy')],'s','l',['a']).label).toBe('Aced');expect(mastery([event('easy')],'other','l',['a']).score).toBe(0);});
});
describe('session stats',()=>{it('handles empty sessions',()=>expect(sessionStats([],3)).toMatchObject({done:0,remaining:3,accuracy:0}));it('counts correct, mistakes and hard separately',()=>expect(sessionStats(['again','hard','good','easy'].map(r=>event(r as Rating)),3)).toEqual({done:4,remaining:0,right:2,again:1,hard:1,accuracy:50,durationMs:4000}));});
