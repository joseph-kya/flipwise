// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccountController, AccountSnapshot } from '../sync/account';
import { card, deck } from '../sync/testkit';
import { Onboarding, type OnboardingProps } from './Onboarding';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
window.scrollTo = () => undefined;

const snap = (over: Partial<AccountSnapshot> = {}): AccountSnapshot =>
  ({ phase: 'signedOut', authSettled: true, authTimedOut: false, failures: 0, user: null, status: { kind: 'idle' }, pending: 0, error: '', confirmSignOut: null, ...over });

const roots: ReturnType<typeof createRoot>[] = [];
function mount(props: Partial<OnboardingProps>) {
  const el = document.createElement('div');
  document.body.append(el);
  const root = createRoot(el);
  roots.push(root);
  const finished: string[] = [];
  const render = (p: Partial<OnboardingProps>) => act(() => root.render(
    <Onboarding
      account={null} online imported={null}
      onAddStarter={async () => undefined}
      renderImport={() => <p>import page</p>}
      renderAiGuide={() => <p>ai guide</p>}
      onFinish={() => finished.push('done')}
      {...props} {...p}
    />,
  ));
  render({});
  const click = (name: RegExp) => {
    const b = Array.from(el.querySelectorAll('button')).find((x) => name.test(x.textContent ?? ''));
    if (!b) throw new Error(`no button ${name}`);
    act(() => b.click());
  };
  return { el, click, render, finished };
}

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) } });
});
afterEach(() => { act(() => roots.splice(0).forEach((r) => r.unmount())); document.body.innerHTML = ''; });

const account = (s: AccountSnapshot) => ({ controller: { signIn: async () => undefined, preload: async () => null } as unknown as AccountController, snapshot: s });

describe('onboarding screens', () => {
  it('requires sign-in when it is possible: no "Continue offline" while configured and online', () => {
    const o = mount({ account: account(snap()), online: true });
    o.click(/Get started/);
    expect(o.el.textContent).toContain('Sign in with Google');
    expect(o.el.textContent).not.toContain('Continue offline');
  });

  it('never dead-ends: offers "Continue offline" when offline or not configured', () => {
    const offline = mount({ account: account(snap()), online: false });
    offline.click(/Get started/);
    expect(offline.el.textContent).toContain('Continue offline');
    localStorage.removeItem('flipwise.onboarding-progress.v1');
    const unconfigured = mount({ account: null, online: true });
    unconfigured.click(/Get started/);
    unconfigured.click(/Continue offline/);
    expect(unconfigured.el.textContent).toContain('Choose your start');
  });

  it('a signed-in account whose cloud already has decks skips straight to done', () => {
    const o = mount({ account: account(snap()), online: true });
    o.click(/Get started/);
    o.render({ account: account(snap({ phase: 'signedIn', user: { uid: 'u', name: 'J', email: '', photoURL: null }, status: { kind: 'syncing' } })) });
    expect(o.el.textContent).toContain('Checking your decks');
    o.render({ imported: deck([card(1), card(2)]), account: account(snap({ phase: 'signedIn', user: { uid: 'u', name: 'J', email: '', photoURL: null }, status: { kind: 'synced', at: 1 } })) });

    expect(o.finished).toEqual(['done']);
  });

  it('a signed-in user reloading from welcome never sees Welcome and advances past sign-in', () => {
    const o = mount({ account: account(snap({ phase: 'loading', authSettled: false })), online: true });
    expect(o.el.textContent).toContain('Restoring your account');
    expect(o.el.textContent).not.toContain('Get started');
    o.render({ account: account(snap({ phase: 'signedIn', authSettled: true, user: { uid: 'u', name: 'J', email: '', photoURL: null }, status: { kind: 'syncing' } })) });
    expect(o.el.textContent).toContain('Checking your decks');
    expect(o.el.textContent).not.toContain('Get started');
    o.render({ account: account(snap({ phase: 'signedIn', authSettled: true, user: { uid: 'u', name: 'J', email: '', photoURL: null }, status: { kind: 'synced', at: 1 } })) });
    expect(o.el.textContent).toContain('Choose your start');
    expect(o.el.textContent).not.toContain('Get started');
  });

  it('moves from welcome to account on auth timeout and exposes Continue without account', () => {
    const o = mount({ account: account(snap({ phase: 'loading', authSettled: false })), online: true });
    expect(o.el.textContent).toContain('Restoring your account');
    o.render({ account: account(snap({ phase: 'signedOut', authSettled: true, authTimedOut: true, error: 'Sign-in is taking longer than expected. Try again, or continue without an account.' })) });
    expect(o.el.textContent).toContain('Sign-in is taking longer than expected');
    expect(o.el.textContent).toContain('Continue without account');
    o.click(/Continue without account/);
    expect(o.el.textContent).toContain('Choose your start');
  });

  it('walks the explainer and supports back', () => {
    const o = mount({ account: null });
    o.click(/Get started/);
    o.click(/Continue offline/);
    o.render({ imported: deck([card(1)]) });
    o.click(/Continue/);
    const active = () => o.el.querySelector('.xp-panel.is-active')?.textContent ?? '';
    expect(active()).toContain('just before you’d forget');
    o.click(/Next/);
    expect(active()).toContain('Rate honestly');
    expect(active()).toContain('you’ll see it again in 7 weeks'); // real ts-fsrs number for Good
    act(() => (o.el.querySelector('button[aria-label="Back"]') as HTMLButtonElement).click());
    expect(active()).toContain('just before you’d forget');
    o.click(/Next/);
    o.click(/Next/);
    expect(active()).toContain('A little, every day');
    o.click(/Got it/);
    expect(o.el.textContent).toContain('You’re all set');
  });
});
