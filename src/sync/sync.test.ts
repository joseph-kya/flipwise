import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { seedDemoHistory } from '../insights/seedDemoHistory';
import { replay } from '../scheduler';
import { MemoryCloud } from './memoryCloud';
import { pendingCount } from './merge';
import { card, cardIds, deck, frontOf, makeDevice, review } from './testkit';

const A = 'uid-alice', B = 'uid-bob';
const ids = (events: { id: string }[]) => events.map((e) => e.id).sort();
const fsrs = (events: Parameters<typeof replay>[0]) =>
  [...replay(events)].map(([id, c]) => [id, c.reps, c.lapses, +c.due, c.stability]).sort();

/** Both devices sync until a full round makes no change. */
async function settle(...engines: { sync(): Promise<unknown> }[]) {
  for (let i = 0; i < 3; i++) for (const e of engines) await e.sync();
}

describe('sync cycles (IndexedDB + in-memory cloud)', () => {
  it('two devices editing the same card converge on the later edit (and causality beats clock skew)', async () => {
    const cloud = new MemoryCloud();
    const mac = await makeDevice('mac', 10_000), phone = await makeDevice('phone', 10_000);
    await mac.storage.importDecks(deck([card(1), card(2)]), []);
    const m = await mac.signIn(A, cloud.as(A)), p = await phone.signIn(A, cloud.as(A));
    await settle(m.engine, p.engine);
    expect(cardIds((await phone.state()).data)).toEqual(['anki:g1:0', 'anki:g2:0']);

    // Concurrent offline edits: the phone's is later.
    mac.clock.now = 20_000;
    await mac.storage.importDecks(deck([card(1, 'mac edit'), card(2)]), []);
    phone.clock.now = 30_000;
    await phone.storage.importDecks(deck([card(1, 'phone edit'), card(2)]), []);
    await settle(m.engine, p.engine);
    expect(frontOf((await mac.state()).data, 1)).toBe('phone edit');
    expect(frontOf((await phone.state()).data, 1)).toBe('phone edit');

    // The mac's clock is now far *behind*, but it edits after seeing the phone's version: it wins.
    mac.clock.now = 1_000;
    await mac.storage.importDecks(deck([card(1, 'mac after seeing phone'), card(2)]), []);
    await settle(m.engine, p.engine);
    expect(frontOf((await phone.state()).data, 1)).toBe('mac after seeing phone');
    expect(cloud.list(A, 'records').length).toBe(5); // settings, subject, deck, 2 cards
  });

  it('offline reviews on both devices merge into a union without duplicates, and FSRS agrees', async () => {
    const cloud = new MemoryCloud();
    const mac = await makeDevice('mac'), phone = await makeDevice('phone');
    const shared = [review('anki-review:1:anki:g1:0', 1, '2026-11-01T08:00:00.000Z', 'good', { source: 'anki' })];
    await mac.storage.importDecks(deck([card(1), card(2)]), shared);
    await phone.storage.importDecks(deck([card(1), card(2)]), shared); // same .apkg imported on both
    const m = await mac.signIn(A, cloud.as(A)), p = await phone.signIn(A, cloud.as(A));
    await m.engine.sync();
    await p.engine.sync();
    cloud.online = false;
    await mac.storage.append(review('mac-1', 1, '2026-11-20T09:00:00.000Z', 'again'));
    await mac.storage.append(review('mac-2', 2, '2026-11-20T09:01:00.000Z'));
    await phone.storage.append(review('phone-1', 1, '2026-11-20T12:00:00.000Z', 'easy'));
    await phone.storage.append(review('phone-2', 2, '2026-11-21T07:00:00.000Z', 'hard'));
    await expect(m.engine.sync()).rejects.toThrow();
    expect(m.engine.status.kind).toBe('offline');
    cloud.online = true;
    await settle(m.engine, p.engine);
    const a = (await mac.state()).events, b = (await phone.state()).events;
    expect(ids(a)).toEqual(['anki-review:1:anki:g1:0', 'mac-1', 'mac-2', 'phone-1', 'phone-2']);
    expect(a).toEqual(b);
    expect(a.filter((e) => e.isNew).map((e) => e.id)).toEqual(['anki-review:1:anki:g1:0', 'mac-2']);
    expect(fsrs(a)).toEqual(fsrs(b));
    expect(await mac.local.pending()).toBe(0);
  });

  it('undo after sync tombstones the review everywhere and is never resurrected', async () => {
    const cloud = new MemoryCloud();
    const mac = await makeDevice('mac'), phone = await makeDevice('phone');
    const m = await mac.signIn(A, cloud.as(A)), p = await phone.signIn(A, cloud.as(A));
    await mac.storage.append(review('r1', 1, '2026-11-20T09:00:00.000Z'));
    await settle(m.engine, p.engine);
    expect(ids((await phone.state()).events)).toEqual(['r1']);
    const before = fsrs((await mac.state()).events);
    await mac.storage.append(review('r2', 1, '2026-11-20T09:05:00.000Z', 'again'));
    await settle(m.engine, p.engine);
    await mac.storage.remove(['r2']); // Undo
    await settle(m.engine, p.engine);
    expect(ids((await phone.state()).events)).toEqual(['r1']);
    expect(fsrs((await phone.state()).events)).toEqual(before);
    // A stale re-upload of r2 (e.g. a third device that never saw the undo) cannot bring it back.
    await cloud.as(A).commit(A, [{ collection: 'reviews', id: '2026-11-20', merge: true, data: { e: { r2: '{"c":"anki:g1:0","s":"anki-course","l":"L1","r":"again","t":"2026-11-20T09:05:00.000Z","ms":1}' } } }]);
    await settle(m.engine, p.engine);
    expect(ids((await mac.state()).events)).toEqual(['r1']);
    expect(ids((await phone.state()).events)).toEqual(['r1']);
  });

  it('delete vs edit across devices: the newer change wins, in both orders', async () => {
    for (const order of ['delete-first', 'edit-first'] as const) {
      const cloud = new MemoryCloud();
      const mac = await makeDevice(`mac-${order}`), phone = await makeDevice(`phone-${order}`);
      await mac.storage.importDecks(deck([card(1), card(2)]), []);
      const m = await mac.signIn(A, cloud.as(A)), p = await phone.signIn(A, cloud.as(A));
      await settle(m.engine, p.engine);
      const del = () => { mac.clock.now = order === 'delete-first' ? 20_000 : 40_000; return mac.storage.importDecks(deck([card(1)]), []); };
      const edit = () => { phone.clock.now = order === 'delete-first' ? 40_000 : 20_000; return phone.storage.importDecks(deck([card(1), card(2, 'edited')]), []); };
      await del();
      await edit();
      await settle(m.engine, p.engine);
      const expected = order === 'delete-first' ? ['anki:g1:0', 'anki:g2:0'] : ['anki:g1:0'];
      expect(cardIds((await mac.state()).data)).toEqual(expected);
      expect(cardIds((await phone.state()).data)).toEqual(expected);
    }
  });

  it('first sign-in merges local data with existing cloud data without wiping either', async () => {
    const cloud = new MemoryCloud();
    const mac = await makeDevice('mac', 50_000);
    await mac.storage.importDecks(deck([card(1), card(2, 'cloud v2')]), []);
    await mac.storage.append(review('mac-r', 1, '2026-11-10T09:00:00.000Z'));
    await mac.setSettings({ accent: 'purple' });
    const m = await mac.signIn(A, cloud.as(A));
    await m.engine.sync();

    // The phone had data from before sync existed (legacy stamps), plus its own reviews.
    const phone = await makeDevice('phone', 60_000);
    await phone.storage.importDecks(deck([card(2, 'old local v1'), card(3)]), []);
    const legacy = (await phone.state()).meta;
    for (const k of Object.keys(legacy.records)) legacy.records[k] = { ...legacy.records[k], u: 1, dirty: undefined } as never;
    await phone.local.commit(legacy.rev, { ...(await phone.state()), meta: legacy }, { data: false, events: false, settings: false });
    await phone.storage.append(review('phone-r', 3, '2026-11-11T09:00:00.000Z'));

    const p = await phone.signIn(A, cloud.as(A));
    expect(p.prep).toBe('first');
    await settle(p.engine, m.engine);
    for (const dev of [mac, phone]) {
      const s = await dev.state();
      expect(cardIds(s.data)).toEqual(['anki:g1:0', 'anki:g2:0', 'anki:g3:0']);
      expect(frontOf(s.data, 2)).toBe('cloud v2'); // newer cloud version beats legacy local
      expect(ids(s.events)).toEqual(['mac-r', 'phone-r']);
    }
    expect(phone.settings.accent).toBe('purple'); // never-touched local settings don't override the cloud
  });

  it('a different account on the same device never sees or receives the first account\'s data', async () => {
    const cloud = new MemoryCloud();
    const dev = await makeDevice('shared');
    await dev.storage.importDecks(deck([card(1)]), []);
    await dev.storage.append(review('alice-1', 1, '2026-11-10T09:00:00.000Z'));
    const alice = await dev.signIn(A, cloud.as(A));
    await alice.engine.sync();
    // Alice signs out with a pending change (offline), then Bob signs in.
    await dev.storage.append(review('alice-pending', 1, '2026-11-11T09:00:00.000Z'));
    const bob = await dev.signIn(B, cloud.as(B));
    expect(bob.prep).toBe('switched');
    expect((await dev.state()).data).toBeNull();
    expect((await dev.state()).events).toEqual([]);
    await dev.storage.append(review('bob-1', 9, '2026-11-12T09:00:00.000Z'));
    await bob.engine.sync();
    const bobDocs = JSON.stringify([...cloud.list(B, 'records'), ...cloud.list(B, 'reviews')]);
    expect(bobDocs).not.toContain('alice');
    expect(bobDocs).not.toContain('anki:g1:0');
    expect(bobDocs).toContain('bob-1');
    // Bob's client cannot read Alice's cloud data (rules mirror).
    await expect(cloud.as(B).pull(A, 'records', 0)).rejects.toMatchObject({ code: 'permission-denied' });
    // Alice comes back: her data and the pending change return and upload to her account only.
    const back = await dev.signIn(A, cloud.as(A));
    expect(back.prep).toBe('switched');
    await back.engine.sync();
    expect(ids((await dev.state()).events)).toEqual(['alice-1', 'alice-pending']);
    expect(JSON.stringify(cloud.list(A, 'reviews'))).toContain('alice-pending');
    expect(JSON.stringify(cloud.list(A, 'reviews'))).not.toContain('bob-1');
  });

  it('never uploads demo decks or demo history', async () => {
    const cloud = new MemoryCloud();
    const dev = await makeDevice('demo');
    await dev.storage.write(seedDemoHistory(new Date('2026-11-20T12:00:00Z')));
    await dev.storage.append({ ...review('studied-demo', 1, '2026-11-20T09:00:00.000Z'), cardId: 'physics-1/lecture-1/0-0', subjectId: 'physics-1' });
    await dev.storage.importDecks(deck([card(1)]), []);
    await dev.storage.append(review('real', 1, '2026-11-20T10:00:00.000Z'));
    const s = await dev.signIn(A, cloud.as(A));
    await s.engine.sync();
    const reviews = JSON.stringify(cloud.list(A, 'reviews'));
    expect(reviews).toContain('real');
    expect(reviews).not.toContain('demo');
    expect(reviews).not.toContain('studied-demo');
    expect(cloud.list(A, 'records').map((d) => d.id).filter((id) => !id.startsWith('settings')).sort()).toEqual(
      ['card~anki%3Ag1%3A0', 'deck~anki-course%2FL1', 'subject~anki-course'],
    );
  });

  it('splits a large first upload into batches of at most 500 writes', async () => {
    const cloud = new MemoryCloud();
    const adapter = cloud.as(A), sizes: number[] = [];
    const counting = { pull: adapter.pull, commit: (uid: string, w: readonly unknown[]) => { sizes.push(w.length); return adapter.commit(uid, w as never); } };
    const dev = await makeDevice('big');
    await dev.storage.importDecks(deck(Array.from({ length: 1200 }, (_, i) => card(i + 1))), []);
    const s = await dev.signIn(A, counting);
    const report = await s.engine.sync();
    expect(Math.max(...sizes)).toBeLessThanOrEqual(500);
    expect(sizes).toEqual([500, 500, 203]); // 1 settings + 1 subject + 1 deck + 1200 cards
    expect(report.pushedWrites).toBe(1203);
    expect(cloud.list(A, 'records').length).toBe(1203);
  });

  it('re-syncing is idempotent: a second run writes nothing and changes nothing', async () => {
    const cloud = new MemoryCloud();
    const mac = await makeDevice('mac'), phone = await makeDevice('phone');
    await mac.storage.importDecks(deck([card(1), card(2)]), [review('r1', 1, '2026-11-01T08:00:00.000Z')]);
    const m = await mac.signIn(A, cloud.as(A)), p = await phone.signIn(A, cloud.as(A));
    await settle(m.engine, p.engine);
    const cloudBefore = JSON.stringify([...cloud.docs]);
    const macBefore = await mac.state(), phoneBefore = await phone.state();
    const r1 = await m.engine.sync(), r2 = await p.engine.sync();
    expect(r1.pushedWrites + r2.pushedWrites).toBe(0);
    expect(r1.changed).toEqual({ data: false, events: false, settings: false });
    expect(JSON.stringify([...cloud.docs])).toBe(cloudBefore);
    expect((await mac.state()).data).toEqual(macBefore.data);
    expect((await phone.state()).events).toEqual(phoneBefore.events);
  });

  it('recovers from a crash between batches: nothing lost, nothing duplicated', async () => {
    const cloud = new MemoryCloud();
    const dev = await makeDevice('crash');
    await dev.storage.importDecks(deck(Array.from({ length: 700 }, (_, i) => card(i + 1))), [review('r1', 1, '2026-11-01T08:00:00.000Z')]);
    const s = await dev.signIn(A, cloud.as(A));
    cloud.failOnCommit = 2;
    await expect(s.engine.sync()).rejects.toThrow('network lost');
    expect(await dev.local.pending()).toBeGreaterThan(0);
    cloud.failOnCommit = null;
    await s.engine.sync();
    expect(await dev.local.pending()).toBe(0);
    expect(cloud.list(A, 'records').length).toBe(703);
    const other = await makeDevice('other');
    const o = await other.signIn(A, cloud.as(A));
    await o.engine.sync();
    expect(cardIds((await other.state()).data).length).toBe(700);
    expect(ids((await other.state()).events)).toEqual(['r1']);
  });

  it('a rating made during a sync is never clobbered by the sync commit', async () => {
    const cloud = new MemoryCloud();
    const mac = await makeDevice('mac'), phone = await makeDevice('phone');
    const m = await mac.signIn(A, cloud.as(A)), p = await phone.signIn(A, cloud.as(A));
    await mac.storage.append(review('remote', 1, '2026-11-20T08:00:00.000Z'));
    await m.engine.sync();
    const realCommit = phone.local.commit.bind(phone.local);
    let raced = false;
    phone.local.commit = async (...args) => {
      if (!raced) { raced = true; await phone.storage.append(review('during-sync', 2, '2026-11-20T09:00:00.000Z')); }
      return realCommit(...args);
    };
    await p.engine.sync();
    expect(ids((await phone.state()).events)).toEqual(['during-sync', 'remote']);
    await settle(m.engine, p.engine);
    expect(ids((await mac.state()).events)).toEqual(['during-sync', 'remote']);
  });

  it('repairs the cloud when a stale device overwrote a newer record', async () => {
    const cloud = new MemoryCloud();
    const mac = await makeDevice('mac', 10_000);
    await mac.storage.importDecks(deck([card(1)]), []);
    const m = await mac.signIn(A, cloud.as(A));
    await m.engine.sync();
    mac.clock.now = 90_000;
    await mac.storage.importDecks(deck([card(1, 'newest')]), []);
    await m.engine.sync();
    // A buggy/stale client blindly writes an older version over it.
    const doc = cloud.list(A, 'records').find((d) => d.id === 'card~anki%3Ag1%3A0')!;
    await cloud.as(A).commit(A, [{ collection: 'records', id: doc.id, merge: false, data: { ...doc.data, u: 5, dev: 'stale', d: { ...(doc.data.d as object), front: 'stale' } } }]);
    await m.engine.sync(); // pulls the stale doc, keeps its own newer version, re-pushes
    const phone = await makeDevice('phone');
    const p = await phone.signIn(A, cloud.as(A));
    await p.engine.sync();
    expect(frontOf((await phone.state()).data, 1)).toBe('newest');
  });

  it('an edit made while its batch is in flight stays queued and uploads next time', async () => {
    const cloud = new MemoryCloud();
    const dev = await makeDevice('inflight', 10_000);
    await dev.storage.importDecks(deck([card(1)]), []);
    const adapter = cloud.as(A);
    let edited = false;
    const racing = {
      pull: adapter.pull,
      commit: async (uid: string, w: Parameters<typeof adapter.commit>[1]) => {
        await adapter.commit(uid, w);
        if (!edited) { edited = true; dev.clock.now = 20_000; await dev.storage.importDecks(deck([card(1, 'edited mid-push')]), []); }
      },
    };
    const s = await dev.signIn(A, racing);
    await s.engine.sync();
    expect(await dev.local.pending()).toBe(1);
    await s.engine.sync();
    expect(await dev.local.pending()).toBe(0);
    const doc = cloud.list(A, 'records').find((d) => d.id === 'card~anki%3Ag1%3A0')!;
    expect((doc.data.d as { front: string }).front).toBe('edited mid-push');
  });

  it('syncs settings last-writer-wins and keeps pending count accurate', async () => {
    const cloud = new MemoryCloud();
    const mac = await makeDevice('mac', 10_000), phone = await makeDevice('phone', 10_000);
    const m = await mac.signIn(A, cloud.as(A)), p = await phone.signIn(A, cloud.as(A));
    await settle(m.engine, p.engine);
    mac.clock.now = 20_000;
    await mac.setSettings({ theme: 'dark', retention: 0.85 });
    expect(pendingCount((await mac.state()).meta)).toBe(1);
    await settle(m.engine, p.engine);
    expect(phone.settings).toMatchObject({ theme: 'dark', retention: 0.85 });
  });
});
