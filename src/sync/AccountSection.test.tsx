// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { openReviewStorage } from '../reviewStorage';
import { AccountController, type AccountSnapshot } from './account';
import { AccountSection, syncStatusLabel } from './AccountSection';
import { firebaseSetup } from './config';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function render(snapshot: AccountSnapshot) {
  const el = document.createElement('div');
  const root = createRoot(el);
  const controller = {} as AccountController;
  act(() => root.render(<AccountSection account={controller} snapshot={snapshot} />));
  return el;
}

const base: AccountSnapshot = { phase: 'signedOut', user: null, status: { kind: 'idle' }, pending: 0, error: '', confirmSignOut: null };

describe('account section', () => {
  it('hides itself entirely when Firebase is not configured', async () => {
    expect(firebaseSetup({})).toBeNull();
    expect(firebaseSetup({ VITE_FIREBASE_API_KEY: 'k' })).toBeNull();
    const { storage } = await openReviewStorage({ name: 'account-unconfigured' });
    const controller = new AccountController(storage, { onApplied: () => {}, onReplaced: () => {} }, null);
    controller.start(); // must not throw or import Firebase
    expect(controller.getSnapshot().phase).toBe('unavailable');
    expect(render(controller.getSnapshot()).innerHTML).toBe('');
  });

  it('uses only the demo project when the emulator flag is set', () => {
    expect(firebaseSetup({ VITE_FIREBASE_EMULATOR: '1' })).toMatchObject({ emulator: true, config: { projectId: 'demo-flipwise' } });
  });

  it('shows a sign-in row when signed out', () => {
    const el = render(base);
    expect(el.textContent).toContain('Sign in with Google');
    expect(el.textContent).toContain('works fully offline');
  });

  it('shows identity, status, sync now and sign out when signed in', () => {
    const el = render({ ...base, phase: 'signedIn', user: { uid: 'u', name: 'Joseph K', email: 'j@example.com', photoURL: null }, status: { kind: 'synced', at: Date.now() } });
    expect(el.textContent).toContain('Joseph K');
    expect(el.textContent).toContain('j@example.com');
    expect(el.textContent).toContain('Synced just now');
    expect(el.textContent).toContain('Sync now');
    expect(el.textContent).toContain('Sign out');
    const err = render({ ...base, phase: 'signedIn', user: { uid: 'u', name: 'J', email: '', photoURL: null }, status: { kind: 'error', message: 'Permission denied by the server' } });
    expect(err.textContent).toContain('Retry');
    const confirm = render({ ...base, phase: 'signedIn', user: { uid: 'u', name: 'J', email: '', photoURL: null }, confirmSignOut: 1 });
    expect(confirm.textContent).toContain('1 change not synced yet');
  });

  it('labels sync states', () => {
    expect(syncStatusLabel({ kind: 'syncing' }, 0)).toBe('Syncing…');
    expect(syncStatusLabel({ kind: 'offline' }, 3)).toBe('Offline, will sync');
    expect(syncStatusLabel({ kind: 'synced', at: 0 }, 0, 5 * 60_000)).toBe('Synced 5 min ago');
  });
});
