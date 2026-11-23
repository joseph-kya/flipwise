// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogStorage } from '../reviewStorage';
import type { AccountUser } from './client';
import { AccountController } from './account';
import { firebaseSetup } from './config';
import { AUTH_SETTLE_MS, AUTH_TIMEOUT_MESSAGE, REDIRECT_EXPLANATION } from './authRecovery';

const fake = vi.hoisted(() => ({
  ready: Promise.resolve<string | null>(null),
  autoEmit: true,
  initialUser: null as AccountUser | null,
  callback: null as ((user: AccountUser | null) => void) | null,
  unsub: vi.fn<() => void>(),
  signIn: vi.fn<() => Promise<void>>(),
  signOut: vi.fn<() => Promise<void>>(),
  prepareAccount: vi.fn<() => Promise<'same' | 'bound' | 'switched'>>(),
  getUidMeta: vi.fn<() => Promise<{ initialized: boolean; cursorRecords: number; cursorReviews: number; lastSyncedAt?: number } | null>>(),
  pending: vi.fn<() => Promise<number>>(),
}));
vi.mock('./client', () => ({ createFirebaseClient: () => ({
  redirectError: fake.ready,
  onUser: (cb: (user: AccountUser | null) => void) => {
    fake.callback = cb;
    if (fake.autoEmit) cb(fake.initialUser);
    return fake.unsub;
  },
  signIn: fake.signIn,
  signOut: fake.signOut,
  cloud: {
    pullRecords: async () => ({ items: [], maxSrv: 0 }),
    pullReviews: async () => ({ items: [], maxSrv: 0 }),
    pushBatch: async () => {},
  },
}) }));
let controller: AccountController;
const userA: AccountUser = { uid: 'u1', name: 'Joseph', email: 'j@example.test', photoURL: null };
beforeEach(() => {
  vi.useFakeTimers();
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  } });
  fake.ready = Promise.resolve(null);
  fake.autoEmit = true;
  fake.initialUser = null;
  fake.callback = null;
  fake.unsub.mockReset();
  fake.signIn.mockReset();
  fake.signOut.mockReset().mockImplementation(async () => { fake.callback?.(null); });
  fake.prepareAccount.mockReset().mockResolvedValue('same');
  fake.getUidMeta.mockReset().mockResolvedValue({ initialized: true, cursorRecords: 0, cursorReviews: 0, lastSyncedAt: 1 });
  fake.pending.mockReset().mockResolvedValue(0);
  controller = new AccountController(
    {
      sync: {
        prepareAccount: fake.prepareAccount,
        getUidMeta: fake.getUidMeta,
        pending: fake.pending,
        snapshot: async () => ({ data: null, events: [], meta: { v: 1, deviceId: 'd', rev: 0, bound: true, records: {}, tombs: {}, pendingReviews: [], pendingTombs: [] }, settings: { theme: 'system', motion: 'system', retention: 0.9 } }),
        commit: async () => true,
        saveUidMeta: async () => {},
        markPushed: async () => {},
      },
      subscribe: () => () => {},
    } as unknown as LogStorage,
    { onApplied: () => {}, onReplaced: () => {} },
    firebaseSetup({ VITE_FIREBASE_EMULATOR: '1' }),
  );
});
afterEach(() => { controller.dispose(); vi.useRealTimers(); });

