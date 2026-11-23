import 'fake-indexeddb/auto';
import { it, expect } from 'vitest';
import { openReviewStorage } from './reviewStorage';
it('persists ratings across storage reopen and atomically undoes',async()=>{
 const a=await openReviewStorage(); expect(a.fallback).toBe(false);
 const events=[{id:'1',cardId:'x',subjectId:'analysis-1',lessonId:'a',rating:'good' as const,at:new Date().toISOString(),durationMs:100,isNew:true}];
 await a.storage.write(events);const b=await openReviewStorage();expect(await b.storage.read()).toEqual(events);
 await b.storage.write([]);expect(await a.storage.read()).toEqual([]);
});
it('does not resurrect legacy history after undoing to an empty log',async()=>{
 const legacy=[{id:'legacy',cardId:'old',subjectId:'analysis-1',lessonId:'a',rating:'easy',at:new Date().toISOString(),durationMs:1,isNew:true}];
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>JSON.stringify(legacy),setItem:()=>{}}});
 const a=await openReviewStorage();await a.storage.write([]);
 const b=await openReviewStorage();expect(await b.storage.read()).toEqual([]);
});
it('commits imported decks and review history in the same transaction',async()=>{
 const {storage}=await openReviewStorage();
 const data={subjects:[],media:{'pic.png':new Uint8Array([1,2,3])},packageName:'test.apkg',notes:0,revlog:[],warnings:[]};
 const events=[{id:'imported',cardId:'anki:guid:0',subjectId:'s',lessonId:'l',rating:'good' as const,at:new Date().toISOString(),durationMs:1,isNew:true,source:'anki' as const}];
 await storage.importDecks(data,events);
 const reloaded=await openReviewStorage();
 expect(await reloaded.storage.readDecks()).toEqual(data);
 expect(await reloaded.storage.read()).toEqual(events);
});
