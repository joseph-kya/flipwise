import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CardContent } from './anki/content';
import { catchupAnswer, catchupItems, type CatchupItem } from './catchup';
import type { DemoCard, Subject } from './demoSubjects';
import { plural } from './plural';
import type { ReviewEvent } from './reviewLog';
import type { QueueCard } from './scheduler';
import type { EffectiveMotion } from './settings';
import { Button, Group, PageHeader, RatingButton, Row, SectionFooter, Select, SubjectTile, Switch, type SelectOption } from './ui';
import { AccuracyRing, AnimatedNumber, springSamples } from './motion';

export type CatchupCard = QueueCard & DemoCard;

interface Answer { cardId: string; knew: boolean; eventId: string | null }

const SWIPE_COMMIT = 0.32;    // fraction of card width
const FLICK_VELOCITY = 0.5;   // px/ms

export function CatchupPage({
  scope, subjects, catalog, log, retention, media, motion, onAppend, onRemove, onActiveChange,
}: {
  scope: { subjectId: string; lessonId: string };
  subjects: readonly Subject[];
  catalog: readonly CatchupCard[];
  log: readonly ReviewEvent[];
  retention: number;
  media: Record<string, string>;
  motion: EffectiveMotion;
  onAppend: (event: ReviewEvent) => Promise<ReviewEvent[]>;
  onRemove: (ids: string[]) => Promise<ReviewEvent[]>;
  onActiveChange: (active: boolean) => void;
}) {
  const global = scope.subjectId === 'global';
  const subject = subjects.find((s) => s.id === scope.subjectId);
  const lecture = subject?.lectures.find((l) => l.id === scope.lessonId);
  const [everything, setEverything] = useState(false);
  const [phase, setPhase] = useState<'setup' | 'session' | 'summary'>('setup');
  const [items, setItems] = useState<CatchupItem<CatchupCard>[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState('');
  const [started, setStarted] = useState(0);
  const cardStart = useRef(Date.now());
  const logRef = useRef(log);
  logRef.current = log;
  const everythingId = useId();
  const [exits, setExits] = useState<Exit[]>([]);
  const exitKey = useRef(0);

  const scoped = useMemo(
    () => catalog.filter((c) => global || (c.subjectId === scope.subjectId && (scope.lessonId === 'all' || c.lessonId === scope.lessonId))),
    [catalog, global, scope.subjectId, scope.lessonId],
  );
  const preview = useMemo(() => catchupItems(scoped, log, new Date(), true), [scoped, log, phase === 'setup']);
  const due = preview.filter((i) => i.kind === 'due').length;
  const planned = everything ? preview.length : due;

  useEffect(() => { onActiveChange(phase === 'session'); return () => onActiveChange(false); }, [phase]);
  useEffect(() => { setPhase('setup'); setAnswers([]); }, [scope.subjectId, scope.lessonId]);

  const start = () => {
    setItems(catchupItems(scoped, logRef.current, new Date(), everything));
    setAnswers([]);
    setRevealed(false);
    setError('');
    setStarted(Date.now());
    cardStart.current = Date.now();
    setPhase('session');
    window.scrollTo(0, 0);
  };

  const index = answers.length;
  const current = items[index];
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  // Answers and undos run strictly in order, so fast taps/keys are queued, never dropped.
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const enqueue = (task: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(task).catch(() => setError('Couldn’t save that answer. Try again.'));
  };

  const answer = (knew: boolean) => enqueue(async () => {
    const done = answersRef.current, list = itemsRef.current;
    const item = list[done.length];
    if (!item) return;
    const event = catchupAnswer(item.card, knew, logRef.current, new Date(), Date.now() - cardStart.current, retention, crypto.randomUUID());
    if (event) logRef.current = await onAppend(event);
    const next = [...done, { cardId: item.card.cardId, knew, eventId: event?.id ?? null }];
    answersRef.current = next;
    setAnswers(next);
    setRevealed(false);
    cardStart.current = Date.now();
    if (next.length >= list.length) setPhase('summary');
  });

  const undo = () => enqueue(async () => {
    const done = answersRef.current, last = done.at(-1);
    if (!last) return;
    if (last.eventId) logRef.current = await onRemove([last.eventId]);
    const next = done.slice(0, -1);
    answersRef.current = next;
    setAnswers(next);
    setRevealed(false);
    setPhase('session');
  });

  const commitRef = useRef<(knew: boolean) => void>(() => undefined);
  // Keyboard: Space reveals, 1 = didn't know, 2 = knew it, ⌘/Ctrl+Z undoes. No animation on keys.
  useEffect(() => {
    if (phase !== 'session') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || (e.target instanceof HTMLElement && e.target.closest('input,textarea,select,[contenteditable]'))) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopImmediatePropagation(); void undo(); return; }
      if (e.metaKey || e.ctrlKey) return;
      if (e.code === 'Space') { e.preventDefault(); setRevealed(true); }
      else if (e.key === '1') { e.preventDefault(); commitRef.current(false); }
      else if (e.key === '2') { e.preventDefault(); commitRef.current(true); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const backHref = global ? '#/' : `#/subjects/${scope.subjectId}`;
  const scopeName = global ? 'All subjects' : lecture ? lecture.title : subject?.name ?? 'Catch up';

  if (phase === 'setup') {
    const scopeOptions: SelectOption<string>[] = global
      ? [{ value: 'global', label: 'All subjects' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))]
      : [{ value: 'all', label: 'All lessons' }, ...(subject?.lectures ?? []).map((l) => ({ value: l.id, label: l.title }))];
    return (
      <div className="section-stack">
        <PageHeader backHref={backHref} backLabel={global ? 'Today' : subject?.name ?? 'Back'} title="Catch up" subtitle="A fast pass: tap to flip, then knew it or didn’t." />
        <Group ariaLabel="Catch-up scope" overflowVisible>
          <Row
            leading={global ? undefined : <SubjectTile subjectId={scope.subjectId} name={subject?.name} size="sm" />}
            title={global ? 'Subjects' : 'Lessons'}
            trailing={
              <Select
                ariaLabel="Catch-up scope"
                options={scopeOptions}
                value={global ? 'global' : scope.lessonId}
                onChange={(v) => { location.hash = global ? (v === 'global' ? '#/catchup/global/all' : `#/catchup/${v}/all`) : `#/catchup/${scope.subjectId}/${v}`; }}
              />
            }
          />
          <Row
            title="Review everything"
            titleId={everythingId}
            subtitle={`Adds ${plural(preview.length - due, 'card')} that aren’t due. Those are practice only and keep their schedule.`}
            trailing={<Switch checked={everything} onChange={setEverything} labelledBy={everythingId} />}
          />
        </Group>
        <Group divider={false}>
          <div className="due-row">
            <div>
              <div className="due-figure">{planned}</div>
              <div className="due-label">{everything ? `${due} due · ${planned - due} practice` : due === 1 ? 'card due' : 'cards due'}</div>
            </div>
            <Button variant="primary" disabled={planned === 0} onClick={start}>Start</Button>
          </div>
        </Group>
        {planned === 0 && <SectionFooter>Nothing is due in {scopeName}. Turn on Review everything to run through it anyway.</SectionFooter>}
      </div>
    );
  }

  if (phase === 'summary') return <CatchupSummary answers={answers} scopeName={scopeName} started={started} motion={motion} backHref={backHref} onUndo={() => void undo()} />;

  /** Hand the answered card to the exit layer; the next card is live underneath immediately. */
  const commit: (knew: boolean, fromTransform?: string, velocity?: number) => void = (knew: boolean, fromTransform = 'translate3d(0,0,0) rotate(0deg)', velocity = knew ? 1.6 : -1.6) => {
    if (!current) return;
    if (motion !== 'off') setExits((list) => [...list.slice(-2), { key: exitKey.current++, item: current, revealed, fromTransform, velocity, knew }]);
    void answer(knew);
  };
  commitRef.current = commit;

  return (
    <div className="catchup">
      <div className="catchup-bar">
        <Button variant="plain" className="btn-compact" onClick={() => setPhase(answers.length ? 'summary' : 'setup')}>End</Button>
        <div className="progress-track catchup-track" role="progressbar" aria-label="Catch-up progress" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={index}>
          <div className="progress-fill" style={{ transform: `scaleX(${items.length ? index / items.length : 0})` }} />
        </div>
        <span className="catchup-count tabular">{Math.min(index + 1, items.length)} / {items.length}</span>
      </div>
      {error && <p className="inline-notice inline-notice-error" role="alert">{error}</p>}
      <div className="catchup-stage">
        {current && (
          <SwipeCard
            key={`${index}-${current.card.cardId}`}
            motion={motion}
            entering={index > 0}
            onCommit={commit}
            onTap={() => setRevealed(true)}
          >
            <CardFace item={current} revealed={revealed} media={media}
              undo={answers.length > 0 ? () => void undo() : undefined} />
          </SwipeCard>
        )}
        {exits.map((x) => (
          <ExitCard key={x.key} exit={x} motion={motion} onDone={() => setExits((list) => list.filter((e) => e.key !== x.key))}>
            <CardFace item={x.item} revealed={x.revealed} media={media} />
          </ExitCard>
        ))}
      </div>
      <div className="catchup-actions">
        <RatingButton tone="again" className="catchup-btn" shortcut="1" onClick={() => commit(false)}>Didn’t know</RatingButton>
        <RatingButton tone="easy" className="catchup-btn" shortcut="2" onClick={() => commit(true)}>Knew it</RatingButton>
      </div>
    </div>
  );
}

interface Exit { key: number; item: CatchupItem<CatchupCard>; revealed: boolean; fromTransform: string; velocity: number; knew: boolean }

function CardFace({ item, revealed, media, undo }: { item: CatchupItem<CatchupCard>; revealed: boolean; media: Record<string, string>; undo?: () => void }) {
  return (
    <section className="study-card catchup-card" aria-label="Flashcard">
      <div className="card-meta">
        <span>{item.kind === 'practice' ? 'Practice · schedule unchanged' : 'Due'}</span>
        {undo && <Button variant="plain" className="btn-compact catchup-undo" onClick={(e) => { e.stopPropagation(); undo(); }}>Undo</Button>}
      </div>
      <div className="card-question"><CardContent card={item.card} side="front" media={media} /></div>
      {revealed ? (
        <div className="card-answer"><CardContent card={item.card} side="back" media={media} /></div>
      ) : (
        <p className="catchup-hint">Tap to show the answer</p>
      )}
    </section>
  );
}

/**
 * The answered card leaving: continues at the release velocity (a button or key gives it a
 * brisk default), rotating a little more as it goes. Reduced motion fades it in place.
 */
function ExitCard({ exit, motion, onDone, children }: { exit: Exit; motion: EffectiveMotion; onDone: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') { onDone(); return; }
    let anim: Animation;
    if (motion === 'reduced') {
      anim = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'ease-out', fill: 'forwards' });
    } else {
      const dir = exit.knew ? 1 : -1;
      const dist = window.innerWidth + el.offsetWidth;
      const speed = Math.max(Math.abs(exit.velocity), 1.4); // px/ms, never slower than the finger
      const duration = Math.min(320, Math.max(180, dist / speed));
      anim = el.animate(
        [{ transform: exit.fromTransform }, { transform: `translate3d(${dir * dist}px, 24px, 0) rotate(${dir * 16}deg)` }],
        // Starts at the finger's speed (steep, almost linear start) and keeps going off-screen.
        { duration, easing: 'cubic-bezier(0.3, 0.5, 0.7, 1)', fill: 'forwards' },
      );
    }
    anim.finished.then(onDone, onDone);
    return () => anim.cancel();
  }, []);
  return (
    <div ref={ref} className="catchup-exit" aria-hidden="true">
      <span className={`catchup-tint ${exit.knew ? 'catchup-tint-knew' : 'catchup-tint-missed'}`} style={{ opacity: 1 }} />
      {children}
    </div>
  );
}

