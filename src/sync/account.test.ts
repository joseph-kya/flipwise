// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogStorage } from '../reviewStorage';
import type { AccountUser } from './client';
import { AccountController } from './account';
import { firebaseSetup } from './config';
import { AUTH_SETTLE_MS, REDIRECT_EXPLANATION } from './authRecovery';

const fake = vi.hoisted(() => ({
  ready: Promise.resolve<string | null>(null),
  callback: null as ((user: AccountUser | null) => void) | null,
  signIn: vi.fn<() => Promise<void>>(),
}));
vi.mock('./client', () => ({ createFirebaseClient: () => ({
  redirectError: fake.ready,
  onUser: (cb: (user: AccountUser | null) => void) => { fake.callback = cb; cb(null); return () => {}; },
  signIn: fake.signIn,
}) }));
let controller: AccountController;
beforeEach(() => {
  vi.useFakeTimers();
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  } });
  fake.ready = Promise.resolve(null);
  fake.callback = null;
  fake.signIn.mockReset();
  controller = new AccountController({ sync: {}, subscribe: () => () => {} } as unknown as LogStorage, { onApplied: () => {}, onReplaced: () => {} }, firebaseSetup({ VITE_FIREBASE_EMULATOR: '1' }));
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
  it('times out a never-settling client and accepts late settlement', async () => {
    let resolve!: (error: string | null) => void;
    fake.ready = new Promise((r) => { resolve = r; });
    const loading = controller.preload();
    await vi.advanceTimersByTimeAsync(AUTH_SETTLE_MS);
    expect(controller.getSnapshot()).toMatchObject({ phase: 'signedOut', authSettled: true, authTimedOut: true });
    resolve(null);
    await loading;
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
