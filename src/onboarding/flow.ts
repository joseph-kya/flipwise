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
export function shouldShowOnboarding(o: { completed: boolean; realDecks: boolean }): boolean {
  return !o.completed && !o.realDecks;
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
  try { s?.setItem(ONBOARDED_KEY, '1'); } catch { /* stays in memory */ }
}