describe('account readiness and recovery', () => {
  it('holds the gate through redirect settlement, then applies the first auth observer event', async () => {
    let resolve!: (error: string | null) => void;
    fake.ready = new Promise((r) => { resolve = r; });
    const loading = controller.preload();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'loading', authSettled: false });
    await vi.advanceTimersByTimeAsync(50);
    expect(controller.getSnapshot().authSettled).toBe(false);
    resolve(null);
    await loading;
    expect(controller.getSnapshot()).toMatchObject({ phase: 'signedOut', authSettled: true, authTimedOut: false });
  });
  it('keeps auth unsettled until the first signed-in user finishes preparing, never emitting settled+signedOut', async () => {
    let finishPrep!: (v: 'same') => void;
    fake.initialUser = userA;
    fake.prepareAccount.mockImplementation(() => new Promise((r) => { finishPrep = r; }));
    const states: Array<{ phase: string; authSettled: boolean }> = [];
    controller.subscribe(() => {
      const s = controller.getSnapshot();
      states.push({ phase: s.phase, authSettled: s.authSettled });
    });
    const loading = controller.preload();
    await vi.advanceTimersByTimeAsync(0);
    // Duplicate callback while preparing must not settle early or double-resolve
    fake.callback?.(userA);
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'loading', authSettled: false });
    finishPrep('same');
    await loading;
    expect(controller.getSnapshot()).toMatchObject({ phase: 'signedIn', authSettled: true, authTimedOut: false });
    expect(states.some((s) => s.authSettled && s.phase === 'signedOut')).toBe(false);
  });
  it('times out if redirectError hangs and accepts late settlement', async () => {
    let resolve!: (error: string | null) => void;
    fake.ready = new Promise((r) => { resolve = r; });
    const loading = controller.preload();
    await vi.advanceTimersByTimeAsync(AUTH_SETTLE_MS);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'signedOut', authSettled: true, authTimedOut: true, error: AUTH_TIMEOUT_MESSAGE });
    resolve(null);
    await loading;
    expect(controller.getSnapshot()).toMatchObject({ authTimedOut: false, error: '' });
  });
  it('times out if onUser never calls back after redirectError resolves, then accepts late callback once', async () => {
    fake.autoEmit = false;
    const loading = controller.preload();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.callback).not.toBeNull();
    expect(controller.getSnapshot()).toMatchObject({ phase: 'loading', authSettled: false });
    await vi.advanceTimersByTimeAsync(AUTH_SETTLE_MS);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'signedOut', authSettled: true, authTimedOut: true, error: AUTH_TIMEOUT_MESSAGE });
    fake.callback?.(userA);
    fake.callback?.(userA);
    await loading;
    expect(controller.getSnapshot()).toMatchObject({ phase: 'signedIn', authSettled: true, authTimedOut: false, error: '' });
  });
  it('cleans up engine, hint, and in-flight account preparation on sign-out', async () => {
    let finishPrep!: (v: 'same') => void;
    fake.initialUser = userA;
    fake.prepareAccount.mockImplementationOnce(() => new Promise((r) => { finishPrep = r; }));
    const loading = controller.preload();
    await vi.advanceTimersByTimeAsync(0);
    // Sign out while prepareAccount is still in flight
    fake.callback?.(null);
    finishPrep('same');
    await loading;
    expect(controller.getSnapshot()).toMatchObject({ phase: 'signedOut', user: null, authSettled: true });
    expect(localStorage.getItem('flipwise.account.v1')).toBeNull();

    // Sign in cleanly, then sign out via controller.signOut()
    fake.callback?.(userA);
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getSnapshot().phase).toBe('signedIn');
    expect(localStorage.getItem('flipwise.account.v1')).toBe('1');
    await controller.signOut(true);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'signedOut', user: null, status: { kind: 'idle' }, pending: 0 });
    expect(localStorage.getItem('flipwise.account.v1')).toBeNull();
  });
  it('unsubscribes and clears pending timers on dispose', async () => {
    fake.autoEmit = false;
    const loading = controller.preload();
    await vi.advanceTimersByTimeAsync(0);
    controller.dispose();
    await loading;
    expect(fake.unsub).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(AUTH_SETTLE_MS);
    expect(controller.getSnapshot().authTimedOut).toBe(false);
  });
  it('opens sign-in synchronously after preload and retains cancellations across retries/reloads', async () => {
    await controller.preload();
    fake.signIn.mockRejectedValue(new Error('Sign-in was cancelled. Please try again.'));
    const attempt = controller.signIn();
    expect(fake.signIn).toHaveBeenCalledTimes(1); // before yielding to any microtask
    expect(localStorage.getItem('flipwise.account.v1')).toBe('1');
    await attempt;
    expect(controller.getSnapshot().failures).toBe(1);
    await controller.signIn();
    expect(controller.getSnapshot()).toMatchObject({ failures: 2, phase: 'signedOut' });
    expect(localStorage.getItem('flipwise.auth-failures.v1')).toBe('2');
  });
  it('shows and counts a redirect return without a user', async () => {
    fake.ready = Promise.resolve(REDIRECT_EXPLANATION);
    await controller.preload();
    expect(controller.getSnapshot()).toMatchObject({ error: REDIRECT_EXPLANATION, failures: 1, authSettled: true });
  });
});
