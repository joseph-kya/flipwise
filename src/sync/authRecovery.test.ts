import { describe, expect, it } from 'vitest';
import { AUTH_SETTLE_MS, authGateState, canEscapeSignIn, nextFailureCount, REDIRECT_EXPLANATION, redirectReturnMessage } from './authRecovery';
import { friendlyAuthError } from './client';

describe('auth recovery rules', () => {
  it('explains an empty redirect return, but not a successful or ordinary signed-out load', () => {
    expect(redirectReturnMessage(true, false)).toBe(REDIRECT_EXPLANATION);
    expect(redirectReturnMessage(true, true)).toBeNull();
    expect(redirectReturnMessage(false, false)).toBeNull();
  });
  it('counts failed and cancelled attempts toward an escape after two', () => {
    let count = 0;
    for (const code of ['auth/network-request-failed', 'auth/popup-closed-by-user']) {
      expect(friendlyAuthError({ code })).toBeTruthy();
      count = nextFailureCount(count);
      expect(canEscapeSignIn(count)).toBe(count >= 2);
    }
    expect(nextFailureCount(count)).toBe(2);
  });
  it('reports all cancellation codes instead of swallowing them', () => {
    for (const code of ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']) {
      expect(friendlyAuthError({ code })).toContain('cancelled');
    }
  });
  it('releases the auth gate at the timeout, allows escape, and accepts late auth settlement', () => {
    expect(authGateState(false, AUTH_SETTLE_MS - 1)).toBe('loading');
    expect(authGateState(false, AUTH_SETTLE_MS)).toBe('timeout');
    expect(canEscapeSignIn(0, true)).toBe(true);
    expect(authGateState(true, AUTH_SETTLE_MS + 1)).toBe('ready');
  });
});
