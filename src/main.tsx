import { AiGuidePage } from './AiGuidePage';
import { plural } from './plural';
import { mediaType } from './anki/media';
import { ContentContext, useSubjects } from './contentCatalog';
import { stableCardId, type ImportedData } from './anki/types';
import { CardContent } from './anki/content';
import { ImportPage } from './anki/ImportPage';
import { nextAvailableAt, sessionOutcome, queue, queueCounts, ratingEvent, replay, schedule, intervalLabel, isLeech,
} from './scheduler';
import { openReviewStorage, type LogStorage } from './reviewStorage';
import { AccountController } from './sync/account';
import { hasRealDecks, isOnboardingComplete, markOnboardingComplete, shouldShowOnboarding } from './onboarding/flow';
import { Onboarding, useOnline } from './onboarding/Onboarding';
import { HowItWorksPage } from './onboarding/HowItWorksPage';
import { starterImport } from './onboarding/starterPack';
import { mergeImport } from './anki/types';
import { CatchupPage } from './CatchupPage';
import { CATCHUP_BACKLOG, dueCount } from './catchup';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { subjects as demoSubjects,
  type DemoCard, type Subject, type Lecture,
} from './demoSubjects';
import './style.css';
import {
  type ReviewEvent,
  type Rating } from './reviewLog';
import { mastery } from './mastery';
import { sessionStats } from './sessionStats';
import { aggregateByDay, streak, toStudyDateKey } from './calendar/dailyStats';
import { CalendarPage } from './calendar/CalendarPage';
import { buildDefaultCatalog, computeInsights, type RangeKey, type SubjectFilter,
} from './insights/aggregate';
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
  Button,
  CalendarTabIcon,
  ChevronDown,
  ChevronRight,
  FlameIcon,
  Group,
  NavRow,
  PageHeader,
  Row,
  SUBJECT_DESCRIPTIONS,
  SectionHeader,
  Segmented,
  SettingsTabIcon,
  SubjectTile,
  subjectColor,
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
  media,
}: {
  media: Record<string,string>;
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

function formatTodayLabel(): string {
  const today = new Date();
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(today);
  const dateLine = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long',
  }).format(today);
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
          lecture.cards.map((c) => stableCardId(subject.id, lecture.id, c)),
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
  const subjects = useSubjects();
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
              <SubjectTile subjectId={s.id} name={s.name} />
              <span className="row-main">
                <span className="row-title">{s.name}</span>
                <span className="row-sub">{s.collectionLabel ?? SUBJECT_DESCRIPTIONS[s.id]}</span>
              </span>
              <span className="row-value">{plural(s.total, 'card')}</span>
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

const noSubscribe = () => () => undefined;
const noSnapshot = () => null;

