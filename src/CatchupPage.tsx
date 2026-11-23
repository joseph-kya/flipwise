import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CardContent } from './anki/content';
import { catchupAnswer, catchupItems, type CatchupItem } from './catchup';
import type { DemoCard, Subject } from './demoSubjects';
import { plural } from './plural';
import type { ReviewEvent } from './reviewLog';
import type { QueueCard } from './scheduler';
import type { EffectiveMotion } from './settings';
import { Button, Group, PageHeader, RatingButton, Row, SectionFooter, Select, Switch, type SelectOption } from './ui';

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

  // Keyboard: Space reveals, 1 = didn't know, 2 = knew it, ⌘/Ctrl+Z undoes. No animation on keys.
  useEffect(() => {
    if (phase !== 'session') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.altKey || (e.target instanceof HTMLElement && e.target.closest('input,textarea,select,[contenteditable]'))) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopImmediatePropagation(); void undo(); return; }
      if (e.metaKey || e.ctrlKey) return;
      if (e.code === 'Space') { e.preventDefault(); setRevealed(true); }
      else if (e.key === '1') { e.preventDefault(); void answer(false); }
      else if (e.key === '2') { e.preventDefault(); void answer(true); }
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

  if (phase === 'summary') {
    const knew = answers.filter((a) => a.knew).length;
    const saved = answers.filter((a) => a.eventId).length;
    const minutes = Math.max(1, Math.round((Date.now() - started) / 60_000));
    return (
      <div className="section-stack">
        <PageHeader title="Caught up" subtitle={`${scopeName} · ${plural(answers.length, 'card')} in ${plural(minutes, 'minute')}`} />
        <Group ariaLabel="Catch-up summary">
          <Row title="Knew it" value={knew} valueStrong />
          <Row title="Didn’t know" value={answers.length - knew} valueStrong />
          <Row title="Reviews saved" subtitle="Due cards, rescheduled by FSRS" value={saved} />
          {answers.length - saved > 0 && <Row title="Practice" subtitle="Not due, schedule unchanged" value={answers.length - saved} />}
        </Group>
        {answers.length - knew > 0 && <SectionFooter>Cards you didn’t know come back within minutes in regular study.</SectionFooter>}
        <div className="catchup-summary-actions">
          <Button variant="primary" size="full" href={backHref}>Done</Button>
          <Button variant="plain" onClick={() => void undo()}>Undo last answer</Button>
        </div>
      </div>
    );
  }

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
      {current && (
        <SwipeCard
          key={`${index}-${current.card.cardId}`}
          motion={motion}
          onAnswer={(knew) => void answer(knew)}
          onTap={() => setRevealed(true)}
        >
          <section className="study-card catchup-card" aria-label="Flashcard">
            <div className="card-meta">
              <span>{current.kind === 'practice' ? 'Practice · schedule unchanged' : 'Due'}</span>
              {answers.length > 0 && (
                <Button variant="plain" className="btn-compact catchup-undo" onClick={(e) => { e.stopPropagation(); void undo(); }}>Undo</Button>
              )}
            </div>
            <div className="card-question"><CardContent card={current.card} side="front" media={media} /></div>
            {revealed ? (
              <div className="card-answer"><CardContent card={current.card} side="back" media={media} /></div>
            ) : (
              <p className="catchup-hint">Tap to show the answer</p>
            )}
          </section>
        </SwipeCard>
      )}
      <div className="catchup-actions">
        <RatingButton tone="again" className="catchup-btn" shortcut="1" onClick={() => void answer(false)}>Didn’t know</RatingButton>
        <RatingButton tone="easy" className="catchup-btn" shortcut="2" onClick={() => void answer(true)}>Knew it</RatingButton>
      </div>
    </div>
  );
}

/**
 * Horizontal swipe: 1:1 tracking while the finger is down (transform written directly, no
 * state per move), then commit on distance OR flick velocity, flying out at the release speed;
 * otherwise a quick snap back. Vertical drags stay native scroll (touch-action: pan-y).
 */
function SwipeCard({ children, motion, onAnswer, onTap }: { children: React.ReactNode; motion: EffectiveMotion; onAnswer: (knew: boolean) => void; onTap: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number; t: number; dx: number; locked: 'none' | 'x' | 'y'; hist: { x: number; t: number }[] } | null>(null);
  const moved = useRef(false);
  const missedRef = useRef<HTMLSpanElement>(null), knewRef = useRef<HTMLSpanElement>(null);

  const setX = (dx: number) => {
    const el = ref.current;
    if (!el) return;
    const rot = motion === 'full' ? dx * 0.04 : 0;
    el.style.transform = `translate3d(${dx}px,0,0) rotate(${rot}deg)`;
    const w = el.offsetWidth || 1;
    const [missed, knew] = [missedRef.current, knewRef.current];
    if (missed) missed.style.opacity = String(Math.max(0, Math.min(1, -dx / (w * SWIPE_COMMIT))));
    if (knew) knew.style.opacity = String(Math.max(0, Math.min(1, dx / (w * SWIPE_COMMIT))));
  };

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button > 0 || drag.current) return; // ignore extra fingers
    if ((e.target as HTMLElement).closest('a, button, .table-scroll')) return;
    moved.current = false;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, locked: 'none', hist: [] };
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
    const commit = Math.abs(d.dx) > w * SWIPE_COMMIT || (Math.abs(v) > FLICK_VELOCITY && Math.sign(v) === Math.sign(d.dx));
    const from = el.style.transform;
    if (commit) {
      const knew = d.dx > 0;
      if (motion === 'off' || typeof el.animate !== 'function') return onAnswer(knew);
      const dist = window.innerWidth + w;
      const speed = Math.max(Math.abs(v), 1.2); // continue at least as fast as the finger
      const duration = motion === 'reduced' ? 120 : Math.min(260, Math.max(140, (dist - Math.abs(d.dx)) / speed));
      const to = motion === 'reduced' ? from : `translate3d(${knew ? dist : -dist}px,0,0) rotate(${knew ? 18 : -18}deg)`;
      el.animate([{ transform: from, opacity: 1 }, { transform: to, opacity: motion === 'reduced' ? 0 : 1 }], { duration, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' })
        .finished.then(() => onAnswer(knew), () => onAnswer(knew));
    } else {
      setX(0);
      if (motion !== 'off' && typeof el.animate === 'function')
        el.animate([{ transform: from }, { transform: 'translate3d(0,0,0) rotate(0deg)' }], { duration: 240, easing: 'cubic-bezier(0.22, 1.18, 0.36, 1)' });
    }
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
      <span ref={missedRef} className="catchup-swipe-label catchup-swipe-missed" aria-hidden="true">Didn’t know</span>
      <span ref={knewRef} className="catchup-swipe-label catchup-swipe-knew" aria-hidden="true">Knew it</span>
      {children}
    </div>
  );
}
