import { useEffect, useState } from 'react';
import { Button, Group, Row, SectionFooter, SectionHeader } from '../ui';
import { plural } from '../plural';
import type { AccountController, AccountSnapshot } from './account';
import type { SyncStatus } from './engine';

export function syncStatusLabel(status: SyncStatus, pending: number, now = Date.now()): string {
  switch (status.kind) {
    case 'syncing':
      return 'Syncing…';
    case 'offline':
      return 'Offline, will sync';
    case 'error':
      return 'Couldn’t sync';
    case 'synced': {
      if (pending > 0) return 'Waiting to sync';
      const min = Math.floor((now - status.at) / 60_000);
      if (min < 1) return 'Synced just now';
      if (min < 60) return `Synced ${min} min ago`;
      return `Synced ${new Date(status.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
    }
    default:
      return pending > 0 ? 'Waiting to sync' : 'Not synced yet';
  }
}

function Avatar({ name, photoURL }: { name: string; photoURL: string | null }) {
  const [failed, setFailed] = useState(false);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  return photoURL && !failed ? (
    <img className="account-avatar" src={photoURL} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  ) : (
    <span className="account-avatar" aria-hidden="true">{initials}</span>
  );
}

export function AccountSection({ account, snapshot }: { account: AccountController; snapshot: AccountSnapshot }) {
  useEffect(() => { void account.preload?.(); }, [account]);
  const { phase, user, status, pending, error, confirmSignOut } = snapshot;
  if (phase === 'unavailable') return null;

  return (
    <section aria-label="Account" className="settings-section">
      <SectionHeader title="Account" />
      {phase === 'signedIn' && user ? (
        <>
          <Group ariaLabel="Account">
            <Row leading={<Avatar name={user.name} photoURL={user.photoURL} />} title={user.name} subtitle={user.email || undefined} />
            <Row
              title="Status"
              subtitle={status.kind === 'error' ? status.message : undefined}
              value={<span role="status">{syncStatusLabel(status, pending)}</span>}
              trailing={status.kind === 'error' ? <Button variant="plain" onClick={() => void account.syncNow()}>Retry</Button> : undefined}
            />
            <Row title="Sync now" tone="accent" disabled={status.kind === 'syncing'} onClick={() => void account.syncNow()} />
            {confirmSignOut ? (
              <Row
                title={`${plural(confirmSignOut, 'change')} not synced yet`}
                subtitle="They stay on this device and upload when you sign in again."
                trailing={
                  <div className="row-confirm-actions">
                    <Button variant="plain" onClick={() => account.cancelSignOut()}>Cancel</Button>
                    <Button variant="destructive" onClick={() => void account.signOut(true)}>Sign out</Button>
                  </div>
                }
              />
            ) : (
              <Row title="Sign out" tone="destructive" onClick={() => void account.signOut()} />
            )}
          </Group>
          <SectionFooter>Cards, review history and settings sync across your devices. Images stay on the device that imported them.</SectionFooter>
        </>
      ) : (
        <>
          <Group ariaLabel="Account">
            <Row
              title={phase === 'loading' ? 'Loading…' : phase === 'signingIn' ? 'Signing in…' : 'Sign in with Google'}
              subtitle="Sync cards, history and settings across devices"
              tone="accent"
              disabled={phase === 'loading' || phase === 'signingIn'}
              onClick={() => void account.signIn()}
            />
          </Group>
          {error ? (
            <SectionFooter className="section-footer-error"><span role="alert">{error}</span></SectionFooter>
          ) : (
            <SectionFooter>Optional. Flipwise works fully offline without an account.</SectionFooter>
          )}
        </>
      )}
    </section>
  );
}
