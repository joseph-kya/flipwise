import { describe, expect, it } from 'vitest';
import { defaultProgress, onboardingGate, persistProgress, PROGRESS_KEY, restoreProgress, accountOutcome, canContinueOffline, hasRealDecks, isOnboardingComplete, markOnboardingComplete, shouldShowOnboarding } from './flow';
import { card, deck } from '../sync/testkit';

const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };

describe('onboarding gating', () => {
  it('shows only without the completion flag and without real decks', () => {
    expect(shouldShowOnboarding({ completed: false, realDecks: false })).toBe(true);
    expect(shouldShowOnboarding({ completed: true, realDecks: false })).toBe(false);
    expect(shouldShowOnboarding({ completed: false, realDecks: true })).toBe(false);
    expect(shouldShowOnboarding({ completed: false, realDecks: true, progress: 'learn' })).toBe(true);
    expect(shouldShowOnboarding({ completed: true, realDecks: true, progress: 'learn' })).toBe(false);
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

describe('resumable account gate', () => {
  const signedIn = { phase: 'signedIn' as const, authSettled: true, status: { kind: 'synced' as const, at: 1 } };
  it('skips welcome/account after popup or redirect success and preserves later steps', () => {
    for (const step of ['welcome', 'account'] as const) {
      expect(onboardingGate({ step, account: signedIn, realDecks: false, completed: false })).toEqual({ loading: false, step: 'start', finish: false });
    }
    for (const step of ['start', 'learn', 'done'] as const) {
      expect(onboardingGate({ step, account: signedIn, realDecks: false, completed: false }).step).toBe(step);
    }
  });
  it('finishes for existing cloud decks or completed onboarding', () => {
    expect(onboardingGate({ step: 'account', account: signedIn, realDecks: true, completed: false }).finish).toBe(true);
    expect(onboardingGate({ step: 'welcome', account: signedIn, realDecks: false, completed: true }).finish).toBe(true);
  });
  it('shows loading before auth settles and while the first cloud check is pending', () => {
    expect(onboardingGate({ step: 'welcome', account: { ...signedIn, authSettled: false }, realDecks: false, completed: false }).loading).toBe(true);
    expect(onboardingGate({ step: 'welcome', account: { ...signedIn, status: { kind: 'syncing' } }, realDecks: false, completed: false }).loading).toBe(true);
  });
  it('round-trips every progress field, including empty and nonempty course choices', () => {
    const s = memory();
    for (const choices of [null, [], ['robotics', 'analysis-1']]) {
      const progress = { step: 'learn' as const, view: 'starter' as const, panel: 2, choices };
      persistProgress(progress, s);
      expect(restoreProgress(s)).toEqual(progress);
    }
    markOnboardingComplete(s);
    expect(restoreProgress(s).step).toBe('welcome');
  });
  it('recovers safely from corrupt/unavailable storage and validates individual fields', () => {
    const s = memory();
    s.setItem(PROGRESS_KEY, '{');
    expect(restoreProgress(s)).toEqual(defaultProgress());
    s.setItem(PROGRESS_KEY, JSON.stringify({ step: 'learn', view: 'bad', panel: 99, choices: [7] }));
    expect(restoreProgress(s)).toEqual({ step: 'learn', view: 'choose', panel: 2, choices: null });
    expect(restoreProgress(null)).toEqual(defaultProgress());
  });
});