/**
 * Horizontal swipe: 1:1 tracking while the finger is down (transform written directly, no
 * state per move), edge tints and a label follow the drag. Release commits on distance OR
 * flick velocity (handing transform + velocity to the exit layer), otherwise a velocity-seeded
 * spring brings it back. Vertical drags stay native scroll (touch-action: pan-y).
 */
function SwipeCard({ children, motion, entering, onCommit, onTap }: {
  children: React.ReactNode; motion: EffectiveMotion; entering: boolean;
  onCommit: (knew: boolean, fromTransform?: string, velocity?: number) => void; onTap: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; dx: number; locked: 'none' | 'x' | 'y'; hist: { x: number; t: number }[] } | null>(null);
  const moved = useRef(false);
  const spring = useRef<Animation | null>(null);
  const missedRef = useRef<HTMLSpanElement>(null), knewRef = useRef<HTMLSpanElement>(null);
  const tintMissed = useRef<HTMLSpanElement>(null), tintKnew = useRef<HTMLSpanElement>(null);

  // The next card settles up from the stack as the previous one flies off.
  useEffect(() => {
    const el = ref.current;
    if (!entering || motion === 'off' || !el || typeof el.animate !== 'function') return;
    const a = motion === 'full'
      ? el.animate([{ transform: 'translate3d(0, 8px, 0) scale(0.97)', opacity: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' })
      : el.animate([{ opacity: 0.6 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
    return () => a.cancel();
  }, []);

  const transformFor = (dx: number) => `translate3d(${dx}px,0,0) rotate(${motion === 'full' ? dx * 0.04 : 0}deg)`;
  const setX = (dx: number) => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = transformFor(dx);
    const w = el.offsetWidth || 1;
    const p = Math.max(-1, Math.min(1, dx / (w * SWIPE_COMMIT)));
    for (const [node, v] of [[missedRef, -p], [knewRef, p], [tintMissed, -p], [tintKnew, p]] as const)
      if (node.current) node.current.style.opacity = String(Math.max(0, v));
  };

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button > 0 || drag.current) return; // ignore extra fingers
    if ((e.target as HTMLElement).closest('a, button, .table-scroll')) return;
    moved.current = false;
    // Catch a card that is still springing back: continue from where it is on screen.
    let start = 0;
    if (spring.current && ref.current) {
      const m = new DOMMatrixReadOnly(getComputedStyle(ref.current).transform);
      start = m.m41;
      spring.current.cancel();
      spring.current = null;
      setX(start);
    }
    drag.current = { id: e.pointerId, x: e.clientX - start, y: e.clientY, dx: start, locked: start ? 'x' : 'none', hist: [] };
    if (start) { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || d.locked === 'y') return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (d.locked === 'none') {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      d.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (d.locked === 'y') return;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    moved.current = true;
    d.dx = dx;
    d.hist.push({ x: e.clientX, t: performance.now() });
    if (d.hist.length > 5) d.hist.shift();
    setX(dx);
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const el = ref.current;
    if (d.locked !== 'x' || !el) return;
    const first = d.hist[0], last = d.hist.at(-1);
    const v = first && last && last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0; // px/ms
    const w = el.offsetWidth || 1;
    const committed = Math.abs(d.dx) > w * SWIPE_COMMIT || (Math.abs(v) > FLICK_VELOCITY && Math.sign(v) === Math.sign(d.dx));
    if (committed) {
      const from = el.style.transform;
      el.style.visibility = 'hidden'; // the exit layer takes over at exactly this transform
      onCommit(d.dx > 0, from, v);
      // If the answer could not be saved the card stays; bring it back rather than leave a hole.
      setTimeout(() => { if (ref.current) { ref.current.style.visibility = ''; setX(0); } }, 600);
      return;
    }
    // Spring back, seeded with the release velocity (no bounce under reduced motion).
    setX(0);
    if (motion === 'off' || typeof el.animate !== 'function') return;
    const { samples, duration } = motion === 'full' ? springSamples(d.dx, v) : { samples: [d.dx, 0], duration: 160 };
    spring.current = el.animate(samples.map((x) => ({ transform: transformFor(x) })), { duration, easing: 'linear' });
    spring.current.finished.then(() => { spring.current = null; }, () => undefined);
  };

  return (
    <div
      ref={ref}
      className="catchup-swipe"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClick={(e) => { if (!moved.current && !(e.target as HTMLElement).closest('a, button')) onTap(); }}
    >
      <span ref={tintMissed} className="catchup-tint catchup-tint-missed" aria-hidden="true" />
      <span ref={tintKnew} className="catchup-tint catchup-tint-knew" aria-hidden="true" />
      <span ref={missedRef} className="catchup-swipe-label catchup-swipe-missed" aria-hidden="true">Didn’t know</span>
      <span ref={knewRef} className="catchup-swipe-label catchup-swipe-knew" aria-hidden="true">Knew it</span>
      {children}
    </div>
  );
}

/** End of session: counts roll up and an accuracy ring draws in. A calm celebration, no confetti. */
function CatchupSummary({ answers, scopeName, started, motion, backHref, onUndo }: {
  answers: Answer[]; scopeName: string; started: number; motion: EffectiveMotion; backHref: string; onUndo: () => void;
}) {
  const knew = answers.filter((a) => a.knew).length;
  const saved = answers.filter((a) => a.eventId).length;
  const minutes = Math.max(1, Math.round((Date.now() - started) / 60_000));
  const [shown, setShown] = useState(motion === 'full' ? 0 : 1);
  useEffect(() => { if (motion === 'full') { const t = setTimeout(() => setShown(1), 120); return () => clearTimeout(t); } }, []);
  const n = (v: number) => <AnimatedNumber value={Math.round(v * shown)} motion={motion} />;
  const percent = answers.length ? Math.round((knew / answers.length) * 100) : 0;
  return (
    <div className="section-stack catchup-summary">
      <div className="catchup-summary-head">
        <AccuracyRing percent={percent * shown} size={64} strokeWidth={6} motion={motion} />
        <PageHeader title="Caught up" subtitle={`${scopeName} · ${plural(answers.length, 'card')} in ${plural(minutes, 'minute')}`} />
      </div>
      <Group ariaLabel="Catch-up summary" className="catchup-summary-group">
        <Row title="Knew it" value={n(knew)} valueStrong />
        <Row title="Didn’t know" value={n(answers.length - knew)} valueStrong />
        <Row title="Reviews saved" subtitle="Due cards, rescheduled by FSRS" value={n(saved)} />
        {answers.length - saved > 0 && <Row title="Practice" subtitle="Not due, schedule unchanged" value={n(answers.length - saved)} />}
      </Group>
      {answers.length - knew > 0 && <SectionFooter>Cards you didn’t know come back within minutes in regular study.</SectionFooter>}
      <div className="catchup-summary-actions">
        <Button variant="primary" size="full" href={backHref}>Done</Button>
        <Button variant="plain" onClick={onUndo}>Undo last answer</Button>
      </div>
    </div>
  );
}
