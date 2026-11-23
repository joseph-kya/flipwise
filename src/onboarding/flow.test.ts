import { describe, expect, it } from 'vitest';
import { accountOutcome, canContinueOffline, hasRealDecks, isOnboardingComplete, markOnboardingComplete, shouldShowOnboarding } from './flow';
import { card, deck } from '../sync/testkit';

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };

describe('onboarding gating', () => {
  it('shows only without the completion flag and without real decks', () => {
    expect(shouldShowOnboarding({ completed: false, realDecks: false })).toBe(true);
    expect(shouldShowOnboarding({ completed: true, realDecks: false })).toBe(false);
    expect(shouldShowOnboarding({ completed: false, realDecks: true })).toBe(false);
  });

  it('counts imported, synced or starter cards as real decks, never demo or empty data', () => {
    expect(hasRealDecks(null)).toBe(false);
    expect(hasRealDecks({ ...deck([]), subjects: [] })).toBe(false);
    expect(hasRealDecks(deck([card(1)]))).toBe(true);
  });

  it('persists completion', () => {
    const s = memory();
    expect(isOnboardingComplete(s)).toBe(false);
    markOnboardingComplete(s);
    expect(isOnboardingComplete(s)).toBe(true);
    expect(isOnboardingComplete(null)).toBe(false);
  });

  it('offers "Continue offline" only when signing in is impossible', () => {
    expect(canContinueOffline({ configured: true, online: true })).toBe(false);
    expect(canContinueOffline({ configured: true, online: false })).toBe(true);
    expect(canContinueOffline({ configured: false, online: true })).toBe(true);
  });

  it('skips to done when a signed-in account already has decks; otherwise waits for the first sync', () => {
    expect(accountOutcome(null, false)).toBe('signin');
    expect(accountOutcome({ phase: 'signedOut', status: { kind: 'idle' } }, false)).toBe('signin');
    expect(accountOutcome({ phase: 'signedIn', status: { kind: 'syncing' } }, false)).toBe('checking');
    expect(accountOutcome({ phase: 'signedIn', status: { kind: 'synced', at: 1 } }, false)).toBe('start');
    expect(accountOutcome({ phase: 'signedIn', status: { kind: 'offline' } }, false)).toBe('start');
    expect(accountOutcome({ phase: 'signedIn', status: { kind: 'syncing' } }, true)).toBe('done');
  });
});
