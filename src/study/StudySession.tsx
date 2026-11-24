import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { Card } from 'ts-fsrs';
import { CardContent } from '../anki/content';
import type { DemoCard, Subject } from '../demoSubjects';
import {
  AccuracyRing,
  AnimatedNumber,
  ConfettiBurst,
  animateButtonSpring,
  animateCardExit,
} from '../motion';
import { plural } from '../plural';
import type { Rating, ReviewEvent } from '../reviewLog';
import {
  intervalLabel,
  isLeech,
  nextAvailableAt,
  queue,
  ratingEvent,
  schedule,
  sessionOutcome,
  type QueueCard,
  type QueueLimits,
} from '../scheduler';
import { sessionStats } from '../sessionStats';
import type { EffectiveMotion } from '../settings';
import { Button, FlameIcon, Group, PageHeader, Row } from '../ui';

export type StudyCard = DemoCard & QueueCard;

const RATINGS: ReadonlyArray<{ key: Rating; label: string }> = [
  { key: 'again', label: 'Again' },
  { key: 'hard', label: 'Hard' },
  { key: 'good', label: 'Good' },
  { key: 'easy', label: 'Easy' },
];

type SwipeHint = { label: string; rating: Rating } | null;

interface ExitingCardState {
  key: number;
  card: DemoCard;
  cardNum: number;
  totalCards: number;
  rating: Rating;
  startTransform: string;
}

