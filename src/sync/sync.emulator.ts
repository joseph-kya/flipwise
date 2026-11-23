/**
 * Integration test against the local Firebase emulators (never the real project):
 *   npm run test:emulator
 * Two separate app clients signed in as the same emulator user sync each other's offline
 * reviews and edits through real Firestore; a different user is refused by firestore.rules.
 */
import 'fake-indexeddb/auto';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, initializeFirestore, type Firestore } from 'firebase/firestore/lite';
import { afterAll, describe, expect, it } from 'vitest';
import { replay } from '../scheduler';
import { firestoreAdapter } from './firestoreAdapter';
import { card, cardIds, deck, frontOf, makeDevice, review } from './testkit';

const PROJECT = 'demo-flipwise';
const run = Date.now().toString(36);
const apps: FirebaseApp[] = [];

function client(name: string): { app: FirebaseApp; db: Firestore; auth: ReturnType<typeof getAuth> } {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT, authDomain: '127.0.0.1', appId: 'demo-app' }, `${name}-${run}`);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { app, db, auth };
}

afterAll(async () => {
  for (const app of apps) await signOut(getAuth(app)).catch(() => undefined);
});

describe('Firebase emulator sync', () => {
  const email = `joseph-${run}@example.test`, password = 'emulator-only-secret';

  it('two clients with the same user exchange offline reviews and edits; another uid is refused', async () => {
    expect(process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').toContain('8080');
    const mac = client('mac'), phone = client('phone'), stranger = client('stranger');
    const { user } = await createUserWithEmailAndPassword(mac.auth, email, password);
    await signInWithEmailAndPassword(phone.auth, email, password);
    expect(phone.auth.currentUser?.uid).toBe(user.uid);
    const uid = user.uid;

    const macDev = await makeDevice('emu-mac', 10_000), phoneDev = await makeDevice('emu-phone', 10_000);
    // A guid with '.' and ':' checks that map keys survive Firestore field-path handling.
    const shared = review('anki-review:1:anki:g.1:0', 1, '2026-11-01T08:00:00.000Z', 'good', { source: 'anki' });
    await macDev.storage.importDecks(deck([card(1), card(2)]), [shared]);
    const m = await macDev.signIn(uid, firestoreAdapter(mac.db));
    const first = await m.engine.sync();
    expect(first.pushedWrites).toBeGreaterThan(0);

    const p = await phoneDev.signIn(uid, firestoreAdapter(phone.db));
    await p.engine.sync();
    expect(cardIds((await phoneDev.state()).data)).toEqual(['anki:g1:0', 'anki:g2:0']);

    // Both study offline (no sync), and both edit card 1; the phone's edit is later.
    await macDev.storage.append(review('mac-offline', 1, '2026-11-20T09:00:00.000Z', 'again'));
    await phoneDev.storage.append(review('phone-offline', 2, '2026-11-20T10:00:00.000Z', 'easy'));
    macDev.clock.now = 20_000;
    await macDev.storage.importDecks(deck([card(1, 'mac edit'), card(2)]), []);
    phoneDev.clock.now = 30_000;
    await phoneDev.storage.importDecks(deck([card(1, 'phone edit'), card(2)]), []);

    for (let i = 0; i < 2; i++) { await m.engine.sync(); await p.engine.sync(); }
    const a = await macDev.state(), b = await phoneDev.state();
    expect(a.events.map((e) => e.id).sort()).toEqual(['anki-review:1:anki:g.1:0', 'mac-offline', 'phone-offline']);
    expect(a.events).toEqual(b.events);
    expect(frontOf(a.data, 1)).toBe('phone edit');
    expect(frontOf(b.data, 1)).toBe('phone edit');
    expect([...replay(a.events)]).toEqual([...replay(b.events)]);

    // Idempotent: another round writes nothing.
    const again = await m.engine.sync();
    expect(again.pushedWrites).toBe(0);

    // Rules: a different signed-in user can neither read nor write this user's tree.
    await createUserWithEmailAndPassword(stranger.auth, `stranger-${run}@example.test`, password);
    const strangerCloud = firestoreAdapter(stranger.db);
    await expect(strangerCloud.pull(uid, 'records', 0)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(getDoc(doc(stranger.db, 'users', uid, 'records', 'settings~appearance'))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(strangerCloud.commit(uid, [{ collection: 'reviews', id: '2026-11-20', merge: true, data: { e: { x: '{}' } } }])).rejects.toMatchObject({ code: 'permission-denied' });
    // ...while it can use its own tree.
    await expect(strangerCloud.pull(stranger.auth.currentUser!.uid, 'records', 0)).resolves.toEqual([]);

    // Signed out: refused too.
    await signOut(phone.auth);
    await expect(firestoreAdapter(phone.db).pull(uid, 'reviews', 0)).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
