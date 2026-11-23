import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ImportedData } from '../anki/types';
import type { AccountController, AccountSnapshot } from '../sync/account';
import { plural } from '../plural';
import { Button, ChevronLeft, ChevronRight, Group, IconButton, Row, SectionFooter, SectionHeader, Switch } from '../ui';
import { accountOutcome, canContinueOffline, hasRealDecks, STEPS, type OnboardingStep } from './flow';
import { EXPLAINER_PANELS as HOW_PANELS, Explainer } from './Explainer';
import { loadStarterPack, type StarterPack } from './starterPack';

type StartView = 'choose' | 'starter' | 'own' | 'anki' | 'ai';

export interface OnboardingProps {
  account: { controller: AccountController; snapshot: AccountSnapshot } | null;
  online: boolean;
  imported: ImportedData | null;
  onAddStarter: (pack: StarterPack, subjectIds: string[]) => Promise<void>;
  renderImport: (onDone: () => void) => ReactNode;
  renderAiGuide: (onImport: () => void) => ReactNode;
  onFinish: () => void;
}

function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}
export { useOnline };

function Progress({ index }: { index: number }) {
  return (
    <div className="ob-progress" role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={index + 1}>
      {STEPS.map((s, i) => (
        <span key={s} className={`ob-progress-seg${i <= index ? ' is-on' : ''}`} />
      ))}
    </div>
  );
}