function ExitingCardOverlay({
  exiting,
  motion,
  onDone,
  media,
}: {
  media: Record<string, string>;
  exiting: ExitingCardState;
  motion: EffectiveMotion;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useLayoutEffect(() => {
    let active = true;
    animateCardExit(ref.current, exiting.rating, motion, exiting.startTransform).then(() => {
      if (active) onDoneRef.current();
    });
    return () => {
      active = false;
    };
  }, [exiting, motion]);

  return (
    <div ref={ref} className="card-exit-layer" aria-hidden="true">
      <section className="study-card">
        <div className="card-meta">
          <span>Question</span>
          <span>
            {exiting.cardNum} of {exiting.totalCards}
          </span>
        </div>
        <div className="card-question">
          <CardContent card={exiting.card} side="front" media={media} />
        </div>
        <div className="card-answer">
          <p className="card-answer-label">Answer</p>
          <CardContent card={exiting.card} side="back" media={media} />
        </div>
      </section>
    </div>
  );
}

function formatElapsed(ms: number): string {
  const safe = Math.max(0, ms);
  const minutes = Math.floor(safe / 60000);
  const seconds = Math.floor(safe / 1000) % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function SessionStatsGroup({
  stats,
  totalCards,
  elapsed,
  motion,
  showHeader = false,
}: {
  stats: ReturnType<typeof sessionStats>;
  totalCards: number;
  elapsed: string;
  motion: EffectiveMotion;
  showHeader?: boolean;
}) {
  return (
    <Group as="div" ariaLabel="Session statistics">
      {showHeader && (
        <div className="group-row session-head-row">
          <div className="row-main">
            <h2 className="session-sidebar-title">Session</h2>
            <span className="row-sub tabular">
              <AnimatedNumber value={stats.done} motion={motion} /> / {plural(totalCards, 'card')}
            </span>
          </div>
          <AccuracyRing
            percent={stats.accuracy}
            hasData={stats.done > 0}
            size={44}
            strokeWidth={4}
            motion={motion}
          />
        </div>
      )}
      <Row
        title="Done"
        value={
          <>
            <AnimatedNumber value={stats.done} motion={motion} /> / {totalCards}
          </>
        }
        valueStrong
      />
      <Row
        title="Remaining"
        value={<AnimatedNumber value={stats.remaining} motion={motion} />}
        valueStrong
      />
      <Row
        title="Correct"
        value={<AnimatedNumber value={stats.right} motion={motion} />}
        valueStrong
      />
      <Row
        title="Hard"
        value={<AnimatedNumber value={stats.hard} motion={motion} />}
        valueStrong
      />
      <Row
        title="Again"
        value={<AnimatedNumber value={stats.again} motion={motion} />}
        valueStrong
      />
      <Row
        title="Accuracy"
        value={
          stats.done > 0 ? (
            <AnimatedNumber value={stats.accuracy} motion={motion} suffix="%" />
          ) : (
            '—'
          )
        }
        valueStrong
      />
      <Row title="Time" value={elapsed} valueStrong />
    </Group>
  );
}

export interface StudySessionProps {
  storageReady: boolean;
  globalStudy: boolean;
  subjectId: string;
  lectureId: string;
  subjects: readonly Subject[];
  catalog: readonly StudyCard[];
  visibleIds: ReadonlySet<string>;
  cards: readonly StudyCard[];
  log: readonly ReviewEvent[];
  studyLog: readonly ReviewEvent[];
  states: ReadonlyMap<string, Card>;
  limits: QueueLimits;
  previewAt: Date;
  now: number;
  retention: number;
  media: Record<string, string>;
  effectiveMotion: EffectiveMotion;
  streakDays: number;
  noteOverlayOpen: boolean;
  hasStorage: boolean;
  onAppendEvent: (event: ReviewEvent) => Promise<ReviewEvent[]>;
  onRemoveEvents: (ids: string[]) => Promise<ReviewEvent[]>;
  onStorageError: (message: string) => void;
  onOpenStudySheet: (target: { subjectId: string; lectureId?: string }) => void;
  onCompleteChange: (complete: boolean) => void;
}

export function StudySession({
  storageReady,
  globalStudy,
  subjectId,
  lectureId,
  subjects,
  catalog,
  visibleIds,
  cards,
  log,
  studyLog,
  states,
  limits,
  previewAt,
  now,
  retention,
  media,
  effectiveMotion,
  streakDays,
  noteOverlayOpen,
  hasStorage,
  onAppendEvent,
  onRemoveEvents,
  onStorageError,
  onOpenStudySheet,
  onCompleteChange,
}: StudySessionProps) {
  const [index, setIndex] = useState(0);
  const [revealedCardId, setRevealedCardId] = useState<string | null>(null);
  const [session, setSession] = useState<ReviewEvent[]>([]);
  const [started, setStarted] = useState(() => Date.now());
  const [cardStarted, setCardStarted] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [exitingCard, setExitingCard] = useState<ExitingCardState | null>(null);
  const [exitingBar, setExitingBar] = useState(false);
  const [overlapEnter, setOverlapEnter] = useState(false);
  const [swipeHint, setSwipeHint] = useState<SwipeHint>(null);

  const pendingWrite = useRef(false);
  const cardShellRef = useRef<HTMLDivElement>(null);
  const tintRef = useRef<HTMLDivElement>(null);
  const barTimerRef = useRef<number | null>(null);
  const finishTimerRef = useRef<number | null>(null);
  const ratingBtnRefs = useRef<Record<Rating, HTMLButtonElement | null>>({
    again: null,
    hard: null,
    good: null,
    easy: null,
  });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    startTime: number;
    locked: 'none' | 'gesture' | 'scroll';
  } | null>(null);

  useEffect(
    () => () => {
      if (barTimerRef.current) window.clearTimeout(barTimerRef.current);
      if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
    },
    [],
  );

  const routeSubject = globalStudy ? undefined : subjects.find((s) => s.id === subjectId);
  const routeLecture = routeSubject?.lectures.find((l) => l.id === lectureId);

  const card = storageReady ? cards[0] : undefined;
  const subject = subjects.find(
    (s) => s.id === (globalStudy ? (card?.subjectId ?? session.at(-1)?.subjectId) : subjectId),
  );
  const lecture = subject?.lectures.find((l) => l.id === (globalStudy ? card?.lessonId : lectureId));
  const studying = storageReady && (globalStudy || Boolean(subject));
  const revealed = Boolean(card && revealedCardId === card.cardId);

  const activeStudy = studying && Boolean(card);
  const outcome = sessionOutcome(studying, cards.length, session.length);
  const sessionComplete = outcome === 'complete';
  const caughtUp = outcome === 'caught-up';

  const nextAvailable = useMemo(
    () =>
      caughtUp
        ? nextAvailableAt(
            catalog.filter(
              (c) => globalStudy || (c.subjectId === subjectId && (lectureId === 'all' || c.lessonId === lectureId)),
            ),
            studyLog,
            new Date(now),
          )
        : null,
    [caughtUp, catalog, globalStudy, subjectId, lectureId, studyLog, now],
  );

  const revealCard = () => {
    if (!studying || !card || revealed) return;
    if (barTimerRef.current) window.clearTimeout(barTimerRef.current);
    setExitingBar(false);
    setRevealedCardId(card.cardId);
  };

  const rate = async (rating: Rating, startTransform?: string) => {
    if (!subject || !card || !revealed || pendingWrite.current || !hasStorage) return;
    const event = ratingEvent(
      card,
      rating,
      log,
      new Date(),
      Date.now() - cardStarted,
      retention,
      crypto.randomUUID(),
    );
    pendingWrite.current = true;
    setSaving(true);
    let nextLog: ReviewEvent[];
    try {
      nextLog = await onAppendEvent(event);
    } catch {
      onStorageError('Could not save your rating. Please try again.');
      setSaving(false);
      pendingWrite.current = false;
      return;
    }
    setSaving(false);
    pendingWrite.current = false;
    setSession((events) => [...events, event]);
    setRevealedCardId(null);
    setSwipeHint(null);

    if (barTimerRef.current) window.clearTimeout(barTimerRef.current);
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);

    const isLastCard =
      queue(
        catalog.filter(
          (c) => globalStudy || (c.subjectId === subjectId && (lectureId === 'all' || c.lessonId === lectureId)),
        ),
        nextLog.filter((e) => visibleIds.has(e.cardId)),
        new Date(),
        limits,
      ).length === 0;

    if (isLastCard) {
      onCompleteChange(true);
    }

    if (effectiveMotion === 'off') {
      setExitingCard(null);
      setExitingBar(false);
      setOverlapEnter(false);
      setIndex((i) => i + 1);
      setCardStarted(Date.now());
      window.scrollTo(0, 0);
      return;
    }

    animateButtonSpring(ratingBtnRefs.current[rating], effectiveMotion);

    setExitingBar(true);
    barTimerRef.current = window.setTimeout(
      () => setExitingBar(false),
      effectiveMotion === 'full' ? 155 : 125,
    );

    const snapshot: ExitingCardState = {
      key: Date.now(),
      card,
      cardNum: session.length + 1,
      totalCards: session.length + cards.length,
      rating,
      startTransform: startTransform || 'translate3d(0, 0, 0) rotate(0deg)',
    };

    if (isLastCard) {
      setExitingCard(snapshot);
      finishTimerRef.current = window.setTimeout(
        () => {
          setIndex((i) => i + 1);
          setExitingCard(null);
          setCardStarted(Date.now());
          window.scrollTo(0, 0);
        },
        effectiveMotion === 'full' ? 180 : 120,
      );
      return;
    }

    setExitingCard(snapshot);
    setOverlapEnter(true);
    setIndex((i) => i + 1);
    setCardStarted(Date.now());
    window.scrollTo(0, 0);
  };

  const restart = () => {
    setIndex(0);
    setRevealedCardId(null);
    setSession([]);
    setStarted(Date.now());
    setCardStarted(Date.now());
    setExitingCard(null);
    setExitingBar(false);
    setOverlapEnter(false);
    setSwipeHint(null);
    onCompleteChange(false);
    if (barTimerRef.current) window.clearTimeout(barTimerRef.current);
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
  };

  const undo = async () => {
    if (
      pendingWrite.current ||
      !session.length ||
      !hasStorage ||
      !log.some((e) => e.id === session.at(-1)?.id)
    ) {
      return;
    }
    pendingWrite.current = true;
    setSaving(true);
    try {
      await onRemoveEvents([session.at(-1)!.id]);
      setSession((prev) => prev.slice(0, -1));
      setIndex((i) => Math.max(0, i - 1));
      setRevealedCardId(null);
      setOverlapEnter(false);
      setExitingCard(null);
      setExitingBar(false);
      onCompleteChange(false);
    } catch {
      onStorageError('Could not undo. Please try again.');
    } finally {
      setSaving(false);
      pendingWrite.current = false;
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        noteOverlayOpen ||
        e.repeat ||
        (e.target instanceof HTMLElement &&
          e.target.closest('input,textarea,select,[contenteditable]'))
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void undo();
        return;
      }
      if (!studying || !card || e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (!revealed) revealCard();
      }
      const rating = (['again', 'hard', 'good', 'easy'] as Rating[])[Number(e.key) - 1];
      if (rating && revealed) {
        e.preventDefault();
        void rate(rating);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const onCardPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!revealed || e.button > 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.table-scroll, a, button, code')) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      startTime: performance.now(),
      locked: 'none',
    };
  };

  const onCardPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId || drag.locked === 'scroll') return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (drag.locked === 'none') {
      if (absX < 12 && absY < 12) return;
      if (dy > 0 && absY >= absX) {
        drag.locked = 'scroll';
        return;
      }
      if (dy < 0 && absY > absX && window.scrollY > 4) {
        drag.locked = 'scroll';
        return;
      }
      drag.locked = 'gesture';
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture failure.
      }
    }

    drag.dx = dx;
    drag.dy = dy;

    const shell = cardShellRef.current;
    const tint = tintRef.current;
    if (shell) {
      const rot = effectiveMotion === 'full' ? dx * 0.045 : 0;
      shell.style.transform = `translate3d(${dx}px, ${Math.min(24, dy)}px, 0) rotate(${rot}deg)`;
    }

    const isUp = dy < -28 && Math.abs(dy) > absX * 1.15;
    const rating: Rating | null = isUp ? 'easy' : dx < -22 ? 'again' : dx > 22 ? 'good' : null;
    const progress = isUp
      ? Math.min(1, Math.abs(dy) / 110)
      : Math.min(1, absX / 110);

    if (tint) {
      if (rating) {
        const bgVar =
          rating === 'again'
            ? 'var(--sem-red-bg)'
            : rating === 'good'
              ? 'var(--sem-yellow-bg)'
              : 'var(--sem-green-bg)';
        tint.style.background = bgVar;
        tint.style.opacity = String(progress * 0.9);
      } else {
        tint.style.opacity = '0';
      }
    }

    if (rating && progress > 0.28) {
      const label = rating === 'again' ? 'Again' : rating === 'good' ? 'Good' : 'Easy';
      setSwipeHint((prev) => (prev?.rating === rating ? prev : { label, rating }));
    } else {
      setSwipeHint((prev) => (prev ? null : prev));
    }
  };

  const endCardDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;

    if (drag.locked !== 'gesture') return;

    const elapsedMs = Math.max(16, performance.now() - drag.startTime);
    const vx = drag.dx / elapsedMs;
    const vy = drag.dy / elapsedMs;
    const shell = cardShellRef.current;
    const tint = tintRef.current;

    const commitEasy =
      drag.dy < -96 || (drag.dy < -42 && vy < -0.45 && Math.abs(drag.dy) > Math.abs(drag.dx));
    const commitAgain = !commitEasy && (drag.dx < -96 || (drag.dx < -40 && vx < -0.45));
    const commitGood = !commitEasy && (drag.dx > 96 || (drag.dx > 40 && vx > 0.45));

    const currentTransform = shell?.style.transform || 'translate3d(0, 0, 0) rotate(0deg)';
    if (tint) tint.style.opacity = '0';

    if (commitEasy || commitAgain || commitGood) {
      const nextRating: Rating = commitEasy ? 'easy' : commitAgain ? 'again' : 'good';
      void rate(nextRating, currentTransform);
      return;
    }

    setSwipeHint(null);
    if (shell) {
      if (effectiveMotion === 'full' && typeof shell.animate === 'function') {
        shell.animate(
          [
            { transform: currentTransform },
            { transform: 'translate3d(0, 0, 0) rotate(0deg)' },
          ],
          {
            duration: 280,
            easing: 'cubic-bezier(0.22, 1.18, 0.36, 1)',
          },
        );
      }
      shell.style.transform = '';
    }
  };

  const stats = sessionStats(
    log.filter((e) => session.some((review) => review.id === e.id)),
    session.length + cards.length,
  );
  const elapsed = formatElapsed(now - started);
  const canUndo =
    session.length > 0 &&
    hasStorage &&
    log.some((e) => e.id === session.at(-1)?.id);

  // Queue not ready yet: hold a stable study-shaped placeholder so we never flash
  // "Page not found", "All caught up", or an uninitialized card.
  if (!storageReady) {
    return (
      <div className="study-loading" aria-busy="true" aria-live="polite" data-study-state="loading">
        <div className="page-header-wrap study-page-head">
          <div className="page-head">
            <div className="study-placeholder-back" aria-hidden="true" />
            <h1 className="page-title">
              {!globalStudy && routeLecture
                ? routeLecture.title
                : !globalStudy && routeSubject
                  ? 'All lessons'
                  : 'Study'}
            </h1>
          </div>
        </div>
        <div className="study-layout">
          <div className="study-main">
            <div className="study-progress-mobile" aria-hidden="true">
              <div className="progress-meta">
                <span className="study-placeholder-line study-placeholder-sm" />
                <span className="study-placeholder-line study-placeholder-xs" />
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ transform: 'scaleX(0)' }} />
              </div>
            </div>
            <div className="card-deck">
              <section
                className="study-card study-card-placeholder"
                aria-label="Preparing study session"
              >
                <div className="card-meta" aria-hidden="true">
                  <span className="study-placeholder-line study-placeholder-xs" />
                  <span className="study-placeholder-line study-placeholder-xs" />
                </div>
                <div className="study-placeholder-body" aria-hidden="true">
                  <span className="study-placeholder-line study-placeholder-lg" />
                  <span className="study-placeholder-line study-placeholder-md" />
                </div>
                <div className="card-reveal-wrap" aria-hidden="true">
                  <span className="study-placeholder-btn" />
                </div>
              </section>
            </div>
          </div>
          <aside className="study-sidebar" aria-hidden="true">
            <div className="group study-sidebar-placeholder" />
          </aside>
        </div>
      </div>
    );
  }

  if (activeStudy && subject && card) {
    return (
      <>
        <PageHeader
          backHref={`#/subjects/${subject.id}`}
          backLabel={subject.name}
          title={lecture?.title || 'All lessons'}
          subtitle={subject.collectionLabel}
          trailing={
            <div className="study-head-actions">
              <Button
                variant="plain"
                onClick={() => onOpenStudySheet({ subjectId: subject.id, lectureId: lecture?.id })}
              >
                Study options
              </Button>
              <Button variant="plain" href={`#/catchup/${subject.id}/${lectureId || 'all'}`}>
                Catch up
              </Button>
            </div>
          }
          className="study-page-head"
        />

        <div className={`study-layout${revealed ? ' study-layout-has-mobile-bar' : ''}`}>
          <div className="study-main">
            <div className="study-progress-mobile" aria-label="Session progress">
              <div className="progress-meta">
                <span className="progress-meta-left">
                  {canUndo && (
                    <Button
                      variant="plain"
                      className="progress-undo-btn"
                      disabled={saving}
                      onClick={() => void undo()}
                    >
                      Undo
                    </Button>
                  )}
                  <span>
                    <AnimatedNumber value={stats.done} motion={effectiveMotion} /> /{' '}
                    {session.length + cards.length} done
                  </span>
                </span>
                <span>
                  {stats.done > 0 && (
                    <>
                      <AnimatedNumber value={stats.accuracy} motion={effectiveMotion} suffix="%" />{' '}
                      ·{' '}
                    </>
                  )}
                  {elapsed}
                </span>
              </div>
              <div className="progress-track" aria-hidden="true">
                <div
                  className="progress-fill"
                  style={{
                    transform: `scaleX(${cards.length ? Math.min(1, stats.done / (session.length + cards.length)) : 0})`,
                  }}
                />
              </div>
            </div>

            <div className="card-deck">
              {exitingCard && (
                <ExitingCardOverlay
                  key={exitingCard.key}
                  exiting={exitingCard}
                  media={media}
                  motion={effectiveMotion}
                  onDone={() => setExitingCard(null)}
                />
              )}
              <div
                key={index}
                ref={cardShellRef}
                className={`card-shell${overlapEnter ? ' card-shell-overlap' : ''}`}
                style={
                  exitingCard && cards.length === 0 && !revealed ? { visibility: 'hidden' } : undefined
                }
                onPointerDown={onCardPointerDown}
                onPointerMove={onCardPointerMove}
                onPointerUp={endCardDrag}
                onPointerCancel={endCardDrag}
              >
                <div
                  className={`card-stage${revealed ? ' is-flipped' : ''}`}
                  onClick={(e) => {
                    if (!revealed && !(e.target as HTMLElement).closest('a, button')) {
                      revealCard();
                    }
                  }}
                >
                  <div className="card-flipper">
                    <section
                      className="study-card card-face card-face-front"
                      aria-label="Flashcard question"
                      aria-hidden={revealed}
                    >
                      <div className="card-meta">
                        <span>Question</span>
                        <span>
                          {session.length + 1} of {session.length + cards.length}
                        </span>
                      </div>
                      <div className="card-question">
                        <CardContent card={card} side="front" media={media} />
                      </div>
                      <div className="card-reveal-wrap">
                        <Button variant="primary" size="full" onClick={revealCard}>
                          Show answer
                        </Button>
                      </div>
                    </section>

                    {revealed && (
                      <section
                        className="study-card card-face card-face-back"
                        aria-label="Flashcard answer"
                      >
                        <div ref={tintRef} className="swipe-tint" aria-hidden="true" />
                        {swipeHint && (
                          <span
                            className={`swipe-badge swipe-badge-${swipeHint.rating}`}
                            aria-hidden="true"
                          >
                            {swipeHint.label}
                          </span>
                        )}
                        <div className="card-meta">
                          <span>Question</span>
                          <span>
                            {session.length + 1} of {session.length + cards.length}
                          </span>
                        </div>
                        <div className="card-question">
                          <CardContent card={card} side="front" media={media} />
                        </div>
                        <div className="card-answer">
                          <p className="card-answer-label">Answer</p>
                          <CardContent card={card} side="back" media={media} />
                        </div>
                      </section>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {(revealed || exitingBar) && (
              <div
                className={`ratings-bar${exitingBar && !revealed ? ' ratings-bar-exiting' : ''}`}
                role="group"
                aria-label="Rate your recall"
                aria-hidden={!revealed}
              >
                <div className="ratings-grid">
                  {RATINGS.map(({ key, label }) => (
                    <button
                      key={key}
                      ref={(el) => {
                        ratingBtnRefs.current[key] = el;
                      }}
                      type="button"
                      className={`rating-btn rating-${key}`}
                      disabled={!revealed || saving}
                      onClick={() => void rate(key)}
                    >
                      {label}
                      <small className="rating-interval">
                        {intervalLabel(
                          schedule(states.get(card.cardId), key, previewAt, retention),
                          previewAt,
                        )}
                      </small>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="study-hint">
              {states.get(card.cardId) && isLeech(states.get(card.cardId)!) ? 'leech · ' : ''}
              {revealed ? 'Press 1–4 to rate' : 'Press Space to show answer'}
            </p>
          </div>

          <aside className="study-sidebar" aria-label="Session stats">
            <SessionStatsGroup
              stats={stats}
              totalCards={session.length + cards.length}
              elapsed={elapsed}
              motion={effectiveMotion}
              showHeader
            />
            {canUndo && (
              <div className="sidebar-undo-wrap">
                <Button
                  variant="plain"
                  className="sidebar-undo-btn"
                  disabled={saving}
                  onClick={() => void undo()}
                >
                  Undo last rating
                </Button>
              </div>
            )}
          </aside>
        </div>
      </>
    );
  }

  if (caughtUp) {
    return (
      <Group divider={false} ariaLabel="Study queue empty" className="caught-up">
        <h1 className="page-title">All caught up</h1>
        <p className="caught-up-sub">
          {nextAvailable
            ? `Next available ${nextAvailable.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.`
            : 'There are no cards waiting in this lesson.'}
        </p>
        <div className="caught-up-actions">
          {subject && (
            <Button
              variant="primary"
              onClick={() => onOpenStudySheet({ subjectId: subject.id, lectureId: lecture?.id })}
            >
              Study options
            </Button>
          )}
          <Button variant="secondary" href={subject ? `#/subjects/${subject.id}` : '#/subjects'}>
            Back to subjects
          </Button>
        </div>
      </Group>
    );
  }

  if (sessionComplete) {
    return (
      <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-labelledby="complete-title">
        <section className="complete-sheet">
          <ConfettiBurst active motion={effectiveMotion} />
          <div className="sheet-handle" aria-hidden="true" />

          <div className="complete-head">
            <AccuracyRing
              percent={stats.accuracy}
              hasData={stats.done > 0}
              size={88}
              strokeWidth={7}
              motion={effectiveMotion}
            />
            <h1 id="complete-title" className="complete-title">
              Session complete
            </h1>
            {subject && (
              <p className="page-sub">
                {subject.name}
                {subject.collectionLabel ? ` · ${subject.collectionLabel}` : ''} ·{' '}
                {lecture?.title || 'All lessons'}
              </p>
            )}
          </div>

          <Group as="div" ariaLabel="Session summary">
            <Row
              title="Cards done"
              value={<AnimatedNumber value={stats.done} motion={effectiveMotion} />}
              valueStrong
            />
            <Row title="Time" value={elapsed} valueStrong />
            <Row
              title="Streak"
              value={
                <span className="streak-value">
                  <FlameIcon size={16} className="streak-flame" />
                  <AnimatedNumber value={streakDays} motion={effectiveMotion} />{' '}
                  {streakDays === 1 ? 'day' : 'days'}
                </span>
              }
              valueStrong
            />
          </Group>

          <div className="complete-actions">
            <Button variant="primary" size="full" href="#/subjects">
              Done
            </Button>
            <Button variant="secondary" size="full" onClick={restart}>
              Study again
            </Button>
            <div className="complete-links">
              {canUndo && (
                <>
                  <Button variant="plain" disabled={saving} onClick={() => void undo()}>
                    Undo last rating
                  </Button>
                  <span className="complete-links-sep" aria-hidden="true">
                    ·
                  </span>
                </>
              )}
              <Button variant="plain" href="#/calendar">
                View calendar
              </Button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="section-stack">
      <PageHeader title="Page not found" />
      <div>
        <Button variant="secondary" href="#/subjects">
          Browse subjects
        </Button>
      </div>
    </div>
  );
}
