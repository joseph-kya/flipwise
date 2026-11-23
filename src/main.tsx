import { queue, queueCounts, ratingEvent, replay, schedule, intervalLabel, isLeech } from './scheduler';
import { openReviewStorage, type LogStorage } from './reviewStorage';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { subjects, type DemoCard, type Subject, type Lecture } from './demoSubjects';
import './style.css';
import {
  type ReviewEvent,
  type Rating,
} from './reviewLog';
import { mastery } from './mastery';
import { sessionStats } from './sessionStats';
import { aggregateByDay, streak, toStudyDateKey } from './calendar/dailyStats';
import { CalendarPage } from './calendar/CalendarPage';
import { buildDefaultCatalog, computeInsights, type RangeKey, type SubjectFilter } from './insights/aggregate';
import { InsightDetailPage, isValidChartId } from './insights/InsightDetailPage';
import { InsightsView } from './insights/InsightsView';
import { markDemoCleared, seedDemoHistoryIfEmpty } from './insights/seedDemoHistory';
import { Markdown } from './markdown';
import { AppearancePage } from './AppearancePage';
import {
  applyAppearance,
  loadSettings,
  saveSettings,
  type AppearanceSettings,
  type EffectiveMotion,
} from './settings';
import {
  AccuracyRing,
  AnimatedNumber,
  ConfettiBurst,
  animateButtonSpring,
  animateCardExit,
} from './motion';
import {
  CalendarTabIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FlameIcon,
  SUBJECT_DESCRIPTIONS,
  SegmentedControl,
  SettingsTabIcon,
  SubjectIcon,
  SubjectsTabIcon,
  TodayTabIcon,
} from './ui';

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
}: {
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
          <Markdown text={exiting.card.front} />
        </div>
        <div className="card-answer">
          <p className="card-answer-label">Answer</p>
          <Markdown text={exiting.card.back} />
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

function formatTodayLabel(): string {
  const today = new Date();
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(today);
  const dateLine = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' }).format(today);
  return `${weekday}, ${dateLine}`;
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
    <div className="group group-divider">
      {showHeader && (
        <div className="group-row session-head-row">
          <div className="row-main">
            <h2 className="section-title" style={{ fontSize: 'var(--text-sm)', color: 'var(--label)' }}>
              Session
            </h2>
            <span className="row-sub tabular">
              <AnimatedNumber value={stats.done} motion={motion} /> / {totalCards} cards
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
      <div className="group-row">
        <span className="row-main">
          <span className="row-title" style={{ fontSize: 'var(--text-sm)', fontWeight: 400 }}>
            Done
          </span>
        </span>
        <span className="row-value row-value-strong">
          <AnimatedNumber value={stats.done} motion={motion} /> / {totalCards}
        </span>
      </div>
      <div className="group-row">
        <span className="row-main">
          <span className="row-title" style={{ fontSize: 'var(--text-sm)', fontWeight: 400 }}>
            Remaining
          </span>
        </span>
        <span className="row-value row-value-strong">
          <AnimatedNumber value={stats.remaining} motion={motion} />
        </span>
      </div>
      <div className="group-row">
        <span className="row-main">
          <span className="row-title" style={{ fontSize: 'var(--text-sm)', fontWeight: 400 }}>
            Correct
          </span>
        </span>
        <span className="row-value row-value-strong">
          <AnimatedNumber value={stats.right} motion={motion} />
        </span>
      </div>
      <div className="group-row">
        <span className="row-main">
          <span className="row-title" style={{ fontSize: 'var(--text-sm)', fontWeight: 400 }}>
            Hard
          </span>
        </span>
        <span className="row-value row-value-strong">
          <AnimatedNumber value={stats.hard} motion={motion} />
        </span>
      </div>
      <div className="group-row">
        <span className="row-main">
          <span className="row-title" style={{ fontSize: 'var(--text-sm)', fontWeight: 400 }}>
            Again
          </span>
        </span>
        <span className="row-value row-value-strong">
          <AnimatedNumber value={stats.again} motion={motion} />
        </span>
      </div>
      <div className="group-row">
        <span className="row-main">
          <span className="row-title" style={{ fontSize: 'var(--text-sm)', fontWeight: 400 }}>
            Accuracy
          </span>
        </span>
        <span className="row-value row-value-strong">
          {stats.done > 0 ? <AnimatedNumber value={stats.accuracy} motion={motion} suffix="%" /> : '—'}
        </span>
      </div>
      <div className="group-row">
        <span className="row-main">
          <span className="row-title" style={{ fontSize: 'var(--text-sm)', fontWeight: 400 }}>
            Time
          </span>
        </span>
        <span className="row-value row-value-strong">{elapsed}</span>
      </div>
    </div>
  );
}

function LessonRows({
  subject,
  log,
  animateDots = false,
  stagger = false,
}: {
  subject: Subject;
  log: readonly ReviewEvent[];
  animateDots?: boolean;
  stagger?: boolean;
}) {
  return (
    <>
      {subject.lectures.map((lecture: Lecture, i: number) => {
        const knowledge = mastery(
          log as ReviewEvent[],
          subject.id,
          lecture.id,
          lecture.cards.map((c) => `${subject.id}/${lecture.id}/${c.id}`),
        );
        const level = knowledge.label.toLowerCase().replace(' ', '-');

        return (
          <a
            key={lecture.id}
            className={`lesson-row${stagger ? ' stagger-item' : ''}`}
            style={{ '--i': Math.min(i, 7) } as CSSProperties}
            href={`#/study/${subject.id}/${lecture.id}`}
          >
            <span
              className={`mastery-indicator mastery-${level}${animateDots ? ' dot-pop' : ''}`}
              style={{ '--i': Math.min(i, 7) } as CSSProperties}
              aria-hidden="true"
            />
            <span className="lesson-title">{lecture.title}</span>
            <span className="lesson-meta">
              <span>{knowledge.label}</span>
              <span>{lecture.cards.length}</span>
              <ChevronRight size={14} className="row-chevron" />
            </span>
          </a>
        );
      })}
    </>
  );
}

function SubjectGroup({ log }: { log: readonly ReviewEvent[] }) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  const [freshOpenId, setFreshOpenId] = useState<string | null>(null);
  const seenOpenRef = useRef<Set<string>>(new Set());

  const toggleSubject = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (!seenOpenRef.current.has(id)) {
          seenOpenRef.current.add(id);
          setFreshOpenId(id);
        }
      }
      return next;
    });
  };

  return (
    <div className="group group-divider group-icons">
      {subjects.map((s, i) => {
        const isOpen = openIds.has(s.id);
        const panelId = `lessons-${s.id}`;
        return (
          <div
            key={s.id}
            className={`subject-details stagger-item${isOpen ? ' is-open' : ''}`}
            style={{ '--i': Math.min(i, 7) } as CSSProperties}
          >
            <button
              type="button"
              className="group-row group-row-interactive subject-trigger"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => toggleSubject(s.id)}
            >
              <span className="subject-tile">
                <SubjectIcon subjectId={s.id} />
              </span>
              <span className="row-main">
                <span className="row-title">{s.name}</span>
                <span className="row-sub">{SUBJECT_DESCRIPTIONS[s.id]}</span>
              </span>
              <span className="row-value">{s.total} cards</span>
              <ChevronDown size={16} className="row-chevron subject-chevron" />
            </button>
            <div id={panelId} className="accordion-shell" aria-hidden={!isOpen}>
              <div className="accordion-inner">
                <div className="lesson-list">
                  <LessonRows subject={s} log={log} animateDots={freshOpenId === s.id && isOpen} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function App() {
  const [hash, setHash] = useState(location.hash || '#/');
  const [settings, setSettings] = useState<AppearanceSettings>(() => loadSettings());
  const [osReducedMotion, setOsReducedMotion] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );
  const effectiveMotion: EffectiveMotion = useMemo(
    () => applyAppearance(settings, osReducedMotion),
    [settings, osReducedMotion],
  );

  const [index, setIndex] = useState(0);
  const [log, setLog] = useState<ReviewEvent[]>([]);
  const storageRef = useRef<LogStorage | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [storageNotice, setStorageNotice] = useState('');
  const pendingWrite = useRef(false);
  const [saving, setSaving] = useState(false);
  const [insightsRange, setInsightsRange] = useState<RangeKey>('90d');
  const [insightsSubject, setInsightsSubject] = useState<SubjectFilter>('all');
  const insightsCatalog = useMemo(() => buildDefaultCatalog(), []);

  useEffect(() => {
    void openReviewStorage()
      .then(async ({ storage, fallback }) => {
        storageRef.current = storage;
        const loaded = await storage.read();
        const { events: initialEvents, seeded } = seedDemoHistoryIfEmpty(
          loaded,
          new Date(),
          settings.retention,
        );
        if (seeded) {
          try {
            await storage.write(initialEvents);
          } catch {
            // Keep seeded demo events in memory if persistence fails.
          }
        }
        setLog(initialEvents);
        setStorageReady(true);
        if (fallback) {
          setStorageNotice('Using local browser storage because IndexedDB is unavailable.');
        }
      })
      .catch(() => setStorageNotice('Study storage is unavailable. Please reload before studying.'));
  }, []);
  const [session, setSession] = useState<ReviewEvent[]>([]);
  const [started, setStarted] = useState(Date.now());
  const [cardStarted, setCardStarted] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [exitingCard, setExitingCard] = useState<ExitingCardState | null>(null);
  const [exitingBar, setExitingBar] = useState(false);
  const [overlapEnter, setOverlapEnter] = useState(false);
  const [swipeHint, setSwipeHint] = useState<SwipeHint>(null);

  const cardShellRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const tintRef = useRef<HTMLDivElement>(null);
  const prevStageHeightRef = useRef<number | null>(null);
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

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const onChange = (e: MediaQueryListEvent) => setOsReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const updateSettings = (patch: Partial<AppearanceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const motionRef = useRef(effectiveMotion);
  motionRef.current = effectiveMotion;

  useEffect(() => {
    const onHashChange = () => {
      const nextHash = location.hash || '#/';
      if (nextHash === hash) return;
      const prevRoute = hash.split('/').slice(0, 3).join('/');
      const nextRoute = nextHash.split('/').slice(0, 3).join('/');
      const isCardRevealToggle = prevRoute === nextRoute && nextHash.startsWith('#/study/');

      if (
        !isCardRevealToggle &&
        motionRef.current === 'full' &&
        typeof document !== 'undefined' &&
        'startViewTransition' in document &&
        typeof document.startViewTransition === 'function'
      ) {
        try {
          document.startViewTransition(() => {
            flushSync(() => setHash(nextHash));
          });
          return;
        } catch {
          // Fallback to plain state update.
        }
      }
      setHash(nextHash);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [hash]);

  const parts = hash.replace(/^#\//, '').split('/');
  const catalog = useMemo(() => subjects.flatMap(s => s.lectures.flatMap((l, li) => l.cards.map((c, ci) => ({...c, cardId: `${s.id}/${l.id}/${c.id}`, subjectId: s.id, lessonId: l.id, queuePosition: li*1000+ci})))), []);
  const globalStudy = parts[1] === 'global';
  const available = queue(catalog.filter(c => globalStudy || c.subjectId === parts[1] && (parts[2] === 'all' || c.lessonId === parts[2])), log, new Date(now));
  const cards = storageReady ? available : [];
  const card = cards[0];
  const subject = subjects.find(s => s.id === (globalStudy ? card?.subjectId ?? session.at(-1)?.subjectId : parts[1]));
  const lecture = subject?.lectures.find(l => l.id === (globalStudy ? card?.lessonId : parts[2]));
  const studying = parts[0] === 'study' && storageReady && (globalStudy || Boolean(subject));
  const revealed = parts[3] === 'answer';
  const studyUrl = `#/study/${parts[1]}/${parts[2]}`;
  const states = replay(log);
  const previewAt = new Date(now);
  const todayCounts = queueCounts(queue(catalog, log, previewAt), log);

  useEffect(() => {
    setIndex(0);
    setSession([]);
    setStarted(Date.now());
    setCardStarted(Date.now());
    setExitingCard(null);
    setExitingBar(false);
    setOverlapEnter(false);
    setSwipeHint(null);
    prevStageHeightRef.current = null;
    if (barTimerRef.current) window.clearTimeout(barTimerRef.current);
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
  }, [parts[1], parts[2]]);

  // Smooth height adaptation during 3D card flip without clipping long answers
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const prevHeight = prevStageHeightRef.current;
    const nextHeight = stage.getBoundingClientRect().height;
    prevStageHeightRef.current = nextHeight;

    if (
      prevHeight !== null &&
      effectiveMotion === 'full' &&
      Math.abs(nextHeight - prevHeight) > 4 &&
      typeof stage.animate === 'function'
    ) {
      stage.animate(
        [{ height: `${prevHeight}px` }, { height: `${nextHeight}px` }],
        {
          duration: 340,
          easing: 'cubic-bezier(0.22, 1.08, 0.36, 1)',
        },
      );
    }
  }, [revealed, index, effectiveMotion]);

  const revealCard = () => {
    if (!studying || !card || revealed) return;
    if (barTimerRef.current) window.clearTimeout(barTimerRef.current);
    setExitingBar(false);
    if (stageRef.current) {
      prevStageHeightRef.current = stageRef.current.getBoundingClientRect().height;
    }
    const nextHash = `${studyUrl}/answer`;
    setHash(nextHash);
    location.hash = nextHash;
  };

  const rate = async (rating: Rating, startTransform?: string) => {
    if (!subject || !card || !revealed || pendingWrite.current || !storageRef.current) return;
    const event = ratingEvent(card, rating, log, new Date(), Date.now() - cardStarted, settings.retention, crypto.randomUUID());
    pendingWrite.current = true;
    setSaving(true);
    const nextLog = [...log, event];
    try { await storageRef.current.write(nextLog); } catch { setStorageNotice('Could not save your rating. Please try again.'); setSaving(false); pendingWrite.current = false; return; }
    setLog(nextLog); setSaving(false); pendingWrite.current = false;
    setSession((events) => [...events, event]);
    setSwipeHint(null);
    prevStageHeightRef.current = null;

    if (barTimerRef.current) window.clearTimeout(barTimerRef.current);
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);

    const isLastCard = queue(catalog.filter(c => globalStudy || c.subjectId === parts[1] && (parts[2] === 'all' || c.lessonId === parts[2])), nextLog, new Date()).length === 0;

    // Motion Off: instant swap, zero WAAPI, zero CSS animations
    if (effectiveMotion === 'off') {
      setExitingCard(null);
      setExitingBar(false);
      setOverlapEnter(false);
      setIndex((i) => i + 1);
      setCardStarted(Date.now());
      setHash(studyUrl);
      location.hash = studyUrl;
      window.scrollTo(0, 0);
      return;
    }

    animateButtonSpring(ratingBtnRefs.current[rating], effectiveMotion);

    // Dismiss rating bar immediately while card exits
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
      // Let final card exit cleanly before celebration sheet rises
      setExitingCard(snapshot);
      setHash(studyUrl);
      location.hash = studyUrl;
      finishTimerRef.current = window.setTimeout(() => {
        setIndex((i) => i + 1);
        setExitingCard(null);
        setCardStarted(Date.now());
        window.scrollTo(0, 0);
      }, effectiveMotion === 'full' ? 180 : 120);
      return;
    }

    // Overlap: outgoing card exits on top while next card mounts and begins entering at ~55% of exit
    setExitingCard(snapshot);
    setOverlapEnter(true);
    setIndex((i) => i + 1);
    setCardStarted(Date.now());
    setHash(studyUrl);
    location.hash = studyUrl;
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        !studying ||
        !card ||
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (e.target instanceof HTMLElement &&
          e.target.closest('input,textarea,select,[contenteditable]'))
      ) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (!revealed) revealCard();
      }
      const rating = (['again', 'hard', 'good', 'easy'] as Rating[])[Number(e.key) - 1];
      if (rating && revealed) {
        e.preventDefault();
        rate(rating);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Swipe gestures on revealed study card (left = Again, right = Good, up = Easy)
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
      // Preserve normal vertical scrolling (downward drag or downward-biased vertical move)
      if (dy > 0 && absY >= absX) {
        drag.locked = 'scroll';
        return;
      }
      // Only lock upward swipe if user is already at top of scroll and dragging steeply up
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

    const commitEasy = drag.dy < -96 || (drag.dy < -42 && vy < -0.45 && Math.abs(drag.dy) > Math.abs(drag.dx));
    const commitAgain = !commitEasy && (drag.dx < -96 || (drag.dx < -40 && vx < -0.45));
    const commitGood = !commitEasy && (drag.dx > 96 || (drag.dx > 40 && vx > 0.45));

    const currentTransform = shell?.style.transform || 'translate3d(0, 0, 0) rotate(0deg)';
    if (tint) tint.style.opacity = '0';

    if (commitEasy || commitAgain || commitGood) {
      const nextRating: Rating = commitEasy ? 'easy' : commitAgain ? 'again' : 'good';
      rate(nextRating, currentTransform);
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

  const streakStats = useMemo(
    () => streak(aggregateByDay(log), toStudyDateKey(new Date(now))),
    [log, now],
  );

  const demoReviewCount = useMemo(
    () => log.reduce((sum, e) => sum + (e.demo ? 1 : 0), 0),
    [log],
  );

  const clearDemoHistory = async () => {
    markDemoCleared(true);
    const cleaned = log.filter((e) => !e.demo);
    setLog(cleaned);
    if (storageRef.current) {
      try {
        await storageRef.current.write(cleaned);
      } catch {
        setStorageNotice('Could not clear demo history. Please try again.');
      }
    }
  };

  const insightsData = useMemo(() => {
    if (parts[0] !== 'insights') return null;
    return computeInsights(log, insightsCatalog, {
      range: insightsRange,
      subjectId: insightsSubject,
      targetRetention: settings.retention,
    });
  }, [parts[0], log, insightsCatalog, insightsRange, insightsSubject, settings.retention]);

  const calendarModeControl = (
    <div className="cal-mode-switch">
      <SegmentedControl
        ariaLabel="Calendar or Insights"
        options={[
          { value: 'calendar', label: 'Calendar' },
          { value: 'insights', label: 'Insights' },
        ]}
        value={parts[0] === 'insights' ? 'insights' : 'calendar'}
        onChange={(next) => {
          const target = next === 'insights' ? '#/insights' : '#/calendar';
          if (location.hash !== target) {
            location.hash = target;
          }
        }}
      />
    </div>
  );

  const restart = () => {
    setIndex(0);
    setSession([]);
    setStarted(Date.now());
    setCardStarted(Date.now());
    setExitingCard(null);
    setExitingBar(false);
    setOverlapEnter(false);
    setSwipeHint(null);
    prevStageHeightRef.current = null;
    if (barTimerRef.current) window.clearTimeout(barTimerRef.current);
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);
    setHash(studyUrl);
    location.hash = studyUrl;
  };

  const undo = async () => {
    if (pendingWrite.current || !session.length || !storageRef.current || log.at(-1)?.id !== session.at(-1)?.id) return;
    pendingWrite.current = true; setSaving(true);
    try { const next=log.slice(0,-1); await storageRef.current.write(next); setLog(next); setSession(session.slice(0,-1)); setIndex(Math.max(0,index-1)); location.hash=studyUrl; setHash(studyUrl); }
    catch { setStorageNotice('Could not undo. Please try again.'); }
    finally { setSaving(false); pendingWrite.current = false; }
  };
  useEffect(() => { const handler=(e: KeyboardEvent)=>{ if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='z' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); void undo(); } }; window.addEventListener('keydown',handler); return ()=>window.removeEventListener('keydown',handler); });
  const activeStudy = studying && Boolean(card);
  const sessionComplete = studying && !card;
  const hasMobileRatingBar = activeStudy && revealed;
  const showTabBar = !activeStudy && !sessionComplete;

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="#/">
            Flipwise
          </a>
          <nav className="nav" aria-label="Main navigation">
            <a
              className="nav-link"
              href="#/"
              aria-current={parts[0] === '' ? 'page' : undefined}
            >
              Today
            </a>
            <a
              className="nav-link"
              href="#/subjects"
              aria-current={parts[0] === 'subjects' ? 'page' : undefined}
            >
              Subjects
            </a>
            <a
              className="nav-link"
              href="#/calendar"
              aria-current={parts[0] === 'calendar' || parts[0] === 'insights' ? 'page' : undefined}
            >
              Calendar
            </a>
            <a
              className="icon-btn nav-settings-btn"
              href="#/settings"
              aria-label="Appearance settings"
              aria-current={parts[0] === 'settings' ? 'page' : undefined}
            >
              <SettingsTabIcon size={20} />
            </a>
          </nav>
        </div>
      </header>

      {storageNotice && <p role="status" className="study-hint">{storageNotice}</p>}
      {session.length > 0 && <button className="btn btn-plain" onClick={() => void undo()}>Undo last rating</button>}
      <main
        id="main"
        className={`main${hasMobileRatingBar ? ' main-has-mobile-bar' : ''}`}
      >
        {parts[0] === '' ? (
          <div className="section-stack">
            <div className="page-head" style={{ marginBottom: 0 }}>
              <p className="page-eyebrow">{formatTodayLabel()}</p>
              <h1 className="page-title">Today</h1>
            </div>

            <section aria-label="Due summary">
              <div className="group">
                <div className="due-row">
                  <div>
                    <div className="due-figure">{todayCounts.total}</div>
                    <div className="due-label">Cards available</div>
                    <div className="due-label">{todayCounts.new} new · {todayCounts.review} review · {todayCounts.learning} learning</div>
                  </div>
                  <a className="btn btn-primary" href="#/study/global/all">
                    Study
                  </a>
                </div>
              </div>
            </section>

            <section aria-label="Subjects">
              <div className="section-head">
                <h2 className="section-title">Subjects</h2>
                <a className="btn btn-plain" style={{ minHeight: 'auto' }} href="#/subjects">
                  See all
                </a>
              </div>
              <SubjectGroup log={log} />
            </section>
          </div>
        ) : parts[0] === 'subjects' && !parts[1] ? (
          <div className="section-stack">
            <div className="page-head" style={{ marginBottom: 0 }}>
              <h1 className="page-title">Subjects</h1>
            </div>
            <SubjectGroup log={log} />
          </div>
        ) : parts[0] === 'subjects' && subject ? (
          <div className="section-stack">
            <div>
              <a className="back-link" href="#/subjects">
                <ChevronLeft size={16} />
                Subjects
              </a>
              <div className="page-head" style={{ marginBottom: 0 }}>
                <h1 className="page-title">{subject.name}</h1>
                <p className="page-sub tabular">
                  {subject.total} cards · {subject.lectures.length} lessons
                </p>
              </div>
            </div>

            <div className="group">
              <div className="due-row">
                <div>
                  <div className="row-title">All lessons</div>
                  <div className="row-sub tabular">
                    {subject.lectures.reduce((sum, l) => sum + l.cards.length, 0)} cards in queue
                  </div>
                </div>
                <a
                  className="btn btn-primary"
                  href={`#/study/${subject.id}/all`}
                  onClick={() => setIndex(0)}
                >
                  Study all
                </a>
              </div>
            </div>

            <section aria-label="Lessons">
              <div className="section-head">
                <h2 className="section-title">Lessons</h2>
              </div>
              <div className="group group-lessons">
                <LessonRows subject={subject} log={log} stagger />
              </div>
            </section>
          </div>
        ) : activeStudy && subject ? (
          <>
            <a className="back-link" href={`#/subjects/${subject.id}`}>
              <ChevronLeft size={16} />
              {subject.name}
            </a>
            <div className="page-head">
              <h1 className="page-title">{lecture?.title || 'All lessons'}</h1>
            </div>

            <div className="study-layout">
              <div className="study-main">
                <div className="study-progress-mobile" aria-label="Session progress">
                  <div className="progress-meta">
                    <span>
                      <AnimatedNumber value={stats.done} motion={effectiveMotion} /> / {session.length + cards.length} done
                    </span>
                    <span>
                      {stats.done > 0 && (
                        <>
                          <AnimatedNumber value={stats.accuracy} motion={effectiveMotion} suffix="%" /> ·{' '}
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
                      motion={effectiveMotion}
                      onDone={() => setExitingCard(null)}
                    />
                  )}
                  <div
                    key={index}
                    ref={cardShellRef}
                    className={`card-shell${overlapEnter ? ' card-shell-overlap' : ''}`}
                    style={exitingCard && cards.length === 0 && !revealed ? { visibility: 'hidden' } : undefined}
                    onPointerDown={onCardPointerDown}
                    onPointerMove={onCardPointerMove}
                    onPointerUp={endCardDrag}
                    onPointerCancel={endCardDrag}
                  >
                    <div
                      ref={stageRef}
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
                          <div className="card-meta card-stagger" style={{ '--i': 0 } as CSSProperties}>
                            <span>Question</span>
                            <span>
                              {session.length + 1} of {session.length + cards.length}
                            </span>
                          </div>
                          <div className="card-question card-stagger" style={{ '--i': 1 } as CSSProperties}>
                            <Markdown text={card.front} />
                          </div>
                          <div className="card-reveal-wrap card-stagger" style={{ '--i': 2 } as CSSProperties}>
                            <a
                              className="btn btn-primary btn-full"
                              href={`${studyUrl}/answer`}
                              onClick={(e) => {
                                e.preventDefault();
                                revealCard();
                              }}
                            >
                              Show answer
                            </a>
                          </div>
                        </section>

                        <section
                          className="study-card card-face card-face-back"
                          aria-label="Flashcard answer"
                          aria-hidden={!revealed}
                        >
                          <div ref={tintRef} className="swipe-tint" aria-hidden="true" />
                          {swipeHint && (
                            <span className={`swipe-badge swipe-badge-${swipeHint.rating}`} aria-hidden="true">
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
                            <Markdown text={card.front} />
                          </div>
                          <div className="card-answer">
                            <p className="card-answer-label">Answer</p>
                            <Markdown text={card.back} />
                          </div>
                        </section>
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
                          onClick={() => rate(key)}
                        >
                          {label}<small className="rating-interval">{intervalLabel(schedule(states.get(card.cardId), key, previewAt, settings.retention), previewAt)}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <p className="study-hint">
                  {states.get(card.cardId) && isLeech(states.get(card.cardId)!) ? 'leech · ' : ''}{revealed ? 'Press 1–4 to rate' : 'Press Space to show answer'}
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
              </aside>
            </div>
          </>
        ) : sessionComplete ? (
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
                <h1 id="complete-title" className="page-title" style={{ fontSize: 'var(--text-lg)' }}>
                  Session complete
                </h1>
                {subject && (
                  <p className="page-sub">
                    {subject.name} · {lecture?.title || 'All lessons'}
                  </p>
                )}
              </div>

              <div className="group group-divider">
                <div className="group-row">
                  <span className="row-main">
                    <span className="row-title" style={{ fontSize: 'var(--text-sm)', fontWeight: 400 }}>
                      Cards done
                    </span>
                  </span>
                  <span className="row-value row-value-strong">
                    <AnimatedNumber value={stats.done} motion={effectiveMotion} />
                  </span>
                </div>
                <div className="group-row">
                  <span className="row-main">
                    <span className="row-title" style={{ fontSize: 'var(--text-sm)', fontWeight: 400 }}>
                      Time
                    </span>
                  </span>
                  <span className="row-value row-value-strong">{elapsed}</span>
                </div>
                <div className="group-row">
                  <span className="row-main">
                    <span className="row-title" style={{ fontSize: 'var(--text-sm)', fontWeight: 400 }}>
                      Streak
                    </span>
                  </span>
                  <span className="row-value row-value-strong streak-value">
                    <FlameIcon size={16} className="streak-flame" />
                    <AnimatedNumber value={streakStats.current} motion={effectiveMotion} />{' '}
                    {streakStats.current === 1 ? 'day' : 'days'}
                  </span>
                </div>
              </div>

              <div className="complete-actions">
                <button type="button" className="btn btn-secondary" onClick={restart}>
                  Study again
                </button>
                <a className="btn btn-primary" href="#/subjects">
                  Done
                </a>
              </div>

              <div style={{ textAlign: 'center' }}>
                <a className="btn btn-plain" href="#/calendar">
                  View calendar
                </a>
              </div>
            </section>
          </div>
        ) : parts[0] === 'calendar' ? (
          <CalendarPage
            events={log}
            motion={effectiveMotion}
            headerAccessory={calendarModeControl}
          />
        ) : parts[0] === 'insights' && !parts[1] && insightsData ? (
          <div className="section-stack">
            <div className="page-head page-head-split" style={{ marginBottom: 0 }}>
              <h1 className="page-title">Insights</h1>
              {calendarModeControl}
            </div>
            <InsightsView
              data={insightsData}
              range={insightsRange}
              subjectId={insightsSubject}
              motion={effectiveMotion}
              onRangeChange={setInsightsRange}
              onSubjectChange={setInsightsSubject}
            />
          </div>
        ) : parts[0] === 'insights' && isValidChartId(parts[1]) && insightsData ? (
          <InsightDetailPage
            chartId={parts[1]}
            data={insightsData}
            range={insightsRange}
            subjectId={insightsSubject}
            motion={effectiveMotion}
            onRangeChange={setInsightsRange}
            onSubjectChange={setInsightsSubject}
          />
        ) : parts[0] === 'settings' ? (
          <AppearancePage
            settings={settings}
            effectiveMotion={effectiveMotion}
            osReducedMotion={osReducedMotion}
            onChange={updateSettings}
            demoReviewCount={demoReviewCount}
            onClearDemoHistory={() => void clearDemoHistory()}
          />
        ) : (
          <div className="section-stack">
            <h1 className="page-title">Page not found</h1>
            <div>
              <a className="btn btn-secondary" href="#/subjects">
                Browse subjects
              </a>
            </div>
          </div>
        )}
      </main>

      {!activeStudy && !sessionComplete && (
        <footer className={`app-footer${showTabBar ? ' app-footer-above-tabbar' : ''}`}>
          Demo deck · progress saved locally
        </footer>
      )}

      {showTabBar && (
        <nav className="tabbar" aria-label="Tab navigation">
          <div className="tabbar-inner">
            <a
              className="tab-item"
              href="#/"
              aria-current={parts[0] === '' ? 'page' : undefined}
            >
              <span className="tab-icon" key={parts[0] === '' ? 'today-on' : 'today-off'}>
                <TodayTabIcon />
              </span>
              <span>Today</span>
            </a>
            <a
              className="tab-item"
              href="#/subjects"
              aria-current={parts[0] === 'subjects' ? 'page' : undefined}
            >
              <span className="tab-icon" key={parts[0] === 'subjects' ? 'subj-on' : 'subj-off'}>
                <SubjectsTabIcon />
              </span>
              <span>Subjects</span>
            </a>
            <a
              className="tab-item"
              href="#/calendar"
              aria-current={parts[0] === 'calendar' || parts[0] === 'insights' ? 'page' : undefined}
            >
              <span className="tab-icon" key={parts[0] === 'calendar' || parts[0] === 'insights' ? 'cal-on' : 'cal-off'}>
                <CalendarTabIcon />
              </span>
              <span>Calendar</span>
            </a>
            <a
              className="tab-item"
              href="#/settings"
              aria-current={parts[0] === 'settings' ? 'page' : undefined}
            >
              <span className="tab-icon" key={parts[0] === 'settings' ? 'set-on' : 'set-off'}>
                <SettingsTabIcon />
              </span>
              <span>Settings</span>
            </a>
          </div>
        </nav>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
