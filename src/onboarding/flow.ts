/** First-run onboarding: gating and step logic (pure; the UI lives in Onboarding.tsx). */
import type { ImportedData } from '../anki/types';
import type { AccountSnapshot } from '../sync/account';

export const ONBOARDED_KEY = 'flipwise.onboarded.v1';
export type OnboardingStep = 'welcome' | 'account' | 'start' | 'learn' | 'done';
export const STEPS: readonly OnboardingStep[] = ['welcome', 'account', 'start', 'learn', 'done'];

/** Real decks = any imported/synced/starter card. Built-in demo decks never count. */
export function hasRealDecks(data: ImportedData | null): boolean {
  return !!data && data.subjects.some((s) => s.lectures.some((l) => l.cards.length > 0));
}

/** Shown once: no completion flag AND no real decks. Settings can replay it explicitly. */
export function shouldShowOnboarding(o: { completed: boolean; realDecks: boolean; progress?: OnboardingStep }): boolean {
  return !o.completed && (!o.realDecks || (!!o.progress && o.progress !== 'welcome'));
}

/** "Continue offline" exists only when signing in is impossible, so onboarding never dead-ends. */
export function canContinueOffline(o: { configured: boolean; online: boolean }): boolean {
  return !o.configured || !o.online;
}

/**
 * Where the account step leads. Signed in with decks already in the cloud: skip to done.
 * Signed in and the first sync has finished (or can't finish): choose a start. Otherwise wait.
 */
export function accountOutcome(account: Pick<AccountSnapshot, 'phase' | 'status'> | null, realDecks: boolean): 'signin' | 'checking' | 'start' | 'done' {
  if (!account || account.phase !== 'signedIn') return 'signin';
  if (realDecks) return 'done';
  return ['synced', 'error', 'offline'].includes(account.status.kind) ? 'start' : 'checking';
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const store = (): Store | null => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function isOnboardingComplete(s: Store | null = store()): boolean {
  try { return s?.getItem(ONBOARDED_KEY) === '1'; } catch { return false; }
}

export function markOnboardingComplete(s: Store | null = store()): void {
  try { s?.setItem(ONBOARDED_KEY, '1'); s?.removeItem(PROGRESS_KEY); } catch { /* stays in memory */ }
}

export const PROGRESS_KEY = 'flipwise.onboarding-progress.v1';
export type StartView = 'choose' | 'starter' | 'own' | 'anki' | 'ai';
export interface OnboardingProgress {
  step: OnboardingStep;
  view: StartView;
  panel: number;
  /** null means the starter pack's default (all courses); [] is an explicit empty selection. */
  choices: string[] | null;
}
export const defaultProgress = (): OnboardingProgress => ({ step: 'welcome', view: 'choose', panel: 0, choices: null });
export function restoreProgress(s: Store | null = store()): OnboardingProgress {
  try {
    const p = JSON.parse(s?.getItem(PROGRESS_KEY) ?? 'null');
    if (!p || !STEPS.includes(p.step)) return defaultProgress();
    return {
      step: p.step,
      view: ['choose', 'starter', 'own', 'anki', 'ai'].includes(p.view) ? p.view : 'choose',
      panel: Number.isInteger(p.panel) ? Math.max(0, Math.min(2, p.panel)) : 0,
      choices: Array.isArray(p.choices) && p.choices.every((id: unknown) => typeof id === 'string') ? [...new Set<string>(p.choices)] : null,
    };
  } catch { return defaultProgress(); }
}
export function persistProgress(progress: OnboardingProgress, s: Store | null = store()) {
  try { s?.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch { /* memory remains usable */ }
}

/** Derive the visible gate before rendering, so Welcome never flashes during auth restoration. */
export function onboardingGate(o: {
  step: OnboardingStep;
  account: Pick<AccountSnapshot, 'phase' | 'status' | 'authSettled'> | null;
  realDecks: boolean;
  completed: boolean;
}): { loading: boolean; step: OnboardingStep; finish: boolean } {
  if (o.account && !o.account.authSettled) return { loading: true, step: o.step, finish: false };
  if (o.account?.phase === 'signedIn') {
    if (o.completed) return { loading: false, step: 'done', finish: true };
    if (o.step === 'welcome' || o.step === 'account') {
      const outcome = accountOutcome(o.account, o.realDecks);
      if (outcome === 'done') return { loading: false, step: 'done', finish: true };
      return { loading: outcome === 'checking', step: 'start', finish: false };
    }
  }
  return { loading: false, step: o.step, finish: false };
}
