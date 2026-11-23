import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allCards, mergeImport } from '../anki/types';
import { DEMO_CARD_IDS } from '../sync/demo';
import { MemoryCloud } from '../sync/memoryCloud';
import { makeDevice } from '../sync/testkit';
import { isStarterPack, loadStarterPack, starterImport, type StarterPack } from './starterPack';

const pack = JSON.parse(readFileSync('public/starter/ai-robotics.json', 'utf8')) as StarterPack;

async function addStarter(dev: Awaited<ReturnType<typeof makeDevice>>, ids?: string[]) {
  const existing = await dev.storage.readDecks();
  const events = await dev.storage.read();
  const { data } = mergeImport(existing, starterImport(pack, ids), events);
  await dev.storage.importDecks(data, events);
  return dev.storage.readDecks();
}

describe('AI & Robotics starter set', () => {
  it('is a valid pack with the four courses, stable GUIDs and no scheduling or media', () => {
    expect(isStarterPack(pack)).toBe(true);
    expect(pack.subjects.map((s) => [s.name, s.dailyNew])).toEqual([
      ['Analysis 1', 6], ['Introduction to Robotics', 11], ['Physics 1', 18], ['Programming 1', 5],
    ]);
    const cards = allCards(pack);
    expect(cards.length).toBe(2568);
    expect(new Set(cards.map((c) => c.stableId)).size).toBe(cards.length);
    expect(cards.every((c) => c.guid && c.stableId === `anki:${encodeURIComponent(c.guid)}:${c.ord}`)).toBe(true);
    expect(JSON.stringify(pack)).not.toMatch(/"(revlog|ivl|due|factor|lapses|reps)"/);
    const data = starterImport(pack);
    expect(data.revlog).toEqual([]);
    expect(data.media).toEqual({});
  });

  it('adding the pack twice upserts: same card count, no duplicates', async () => {
    const dev = await makeDevice('starter-twice');
    const once = await addStarter(dev);
    const twice = await addStarter(dev);
    expect(allCards(once!).length).toBe(2568);
    expect(allCards(twice!).length).toBe(2568);
    expect(twice!.subjects.map((s) => s.total)).toEqual(once!.subjects.map((s) => s.total));
  });

  it('can add a subset of subjects and later the rest', async () => {
    const dev = await makeDevice('starter-subset');
    const physics = pack.subjects.find((s) => s.name === 'Physics 1')!.id;
    const robotics = pack.subjects.find((s) => s.name === 'Introduction to Robotics')!.id;
    const partial = await addStarter(dev, [physics, robotics]);
    expect(partial!.subjects.map((s) => s.name).sort()).toEqual(['Introduction to Robotics', 'Physics 1']);
    expect(allCards(partial!).length).toBe(756 + 904);
    const all = await addStarter(dev);
    expect(all!.subjects.length).toBe(4);
    expect(allCards(all!).length).toBe(2568);
  });

  it('is real data: none of it is demo, and it syncs to the cloud', async () => {
    expect(allCards(pack).some((c) => DEMO_CARD_IDS.has(c.stableId))).toBe(false);
    const cloud = new MemoryCloud();
    const dev = await makeDevice('starter-sync');
    const programming = pack.subjects.find((s) => s.name === 'Programming 1')!;
    await addStarter(dev, [programming.id]);
    const s = await dev.signIn('uid-new-student', cloud.as('uid-new-student'));
    await s.engine.sync();
    const ids = cloud.list('uid-new-student', 'records').map((d) => d.id);
    expect(ids.filter((id) => id.startsWith('card~')).length).toBe(212);
    expect(ids.filter((id) => id.startsWith('deck~')).length).toBe(programming.lectures.length);
    expect(ids).toContain(`subject~${encodeURIComponent(programming.id)}`);
  });

  it('is fetched lazily from the static path and cached', async () => {
    let calls = 0;
    const fake = (async (url: string) => {
      calls++;
      expect(url).toBe('/base/starter/ai-robotics.json');
      return new Response(JSON.stringify(pack));
    }) as unknown as typeof fetch;
    const a = await loadStarterPack(fake, '/base/');
    const b = await loadStarterPack(fake, '/base/');
    expect(a).toBe(b);
    expect(calls).toBe(1);
  });
});