function App() {
  const [imported, setImported] = useState<ImportedData | null>(null);
  // Demo decks: an explicit choice wins; otherwise they show only until real decks exist.
  const [showDemoPref, setShowDemoPref] = useState<boolean | null>(() => {
    try { const v = localStorage.getItem('flipwise.showDemo'); return v === 'true' ? true : v === 'false' ? false : null; } catch { return null; }
  });
  const realDecks = hasRealDecks(imported);
  const showDemo = showDemoPref ?? !realDecks;
  const setShowDemo = (value: boolean) => {
    setShowDemoPref(value);
    try { localStorage.setItem('flipwise.showDemo', String(value)); } catch { /* preference stays in memory */ }
  };
  const subjects = useMemo(
    () => [...(imported?.subjects ?? []), ...(!realDecks || showDemo ? demoSubjects : [])],
    [imported, realDecks, showDemo],
  );
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [catchupActive, setCatchupActive] = useState(false);
  const online = useOnline();
  const media = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(imported?.media ?? {}).map(([name, bytes]) => [
          name,
          URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mediaType(name) })),
        ]),
      ),
    [imported],
  );
  useEffect(
    () => () => {
      Object.values(media).forEach(URL.revokeObjectURL);
    },
    [media],
  );

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
  const insightsCatalog = useMemo(() => buildDefaultCatalog(subjects), [subjects]);

  const accountRef = useRef<AccountController | null>(null);
  const [accountVersion, setAccountVersion] = useState(0);
  /** First real decks (import, starter set or sync): the generated demo history has served its purpose. */
  const retireDemoHistory = async (events: ReviewEvent[]) => {
    const demoIds = events.filter((e) => e.demo).map((e) => e.id);
    if (!demoIds.length || !storageRef.current) return events;
    markDemoCleared(true);
    return storageRef.current.remove(demoIds);
  };
  const applySynced = (next: { data: ImportedData | null; events: ReviewEvent[] }) => {
    const firstRealDecks = !hasRealDecks(importedRef.current) && hasRealDecks(next.data);
    setImported(next.data);
    setLog(next.events);
    setSettings(loadSettings());
    if (firstRealDecks) void retireDemoHistory(next.events).then(setLog).catch(() => undefined);
  };
  const importedRef = useRef(imported);
  importedRef.current = imported;
  const commitImport = async (data: ImportedData, events: ReviewEvent[]) => {
    if (!storageRef.current) throw new Error('Storage is not ready.');
    const firstRealDecks = !hasRealDecks(importedRef.current) && hasRealDecks(data);
    let stored = await storageRef.current.importDecks(data, events);
    if (firstRealDecks) stored = await retireDemoHistory(stored);
    setImported(data);
    setLog(stored);
  };
  const reloadFromStorage = async () => {
    const storage = storageRef.current;
    if (!storage) return;
    applySynced({ data: await storage.readDecks(), events: await storage.read() });
  };

  useEffect(() => {
    void openReviewStorage()
      .then(async ({ storage, fallback }) => {
        storageRef.current = storage;
        const loaded = await storage.read();
        const decks = await storage.readDecks();
        setImported(decks);
        setOnboardingOpen(shouldShowOnboarding({ completed: isOnboardingComplete(), realDecks: hasRealDecks(decks) }));
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
        const account = new AccountController(storage, {
          onApplied: (state) => applySynced(state),
          onReplaced: () => void reloadFromStorage(),
        });
        accountRef.current = account;
        setAccountVersion((v) => v + 1);
        account.start();
        if (fallback) {
          setStorageNotice('Using local browser storage because IndexedDB is unavailable.');
        }
      })
      .catch(() => setStorageNotice('Study storage is unavailable. Please reload before studying.'),
      );
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
      void storageRef.current?.noteSettings(next).catch(() => undefined);
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

      if (!isCardRevealToggle) {
        window.scrollTo(0, 0);
      }

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
  const catalog = useMemo(
    () => subjects.flatMap((s) => s.lectures.flatMap((l, li) => l.cards.map((c, ci) => ({
            ...c,
            cardId: stableCardId(s.id, l.id, c),
            subjectId: s.id, lessonId: l.id, queuePosition: c.queuePosition ?? li * 1000 + ci,
            dailyNew: s.dailyNew,
          })),
        ),
      ),
    [subjects],
  );
  // Derived scheduling state is expensive (replays the whole log). The 1 s ticker only drives
  // the session clock, so queue math is memoised on the log and a 15 s time bucket.
  const tick = Math.floor(now / 15_000);
  const visibleIds = useMemo(() => new Set(catalog.map((c) => c.cardId)), [catalog]);
  const studyLog = useMemo(() => log.filter((e) => visibleIds.has(e.cardId)), [visibleIds, log]);
  const globalStudy = parts[1] === 'global';
  const available = useMemo(() => queue(
    catalog.filter(
      (c) => globalStudy || (c.subjectId === parts[1] && (parts[2] === 'all' || c.lessonId === parts[2])), ),
    studyLog,
    new Date(tick * 15_000 + 14_999),
  ), [catalog, studyLog, globalStudy, parts[1], parts[2], tick]);
  const cards = storageReady ? available : [];
  const card = cards[0];
  const subject = subjects.find(
    (s) => s.id === (globalStudy ? (card?.subjectId ?? session.at(-1)?.subjectId) : parts[1]),
  );
  const lecture = subject?.lectures.find((l) => l.id === (globalStudy ? card?.lessonId : parts[2]));
  const studying = parts[0] === 'study' && storageReady && (globalStudy || Boolean(subject));
  const revealed = parts[3] === 'answer';
  const studyUrl = `#/study/${parts[1]}/${parts[2]}`;
  const states = useMemo(() => replay(log), [log]);
  const previewAt = useMemo(() => new Date(tick * 15_000 + 14_999), [tick]);
  const todayCounts = useMemo(() => queueCounts(queue(catalog, studyLog, previewAt), log), [catalog, studyLog, log, previewAt]);
  const backlog = useMemo(() => (parts[0] === '' ? dueCount(catalog, studyLog, previewAt) : 0), [parts[0], catalog, studyLog, previewAt]);

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
      stage.animate([{ height: `${prevHeight}px` }, { height: `${nextHeight}px` }],
        {
          duration: 340,
          easing: 'cubic-bezier(0.22, 1.08, 0.36, 1)',
        });
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
    const event = ratingEvent(
      card,
      rating, log, new Date(), Date.now() - cardStarted, settings.retention, crypto.randomUUID(),
    );
    pendingWrite.current = true;
    setSaving(true);
    let nextLog: ReviewEvent[];
    try { nextLog = await storageRef.current.append(event); } catch { setStorageNotice('Could not save your rating. Please try again.'); setSaving(false); pendingWrite.current = false; return; }
    setLog(nextLog); setSaving(false); pendingWrite.current = false;
    setSession((events) => [...events, event]);
    setSwipeHint(null);
    prevStageHeightRef.current = null;

    if (barTimerRef.current) window.clearTimeout(barTimerRef.current);
    if (finishTimerRef.current) window.clearTimeout(finishTimerRef.current);

    const isLastCard = queue(
        catalog.filter(
          (c) => globalStudy || (c.subjectId === parts[1] && (parts[2] === 'all' || c.lessonId === parts[2])), ),
        nextLog.filter((e) => visibleIds.has(e.cardId)),
        new Date(),
      ).length === 0;

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
      finishTimerRef.current = window.setTimeout(
        () => {
        setIndex((i) => i + 1);
        setExitingCard(null);
        setCardStarted(Date.now());
        window.scrollTo(0, 0);
      }, effectiveMotion === 'full' ? 180 : 120,
      );
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
          [{ transform: currentTransform },
            { transform: 'translate3d(0, 0, 0) rotate(0deg)' }],
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

  const todayKey = toStudyDateKey(new Date(now));
  const dailyAggregate = useMemo(() => aggregateByDay(log), [log]);
  const streakStats = useMemo(() => streak(dailyAggregate, todayKey), [dailyAggregate, todayKey]);

  const demoReviewCount = useMemo(() => log.reduce((sum, e) => sum + (e.demo ? 1 : 0), 0),
    [log]);

  const clearDemoHistory = async () => {
    markDemoCleared(true);
    setLog(log.filter((e) => !e.demo));
    if (storageRef.current) {
      try {
        setLog(await storageRef.current.remove(log.filter((e) => e.demo).map((e) => e.id)));
      } catch {
        setStorageNotice('Could not clear demo history. Please try again.');
      }
    }
  };

  const insightsData = useMemo(() => {
    if (parts[0] !== 'insights') return null;
    return computeInsights(
      log.filter((e) => insightsCatalog.some((c) => c.cardId === e.cardId)),
      insightsCatalog, {
      range: insightsRange,
      subjectId: insightsSubject,
      targetRetention: settings.retention,
    }, subjects,
    );
  }, [
    parts[0],
    log, insightsCatalog, insightsRange, insightsSubject, settings.retention,
    subjects,
  ]);

  const calendarModeControl = (
    <div className="cal-mode-switch">
      <Segmented
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
    if (
      pendingWrite.current || !session.length || !storageRef.current || !log.some((e) => e.id === session.at(-1)?.id)
    )
      return;
    pendingWrite.current = true; setSaving(true);
    try { const next = await storageRef.current.remove([session.at(-1)!.id]);
      setLog(next); setSession(session.slice(0, -1));
      setIndex(Math.max(0, index - 1));
      location.hash = studyUrl;
      setHash(studyUrl); }
    catch { setStorageNotice('Could not undo. Please try again.'); }
    finally { setSaving(false); pendingWrite.current = false; }
  };
  useEffect(() => { const handler = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)
      ) { e.preventDefault(); void undo(); } }; window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
  const accountSnapshot = useSyncExternalStore(
    accountRef.current?.subscribe ?? noSubscribe,
    accountRef.current?.getSnapshot ?? noSnapshot,
  );
  void accountVersion;
  const canUndo =
    session.length > 0 &&
    Boolean(storageRef.current) &&
    log.some((e) => e.id === session.at(-1)?.id);
  const activeStudy = studying && Boolean(card);
  const outcome = sessionOutcome(studying, cards.length, session.length);
  const sessionComplete = outcome === 'complete';
  const caughtUp = outcome === 'caught-up';
  const nextAvailable = caughtUp ? nextAvailableAt(catalog.filter(c=>globalStudy || c.subjectId===parts[1] && (parts[2]==='all' || c.lessonId===parts[2])), studyLog, new Date(now)) : null;
  const hasMobileRatingBar = activeStudy && revealed;
  // Subject pages, study and catch-up carry the subject's colour (top wash, progress).
  const washSubject = (parts[0] === 'subjects' || parts[0] === 'study' || parts[0] === 'catchup') && subject && !globalStudy
    ? subject
    : parts[0] === 'catchup' ? subjects.find((s) => s.id === parts[1]) : undefined;
  const showTabBar = !activeStudy && !sessionComplete && !(catchupActive && parts[0] === 'catchup');

  if (onboardingOpen && storageReady) {
    const account = accountRef.current && accountSnapshot && accountSnapshot.phase !== 'unavailable'
      ? { controller: accountRef.current, snapshot: accountSnapshot } : null;
    return (
      <ContentContext.Provider value={subjects}>
        <Onboarding
          account={account}
          online={online}
          imported={imported}
          onAddStarter={async (pack, ids) => {
            const { data } = mergeImport(importedRef.current, starterImport(pack, ids), log);
            await commitImport(data, log);
          }}
          renderImport={(onDone) => <ImportPage existing={imported} events={log} onCommit={commitImport} onDone={onDone} />}
          renderAiGuide={(onImport) => <AiGuidePage onImport={onImport} />}
          onFinish={() => {
            markOnboardingComplete();
            setOnboardingOpen(false);
            if (location.hash !== '#/') location.hash = '#/';
            window.scrollTo(0, 0);
          }}
        />
      </ContentContext.Provider>
    );
  }

  return (
    <ContentContext.Provider value={subjects}>
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
              aria-current={parts[0] === '' ? 'page' : undefined}>
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
              aria-current={
                  parts[0] === 'calendar' || parts[0] === 'insights' ? 'page' : undefined
                }
              >
              Calendar
            </a>
            <a
              className="icon-btn nav-settings-btn"
              href="#/settings"
              aria-label="Settings"
              aria-current={parts[0] === 'settings' ? 'page' : undefined}
            >
              <SettingsTabIcon size={20} />
            </a>
          </nav>
        </div>
      </header>

      {storageNotice && (
          <p role="status" className="study-hint">
            {storageNotice}
          </p>
        )}
        <main
        id="main"
        className={`main${hasMobileRatingBar ? ' main-has-mobile-bar' : ''}${washSubject ? ' has-subject-wash' : ''}`}
        style={washSubject ? ({ '--subject': subjectColor(washSubject.id, washSubject.name) } as CSSProperties) : undefined}>
          {parts[0] === '' ? (
          <div className="section-stack">
            <PageHeader eyebrow={formatTodayLabel()} title="Today" />

            <section aria-label="Due summary">
              <Group divider={false} className="hero-surface">
                <div className="due-row">
                  <div>
                    <div className="due-figure">{todayCounts.total}</div>
                    <div className="due-label">Cards available</div>
                    <div className="due-label">
                      {todayCounts.new} new · {todayCounts.review} review · {todayCounts.learning}{' '}
                      learning
                    </div>
                  </div>
                  <Button variant="primary" href="#/study/global/all">
                    Study
                  </Button>
                </div>
              </Group>
            </section>

            {backlog > CATCHUP_BACKLOG && (
              <Group ariaLabel="Catch up">
                <NavRow
                  href="#/catchup/global/all"
                  title={`Catch up on ${plural(backlog, 'due card')}`}
                  subtitle="A fast pass: knew it or didn’t, nothing else"
                />
              </Group>
            )}

            <section aria-label="Subjects">
              <SectionHeader
                title="Subjects"
                action={
                  <Button variant="plain" className="btn-compact" href="#/subjects">
                    See all
                  </Button>
                }
              />
              <SubjectGroup log={log} />
            </section>
          </div>
        ) : parts[0] === 'subjects' && !parts[1] ? (
          <div className="section-stack">
            <PageHeader
              title="Subjects"
              trailing={
                <Button variant="plain" href="#/import">
                  Import
                </Button>
              }
            />
            <SubjectGroup log={log} />
          </div>
        ) : parts[0] === 'subjects' && subject ? (
          <div className="section-stack">
            <PageHeader
              backHref="#/subjects"
              backLabel="Subjects"
              title={subject.name}
              subtitle={`${subject.collectionLabel ? `${subject.collectionLabel} · ` : ''}${plural(subject.total, 'card')} · ${plural(subject.lectures.length, 'lesson')}`}
            />

            <Group divider={false}>
              <div className="due-row">
                <SubjectTile subjectId={subject.id} name={subject.name} size="lg" />
                <div className="due-row-main">
                  <div className="row-title">All lessons</div>
                  <div className="row-sub tabular">
                    {plural(queue(catalog.filter(c=>c.subjectId===subject.id), studyLog, previewAt).length, 'card')} in queue
                  </div>
                </div>
                <div className="due-row-actions">
                  <Button variant="secondary" href={`#/catchup/${subject.id}/all`}>
                    Catch up
                  </Button>
                  <Button
                    variant="primary"
                    href={`#/study/${subject.id}/all`}
                    onClick={() => setIndex(0)}
                  >
                    Study all
                  </Button>
                </div>
              </div>
            </Group>

            <section aria-label="Lessons">
              <SectionHeader title="Lessons" />
              <Group inset="lessons" divider={false}>
                <LessonRows subject={subject} log={log} stagger />
              </Group>
            </section>
          </div>
        ) : activeStudy && subject ? (
          <>
            <PageHeader
              backHref={`#/subjects/${subject.id}`}
              backLabel={subject.name}
              title={lecture?.title || 'All lessons'}
              subtitle={subject.collectionLabel}
              trailing={<Button variant="plain" href={`#/catchup/${subject.id}/${parts[2] || 'all'}`}>Catch up</Button>}
              className="study-page-head"
            />

            <div className="study-layout">
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
                          <div className="card-meta card-stagger" style={{ '--i': 0 } as CSSProperties}
                            >
                              <span>Question</span>
                            <span>
                              {session.length + 1} of {session.length + cards.length}
                            </span>
                          </div>
                          <div className="card-question card-stagger" style={{ '--i': 1 } as CSSProperties}
                            >
                              <CardContent card={card} side="front" media={media} />
                          </div>
                          <div className="card-reveal-wrap card-stagger" style={{ '--i': 2 } as CSSProperties}>
                            <Button
                              variant="primary"
                              size="full"
                              href={`${studyUrl}/answer`}
                              onClick={(e) => {
                                e.preventDefault();
                                revealCard();
                              }}
                            >
                              Show answer
                            </Button>
                          </div>
                        </section>

                        <section
                          className="study-card card-face card-face-back"
                          aria-label="Flashcard answer"
                          aria-hidden={!revealed}
                        >
                          <div ref={tintRef} className="swipe-tint" aria-hidden="true" />
                          {swipeHint && (
                            <span className={`swipe-badge swipe-badge-${swipeHint.rating}`} aria-hidden="true"
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
                          {label}
                            <small className="rating-interval">
                              {intervalLabel(
                                schedule(
                                  states.get(card.cardId),
                                  key, previewAt, settings.retention,
                                ),
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
        ) : caughtUp ? (
          <Group divider={false} ariaLabel="Study queue empty" className="caught-up">
            <h1 className="page-title">All caught up</h1>
            <p className="caught-up-sub">
              {nextAvailable
                ? `Next available ${nextAvailable.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.`
                : 'There are no cards waiting in this lesson.'}
            </p>
            <Button
              variant="secondary"
              href={subject ? `#/subjects/${subject.id}` : '#/subjects'}
            >
              Back to subjects
            </Button>
          </Group>
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
                      <AnimatedNumber value={streakStats.current} motion={effectiveMotion} />{' '}
                      {streakStats.current === 1 ? 'day' : 'days'}
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
                      <Button
                        variant="plain"
                        disabled={saving}
                        onClick={() => void undo()}
                      >
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
        ) : parts[0] === 'calendar' ? (
          <CalendarPage
            events={log}
            motion={effectiveMotion}
            headerAccessory={calendarModeControl}
          />
        ) : parts[0] === 'insights' && !parts[1] && insightsData ? (
          <div className="section-stack">
            <PageHeader title="Insights" trailing={calendarModeControl} />
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
        ) : parts[0] === 'catchup' && storageReady ? (
          <CatchupPage
            scope={{ subjectId: parts[1] || 'global', lessonId: parts[2] || 'all' }}
            subjects={subjects}
            catalog={catalog}
            log={studyLog}
            retention={settings.retention}
            media={media}
            motion={effectiveMotion}
            onActiveChange={setCatchupActive}
            onAppend={async (event) => { const next = await storageRef.current!.append(event); setLog(next); return next; }}
            onRemove={async (ids) => { const next = await storageRef.current!.remove(ids); setLog(next); return next; }}
          />
        ) : parts[0] === 'how-it-works' ? (
          <div className="section-stack">
            <PageHeader backHref="#/settings" backLabel="Settings" title="How Flipwise works" />
            <HowItWorksPage />
          </div>
        ) : parts[0] === 'ai-guide' ? (
          <AiGuidePage />
        ) : parts[0] === 'import' ? (
            <ImportPage
              existing={imported}
              events={log}
              onCommit={commitImport}
            />
          ) : parts[0] === 'settings' ? (
          <AppearancePage
            settings={settings}
            effectiveMotion={effectiveMotion}
            osReducedMotion={osReducedMotion}
            onChange={updateSettings}
            data={
              imported ?? {
                subjects,
                media: {},
                packageName: 'Flipwise',
                notes: 0,
                revlog: [],
                warnings: [],
              }
            }
            showDemo={showDemo}
            onShowDemo={setShowDemo}
            onShowWelcome={() => setOnboardingOpen(true)}
            demoReviewCount={demoReviewCount}
            onClearDemoHistory={() => void clearDemoHistory()}
            account={accountRef.current && accountSnapshot ? { controller: accountRef.current, snapshot: accountSnapshot } : undefined}
          />
          ) : (
          <div className="section-stack">
            <PageHeader title="Page not found" />
            <div>
              <Button variant="secondary" href="#/subjects">
                Browse subjects
              </Button>
            </div>
          </div>
        )}
      </main>

      {showTabBar && (
        <footer className={`app-footer${showTabBar ? ' app-footer-above-tabbar' : ''}`}>
          {accountSnapshot?.phase === 'signedIn' ? 'Saved on this device and synced to your account' : 'Saved locally on this device'}
        </footer>
      )}

      {showTabBar && (
        <nav className="tabbar" aria-label="Tab navigation">
          <div className="tabbar-inner">
            <a
              className="tab-item"
              href="#/"
              aria-current={parts[0] === '' ? 'page' : undefined}>
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
              aria-current={
                  parts[0] === 'calendar' || parts[0] === 'insights' ? 'page' : undefined
                }
              >
              <span className="tab-icon" key={parts[0] === 'calendar' || parts[0] === 'insights' ? 'cal-on' : 'cal-off'}
                >
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
  </ContentContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