export function Onboarding({ account, online, imported, onAddStarter, renderImport, renderAiGuide, onFinish }: OnboardingProps) {
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [view, setView] = useState<StartView>('choose');
  const [panel, setPanel] = useState(0);
  const [dir, setDir] = useState<'forward' | 'back'>('forward');
  const realDecks = hasRealDecks(imported);
  const index = STEPS.indexOf(step);
  const headingRef = useRef<HTMLDivElement>(null);

  const go = (next: OnboardingStep, d: 'forward' | 'back' = 'forward') => {
    setDir(d);
    setStep(next);
    if (next === 'start' && d === 'forward') setView('choose');
    if (next === 'learn') setPanel(d === 'forward' ? 0 : HOW_PANELS - 1);
  };
  const toView = (v: StartView, d: 'forward' | 'back' = 'forward') => { setDir(d); setView(v); };

  // Signed in: skip ahead once the first sync tells us whether the cloud already has decks.
  const outcome = accountOutcome(account?.snapshot ?? null, realDecks);
  useEffect(() => {
    if (step !== 'account') return;
    if (outcome === 'done') go('done');
    else if (outcome === 'start') go('start');
  }, [step, outcome]);

  // Move focus to the new step for keyboard and screen-reader users.
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [step, view]);

  const back = () => {
    if (step === 'start' && view !== 'choose') return toView(view === 'anki' || view === 'ai' ? 'own' : 'choose', 'back');
    if (step === 'learn' && panel > 0) { setDir('back'); return setPanel(panel - 1); }
    if (step === 'learn') { setDir('back'); setStep('start'); return; }
    if (index > 0) go(STEPS[index - 1], 'back');
  };

  const key = step === 'learn' ? 'learn' : `${step}/${view}`;
  let body: ReactNode, actions: ReactNode = null;

  if (step === 'welcome') {
    body = (
      <>
        <h1 className="ob-title ob-title-hero">Flipwise</h1>
        <p className="ob-lead">Flashcards that come back right before you’d forget them, so a few minutes a day is enough to keep every course in your head.</p>
      </>
    );
    actions = <Button variant="primary" size="full" onClick={() => go('account')}>Get started</Button>;
  } else if (step === 'account') {
    const configured = !!account;
    const snap = account?.snapshot;
    const offlineOk = canContinueOffline({ configured, online });
    body = (
      <>
        <h1 className="ob-title">Sign in to keep your decks everywhere</h1>
        <p className="ob-lead">Your cards, reviews and settings sync between your phone, tablet and computer. Flipwise still works offline; it catches up when you’re back.</p>
        {snap?.phase === 'signedIn' && snap.user ? (
          <Group ariaLabel="Account">
            <Row title={snap.user.name} subtitle={snap.user.email || undefined} value={<span role="status">Checking your decks…</span>} />
          </Group>
        ) : !configured ? (
          <p className="ob-note">Sign-in isn’t set up on this copy of Flipwise. Everything stays on this device.</p>
        ) : !online ? (
          <p className="ob-note" role="status">You’re offline. Sign in later from Settings.</p>
        ) : null}
        {snap?.error && <p className="ob-note ob-note-error" role="alert">{snap.error}</p>}
      </>
    );
    actions = (
      <>
        {configured && snap?.phase !== 'signedIn' && (
          <Button
            variant="primary"
            size="full"
            disabled={!online || snap?.phase === 'loading' || snap?.phase === 'signingIn'}
            onClick={() => void account!.controller.signIn()}
          >
            {snap?.phase === 'signingIn' ? 'Signing in…' : 'Sign in with Google'}
          </Button>
        )}
        {offlineOk && snap?.phase !== 'signedIn' && (
          <Button variant="plain" className="ob-link" onClick={() => go('start')}>Continue offline</Button>
        )}
      </>
    );
  } else if (step === 'start') {
    if (view === 'choose') {
      body = (
        <>
          <h1 className="ob-title">Choose your start</h1>
          <p className="ob-lead">Take ready-made decks or bring your own. You can add more any time.</p>
          <Group ariaLabel="Ways to start" className="ob-choices">
            <Row
              title="AI & Robotics starter set"
              subtitle="Joseph’s decks from the lecture slides: Analysis 1, Robotics, Physics 1 and Programming 1"
              onClick={() => toView('starter')}
              trailing={<ChevronRight size={15} className="row-chevron" />}
            />
            <Row
              title="Import my own decks"
              subtitle="From Anki, or made from your notes with AI"
              onClick={() => toView('own')}
              trailing={<ChevronRight size={15} className="row-chevron" />}
            />
          </Group>
        </>
      );
      if (realDecks) actions = <Button variant="primary" size="full" onClick={() => go('learn')}>Continue</Button>;
    } else if (view === 'starter') {
      body = <StarterPicker onAdd={async (pack, ids) => { await onAddStarter(pack, ids); go('learn'); }} />;
    } else if (view === 'own') {
      body = (
        <>
          <h1 className="ob-title">Import your own decks</h1>
          <p className="ob-lead">Bring a deck you already have in Anki, or let AI write cards from your lecture notes.</p>
          <Group ariaLabel="Import options" className="ob-choices">
            <Row title="From Anki" subtitle="Export an .apkg and add it here" onClick={() => toView('anki')} trailing={<ChevronRight size={15} className="row-chevron" />} />
            <Row title="Make decks with AI" subtitle="Turn your notes into cards with Claude" onClick={() => toView('ai')} trailing={<ChevronRight size={15} className="row-chevron" />} />
          </Group>
        </>
      );
    } else if (view === 'anki') {
      body = (
        <>
          <h1 className="ob-title">Bring your Anki decks</h1>
          <Group ariaLabel="Export from Anki" className="ob-steps">
            <Row leading={<span className="ob-step-num">1</span>} title="In Anki, choose File › Export…" />
            <Row leading={<span className="ob-step-num">2</span>} title="Pick “Anki Deck Package (.apkg)”" subtitle="Tick “Include scheduling information” to keep your progress, and “Support older Anki versions”." />
            <Row leading={<span className="ob-step-num">3</span>} title="Choose the file below" subtitle="Flipwise keeps your decks, lectures and progress." />
          </Group>
          <div className="ob-embed">{renderImport(() => go('learn'))}</div>
        </>
      );
      if (realDecks) actions = <Button variant="primary" size="full" onClick={() => go('learn')}>Continue</Button>;
    } else {
      body = (
        <>
          <h1 className="ob-title">Make decks with AI</h1>
          <Group ariaLabel="Make decks with AI" className="ob-steps">
            <Row leading={<span className="ob-step-num">1</span>} title="Add the deck-maker skill to Claude" subtitle="Download it below and add it to Claude." />
            <Row leading={<span className="ob-step-num">2</span>} title="Copy a prompt and run it" subtitle="Fill in where your notes are. Claude writes the cards and saves an .apkg." />
            <Row leading={<span className="ob-step-num">3</span>} title="Import the .apkg here" subtitle="Same as an Anki deck." />
          </Group>
          <div className="ob-embed">{renderAiGuide(() => toView('anki'))}</div>
        </>
      );
      actions = <Button variant="secondary" size="full" onClick={() => toView('anki')}>I have my .apkg</Button>;
    }
  } else if (step === 'learn') {
    body = <Explainer index={panel} onIndex={(i) => { setDir(i > panel ? 'forward' : 'back'); setPanel(i); }} />;
    actions = (
      <Button variant="primary" size="full" onClick={() => { if (panel < HOW_PANELS - 1) { setDir('forward'); setPanel(panel + 1); } else go('done'); }}>
        {panel < HOW_PANELS - 1 ? 'Next' : 'Got it'}
      </Button>
    );
  } else {
    const subjects = imported?.subjects.filter((s) => s.lectures.some((l) => l.cards.length)) ?? [];
    const cards = subjects.reduce((n, s) => n + s.lectures.reduce((m, l) => m + l.cards.length, 0), 0);
    body = (
      <>
        <h1 className="ob-title">You’re all set</h1>
        <p className="ob-lead">
          {cards
            ? `${plural(cards, 'card')} across ${plural(subjects.length, 'course')}. Today shows what’s due; start there each day.`
            : 'Add decks any time from Subjects › Import. Today shows what’s due; start there each day.'}
        </p>
      </>
    );
    actions = <Button variant="primary" size="full" onClick={onFinish}>Start studying</Button>;
  }

  return (
    <div className="onboarding">
      <div className="ob-top">
        {index > 0 && step !== 'done' ? (
          <IconButton ariaLabel="Back" className="ob-back" onClick={back}><ChevronLeft size={22} /></IconButton>
        ) : <span className="ob-back-spacer" aria-hidden="true" />}
        <Progress index={index} />
        <span className="ob-back-spacer" aria-hidden="true" />
      </div>
      <main className="ob-body">
        <div key={key} ref={headingRef} tabIndex={-1} className={`ob-step ob-step-${dir}`}>{body}</div>
      </main>
      {actions && <div className="ob-actions"><div className="ob-actions-inner">{actions}</div></div>}
    </div>
  );
}

