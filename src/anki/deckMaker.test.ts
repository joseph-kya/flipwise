import { beforeAll, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { parsePackage } from './package';
import { allCards, mergeImport } from './types';
import { ratingEvent, replay } from '../scheduler';
let SQL: SqlJsStatic;
const skill = resolve('skills/flipwise-deck-maker');
beforeAll(async () => { SQL = await initSqlJs({useOldExtensionFunctions: false, locateFile: () => resolve('node_modules/sql.js/dist/sql-wasm.wasm')}); });
const parse = (path: string) => parsePackage(new Uint8Array(readFileSync(path)), SQL, 'sample.apkg');
function generate(input: string, output: string, ...flags: string[]) {
  return JSON.parse(execFileSync('python3', [join(skill,'scripts/make_apkg.py'), ...flags, input, output], {encoding: 'utf8', stdio: 'pipe'}));
}
it('imports the tiny committed generator fixture with stable IDs, math, tags and Source', () => {
  const data = parse(resolve('src/anki/fixtures/deck-maker.apkg'));
  expect(data.notes).toBe(3); expect(allCards(data)).toHaveLength(3);
  expect(data.subjects.map(s=>[s.name,s.total])).toEqual([['Analysis 1',2],['Physics 1',1]]);
  expect(allCards(data).map(c=>c.guid).sort()).toEqual(['sample-unique-limit','sample-reciprocal-limit','sample-newton-acceleration'].sort());
  expect(allCards(data).find(c=>c.guid==='sample-reciprocal-limit')!.front).toContain('\\(');
  expect(allCards(data)[0].source).toContain('obsidian://open?');
  expect(allCards(data)[0].tags).toContain('core');
  expect(data.revlog).toHaveLength(0);
});
it('generates twice with edited front/back and keeps explicit identities and local progress', () => {
  const temp = mkdtempSync('/tmp/flipwise-maker-test-');
  try {
    const input = join(temp,'sample.cards.json'), output = join(temp,'sample.apkg');
    const document = JSON.parse(readFileSync(join(skill,'examples/cards.json'),'utf8'));
    writeFileSync(input,JSON.stringify(document)); generate(input,output);
    const first = parse(output), card = allCards(first).find(c=>c.guid==='sample-unique-limit')!;
    const event = ratingEvent({...card,cardId:card.stableId,subjectId:first.subjects[0].id,lessonId:first.subjects[0].lectures[0].id},'good',[],new Date('2026-11-23T12:00:00Z'),1000,.9,'rating');
    document.cards[0].front = 'Can a convergent real sequence have two different limits?';
    document.cards[0].back = 'No. A convergent real sequence has a unique limit.';
    writeFileSync(input,JSON.stringify(document)); generate(input,output);
    const merged = mergeImport(first,parse(output),[event]);
    expect(merged.report).toEqual({new:0,updated:1,unchanged:2,missing:0});
    expect(allCards(merged.data)).toHaveLength(3);
    expect(allCards(merged.data).find(c=>c.guid===card.guid)!.stableId).toBe(card.stableId);
    expect(replay([event]).has(allCards(merged.data).find(c=>c.guid===card.guid)!.stableId)).toBe(true);
  } finally { rmSync(temp,{recursive:true,force:true}); }
});
it('uses content-derived GUIDs for answer-only edits and saves them for future front edits', () => {
  const temp = mkdtempSync('/tmp/flipwise-maker-test-');
  try {
    const input=join(temp,'input.json'), output=join(temp,'generated.apkg');
    const doc=JSON.parse(readFileSync(join(skill,'examples/cards.json'),'utf8'));
    delete doc.cards[0].id;writeFileSync(input,JSON.stringify(doc));generate(input,output);
    const original=allCards(parse(output)).find(c=>c.front===doc.cards[0].front)!.guid;
    expect(original).toMatch(/^[0-9a-f]{32}$/);
    doc.cards[0].back='A different answer to the same question.';writeFileSync(input,JSON.stringify(doc));generate(input,output);
    expect(allCards(parse(output)).find(c=>c.guid===original)!.guid).toBe(original);
    const manifest=join(temp,'generated.cards.json');const normalized=JSON.parse(readFileSync(manifest,'utf8'));
    normalized.cards[0].front='An edited front with the original ID.';writeFileSync(manifest,JSON.stringify(normalized));generate(manifest,output);
    expect(allCards(parse(output)).find(c=>c.guid===original)!.guid).toBe(original);
  } finally { rmSync(temp,{recursive:true,force:true}); }
});
it('extracts multiline Q:/A: Markdown and rejects duplicate IDs before generation', () => {
  const temp=mkdtempSync('/tmp/flipwise-maker-test-');
  try {
    const input=join(temp,'note.md'),output=join(temp,'quick.apkg');
    writeFileSync(input,'# Lecture\n\nQ: What does continue do?\nA: It skips the current iteration.\nExecution continues with the next iteration.\n\nQ: What is 1 + 1?\nA: 2.\n');
    generate(input,output,'--from-markdown','--deck','Semester::Programming 1::Loops','--vault','Sample Notes','--source-path','Programming/Loops.md');
    const cards=allCards(parse(output));expect(cards).toHaveLength(2);expect(cards[0].back).toContain('Execution continues');expect(cards[0].source).toContain('Programming%2FLoops.md');
    const manifest=JSON.parse(readFileSync(join(temp,'quick.cards.json'),'utf8'));manifest.cards[1].id=manifest.cards[0].id;
    const invalid=join(temp,'bad.json');writeFileSync(invalid,JSON.stringify(manifest));
    expect(()=>generate(invalid,join(temp,'bad.apkg'))).toThrow();
  } finally { rmSync(temp,{recursive:true,force:true}); }
});