function StarterPicker({ onAdd }: { onAdd: (pack: StarterPack, ids: string[]) => Promise<void> }) {
  const [pack, setPack] = useState<StarterPack | null>(null);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const baseId = useId();

  useEffect(() => {
    let live = true;
    setError('');
    loadStarterPack().then(
      (p) => { if (!live) return; setPack(p); setPicked(new Set(p.subjects.map((s) => s.id))); },
      (e) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => { live = false; };
  }, [attempt]);

  const total = useMemo(() => pack?.subjects.filter((s) => picked.has(s.id)).reduce((n, s) => n + s.total, 0) ?? 0, [pack, picked]);

  return (
    <>
      <h1 className="ob-title">AI & Robotics starter set</h1>
      <p className="ob-lead">Decks by Joseph, made from the lecturers’ slides. Pick the courses you’re taking.</p>
      {error ? (
        <>
          <p className="ob-note ob-note-error" role="alert">{error}</p>
          <Button variant="secondary" onClick={() => setAttempt((a) => a + 1)}>Try again</Button>
        </>
      ) : !pack ? (
        <p className="ob-note" role="status">Loading the starter set…</p>
      ) : (
        <section aria-label="Courses">
          <SectionHeader title="Courses" />
          <Group ariaLabel="Courses">
            {pack.subjects.map((s, i) => (
              <Row
                key={s.id}
                titleId={`${baseId}-${i}`}
                title={s.name}
                subtitle={`${plural(s.lectures.length, 'lecture')} · ${plural(s.total, 'card')} · ${s.dailyNew} new a day`}
                trailing={
                  <Switch
                    checked={picked.has(s.id)}
                    labelledBy={`${baseId}-${i}`}
                    onChange={(on) => setPicked((prev) => { const next = new Set(prev); if (on) next.add(s.id); else next.delete(s.id); return next; })}
                  />
                }
              />
            ))}
          </Group>
          <SectionFooter>New cards per day are capped per course, so the daily load stays manageable.</SectionFooter>
          <div className="ob-inline-actions">
            <Button
              variant="primary"
              size="full"
              disabled={busy || picked.size === 0}
              onClick={async () => {
                setBusy(true);
                setError('');
                try { await onAdd(pack, [...picked]); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
              }}
            >
              {busy ? 'Adding…' : picked.size === pack.subjects.length ? `Add all ${plural(total, 'card')}` : `Add ${plural(picked.size, 'course')} · ${plural(total, 'card')}`}
            </Button>
          </div>
        </section>
      )}
    </>
  );
}
