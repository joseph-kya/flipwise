import { State } from 'ts-fsrs';
import { AiGuidePage } from './AiGuidePage';
import { plural } from './plural';
import { mediaType } from './anki/media';
import { ContentContext, useSubjects } from './contentCatalog';
import { stableCardId, type ImportedData } from './anki/types';
import { ImportPage } from './anki/ImportPage';
import { queue, queueCounts, replay } from './scheduler';
import { secondsPerAnswer } from './forecast';
import {
  applyDemoStudy,
  applyPresetToAll,
  loadDemoStudy,
  queueLimits,
  saveDemoStudy,
  type DemoStudyStore,
  type StudyLimits,
} from './studyOptions';
import { StudyOptionsSheet } from './study/StudyOptionsSheet';
import { StudySession } from './study/StudySession';
import { openReviewStorage, type LogStorage } from './reviewStorage';
import { AccountController } from './sync/account';
import { hasRealDecks, restoreProgress, isOnboardingComplete, markOnboardingComplete, shouldShowOnboarding } from './onboarding/flow';
import { Onboarding, useOnline } from './onboarding/Onboarding';
import { HowItWorksPage } from './onboarding/HowItWorksPage';
import { starterImport } from './onboarding/starterPack';
import { mergeImport } from './anki/types';
import { CatchupPage } from './CatchupPage';
import { CATCHUP_BACKLOG, dueCount } from './catchup';
import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { subjects as demoSubjects, type Subject, type Lecture } from './demoSubjects';
import './style.css';
import './pwa/runtime';
import { UpdatePrompt } from './pwa/InstallApp';
import { type ReviewEvent } from './reviewLog';
import { mastery } from './mastery';
import { aggregateByDay, streak, toStudyDateKey } from './calendar/dailyStats';
import { CalendarPage } from './calendar/CalendarPage';
import { buildDefaultCatalog, computeInsights, type RangeKey, type SubjectFilter,
} from './insights/aggregate';
import { InsightDetailPage, isValidChartId } from './insights/InsightDetailPage';
import { InsightsView } from './insights/InsightsView';
import { markDemoCleared, seedDemoHistoryIfEmpty } from './insights/seedDemoHistory';
import { AppearancePage } from './AppearancePage';
import {
  applyAppearance,
  loadSettings,
  saveSettings,
  type AppearanceSettings,
  type EffectiveMotion,
} from './settings';
import { AnimatedNumber } from './motion';
import {
  Button,
  CalendarTabIcon,
  ChevronDown,
  ChevronRight,
  Group,
  NavRow,
  NotesTabIcon,
  PageHeader,
  SUBJECT_DESCRIPTIONS,
  SectionHeader,
  Segmented,
  SettingsTabIcon,
  SlidersIcon,
  SubjectTile,
  subjectColor,
  SubjectsTabIcon,
  TodayTabIcon,
} from './ui';
import { NoteOpenContext, parseNotesHash, type NoteOpenTarget } from './notes/sourceLink';

const NotesApp = lazy(() => import('./notes/NotesApp'));
const NotesOverlay = lazy(() => import('./notes/NotesApp').then((m) => ({ default: m.NotesOverlay })));

function formatTodayLabel(): string {
  const today = new Date();
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(today);
  const dateLine = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long',
  }).format(today);
  return `${weekday}, ${dateLine}`;
}

function LessonRows({
  subject,
  log,
  animateDots = false,
  stagger = false,
  onOpenLectureOptions,
}: {
  subject: Subject;
  log: readonly ReviewEvent[];
  animateDots?: boolean;
  stagger?: boolean;
  onOpenLectureOptions?: (lectureId: string) => void;
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
        const hasOverride = Boolean(
          lecture.study && (lecture.study.newPerDay !== undefined || lecture.study.reviewsPerDay !== undefined),
        );

        const link = (
          <a
            key={onOpenLectureOptions ? undefined : lecture.id}
            className={`lesson-row${stagger && !onOpenLectureOptions ? ' stagger-item' : ''}`}
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
              {hasOverride && (
                <span className="lesson-override-badge">
                  {lecture.study?.newPerDay !== undefined ? `${lecture.study.newPerDay}/d` : 'Custom'}
                </span>
              )}
              <span>{knowledge.label}</span>
              <span>{lecture.cards.length}</span>
              <ChevronRight size={14} className="row-chevron" />
            </span>
          </a>
        );

        if (!onOpenLectureOptions) return link;
        return (
          <div
            key={lecture.id}
            className={`lesson-item${stagger ? ' stagger-item' : ''}`}
            style={{ '--i': Math.min(i, 7) } as CSSProperties}
          >
            {link}
            <button
              type="button"
              className={`lesson-options-btn${hasOverride ? ' has-override' : ''}`}
              aria-label={`Study options for ${lecture.title}`}
              title="Lecture study options"
              onClick={() => onOpenLectureOptions(lecture.id)}
            >
              <SlidersIcon size={16} />
            </button>
          </div>
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
  const [demoStudy, setDemoStudy] = useState<DemoStudyStore>(() => loadDemoStudy());
  const [studySheet, setStudySheet] = useState<{ subjectId: string; lectureId?: string } | null>(null);
  const subjects = useMemo(
    () => [...(imported?.subjects ?? []), ...(!realDecks || showDemo ? applyDemoStudy(demoSubjects, demoStudy) : [])],
    [imported, realDecks, showDemo, demoStudy],
  );
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [catchupActive, setCatchupActive] = useState(false);
  const [noteOverlay, setNoteOverlay] = useState<NoteOpenTarget | null>(null);
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

  const [log, setLog] = useState<ReviewEvent[]>([]);
  const storageRef = useRef<LogStorage | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [storageNotice, setStorageNotice] = useState('');
  const [completedStudyKey, setCompletedStudyKey] = useState<string | null>(null);
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
        setOnboardingOpen(shouldShowOnboarding({ completed: isOnboardingComplete(), realDecks: hasRealDecks(decks), progress: restoreProgress().step }));
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
  const [now, setNow] = useState(Date.now());

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

  const persistImportedDecks = (nextData: ImportedData) => {
    setImported(nextData);
    void storageRef.current?.importDecks(nextData, []).catch(() => {
      setStorageNotice('Could not save study options. Please try again.');
    });
  };

  const saveCourseStudy = (subjectId: string, next: StudyLimits | undefined) => {
    const cur = importedRef.current;
    if (cur?.subjects.some((s) => s.id === subjectId)) {
      const updated: ImportedData = {
        ...cur,
        subjects: cur.subjects.map((s) => {
          if (s.id !== subjectId) return s;
          const { study: _old, ...rest } = s;
          return next ? { ...rest, study: next } : rest;
        }),
      };
      persistImportedDecks(updated);
      return;
    }
    setDemoStudy((prev) => {
      const courses = { ...prev.courses };
      if (next) courses[subjectId] = next;
      else delete courses[subjectId];
      const updated = { ...prev, courses };
      saveDemoStudy(updated);
      return updated;
    });
  };

  const saveLectureStudy = (subjectId: string, lectureId: string, next: StudyLimits | undefined) => {
    const cur = importedRef.current;
    if (cur?.subjects.some((s) => s.id === subjectId)) {
      const updated: ImportedData = {
        ...cur,
        subjects: cur.subjects.map((s) => {
          if (s.id !== subjectId) return s;
          return {
            ...s,
            lectures: s.lectures.map((l) => {
              if (l.id !== lectureId) return l;
              const { study: _old, ...rest } = l;
              return next ? { ...rest, study: next } : rest;
            }),
          };
        }),
      };
      persistImportedDecks(updated);
      return;
    }
    const key = `${subjectId}/${lectureId}`;
    setDemoStudy((prev) => {
      const lectures = { ...prev.lectures };
      if (next) lectures[key] = next;
      else delete lectures[key];
      const updated = { ...prev, lectures };
      saveDemoStudy(updated);
      return updated;
    });
  };

  const applyGlobalPace = (preset: 'slow' | 'medium' | 'aggressive') => {
    const { globalNew, pace, bySubject } = applyPresetToAll(subjects, preset, unseenBySubject, previewAt);
    const cur = importedRef.current;
    const importedIds = new Set(cur?.subjects.map((s) => s.id) ?? []);
    if (cur && cur.subjects.length > 0) {
      const updated: ImportedData = {
        ...cur,
        subjects: cur.subjects.map((s) => {
          const study = bySubject.get(s.id);
          return study ? { ...s, study } : s;
        }),
      };
      persistImportedDecks(updated);
    }
    const demoEntries = [...bySubject.entries()].filter(([id]) => !importedIds.has(id));
    if (demoEntries.length > 0) {
      setDemoStudy((prev) => {
        const courses = { ...prev.courses };
        for (const [id, study] of demoEntries) courses[id] = study;
        const updated = { ...prev, courses };
        saveDemoStudy(updated);
        return updated;
      });
    }
    updateSettings({ newPerDay: globalNew, pace });
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const nextHash = location.hash || '#/';
      if (nextHash === hash) return;
      const prevRoute = hash.split('/').slice(0, 3).join('/');
      const nextRoute = nextHash.split('/').slice(0, 3).join('/');
      const isNoteAnchorJump =
        nextHash.startsWith('#/notes/') &&
        hash.startsWith('#/notes/') &&
        hash.split('#').slice(0, 2).join('#') === nextHash.split('#').slice(0, 2).join('#');

      flushSync(() => {
        if (prevRoute !== nextRoute) {
          setCompletedStudyKey(null);
        }
        setHash(nextHash);
      });
      if (!isNoteAnchorJump) {
        window.scrollTo(0, 0);
      }
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
  const previewAt = useMemo(() => new Date(tick * 15_000 + 14_999), [tick]);
  const visibleIds = useMemo(() => new Set(catalog.map((c) => c.cardId)), [catalog]);
  const studyLog = useMemo(() => log.filter((e) => visibleIds.has(e.cardId)), [visibleIds, log]);
  const states = useMemo(() => replay(log), [log]);
  const unseenBySubject = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of subjects) {
      let unseen = 0;
      for (const l of s.lectures) {
        for (const c of l.cards) {
          const st = states.get(stableCardId(s.id, l.id, c));
          if (!st || st.state === State.New) unseen++;
        }
      }
      map.set(s.id, unseen);
    }
    return map;
  }, [subjects, states]);
  const limits = useMemo(
    () => queueLimits(subjects, settings, unseenBySubject, previewAt),
    [subjects, settings, unseenBySubject, previewAt],
  );
  const secPerAnswer = useMemo(() => secondsPerAnswer(log), [log]);
  const logSignature = `${log.length}:${log.at(-1)?.id ?? ''}`;
  const isStudyRoute = parts[0] === 'study';
  const globalStudy = parts[1] === 'global';
  const studySessionKey = isStudyRoute ? `${parts[1] ?? ''}/${parts[2] ?? ''}` : '';
  const available = useMemo(() => queue(
    catalog.filter(
      (c) => globalStudy || (c.subjectId === parts[1] && (parts[2] === 'all' || c.lessonId === parts[2])), ),
    studyLog,
    previewAt,
    limits,
  ), [catalog, studyLog, globalStudy, parts[1], parts[2], previewAt, limits]);
  const cards = storageReady ? available : [];
  const routeSubject = subjects.find((s) => s.id === parts[1]);
  const todayCounts = useMemo(() => queueCounts(queue(catalog, studyLog, previewAt, limits), log), [catalog, studyLog, log, previewAt, limits]);
  const backlog = useMemo(() => (parts[0] === '' ? dueCount(catalog, studyLog, previewAt) : 0), [parts[0], catalog, studyLog, previewAt]);

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

  const accountSnapshot = useSyncExternalStore(
    accountRef.current?.subscribe ?? noSubscribe,
    accountRef.current?.getSnapshot ?? noSnapshot,
  );
  void accountVersion;
  const studyLoading = isStudyRoute && !storageReady;
  const studyActiveOrLoading =
    studyLoading ||
    (isStudyRoute && storageReady && (globalStudy || Boolean(routeSubject)) && cards.length > 0) ||
    (isStudyRoute && completedStudyKey === studySessionKey);
  const notesRoute = useMemo(() => parseNotesHash(hash), [hash]);
  const isNotesReader = parts[0] === 'notes' && Boolean(notesRoute.noteSlug);
  const notesWashColor =
    parts[0] === 'notes' && notesRoute.courseSlug && !notesRoute.noteSlug
      ? subjectColor(notesRoute.courseSlug)
      : undefined;
  // Subject pages, study and catch-up carry the subject's colour (top wash, progress).
  const washSubject = (parts[0] === 'subjects' || parts[0] === 'study' || parts[0] === 'catchup') && routeSubject && !globalStudy
    ? routeSubject
    : undefined;
  const washColor = washSubject ? subjectColor(washSubject.id, washSubject.name) : notesWashColor;
  const showTabBar = !studyActiveOrLoading && !(catchupActive && parts[0] === 'catchup') && !noteOverlay;
  const routeScreenKey =
    parts[0] === 'notes'
      ? `notes:${notesRoute.courseSlug ?? ''}:${notesRoute.noteSlug ?? ''}`
      : isStudyRoute
        ? `study:${studySessionKey}`
        : parts.slice(0, 3).join('/') || 'today';

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
        {/* Offer service-worker updates after setup; an auth popup must not be interrupted by Reload. */}
      </ContentContext.Provider>
    );
  }

  const sheetSubject = studySheet ? subjects.find((s) => s.id === studySheet.subjectId) : undefined;
  const sheetLecture = sheetSubject && studySheet?.lectureId
    ? sheetSubject.lectures.find((l) => l.id === studySheet.lectureId)
    : undefined;

  return (
    <ContentContext.Provider value={subjects}>
      <NoteOpenContext.Provider value={(target) => setNoteOverlay(target)}>
      <div className="app" aria-hidden={Boolean(noteOverlay)}>
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
              href="#/notes"
              aria-current={parts[0] === 'notes' ? 'page' : undefined}
            >
              Notes
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
        className={`main${washColor ? ' has-subject-wash' : ''}${isNotesReader ? ' main-notes-reader' : ''}`}
        style={washColor ? ({ '--subject': washColor } as CSSProperties) : undefined}>
        <div key={routeScreenKey} className="route-screen">
          {parts[0] === '' ? (
          <div className="section-stack">
            <PageHeader eyebrow={formatTodayLabel()} title="Today" />

            <section aria-label="Due summary">
              <Group divider={false} className="hero-surface">
                <div className="due-row">
                  <div>
                    <div className="due-figure"><AnimatedNumber value={todayCounts.total} motion={effectiveMotion} /></div>
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
        ) : parts[0] === 'subjects' && routeSubject ? (
          <div className="section-stack">
            <PageHeader
              backHref="#/subjects"
              backLabel="Subjects"
              title={routeSubject.name}
              subtitle={`${routeSubject.collectionLabel ? `${routeSubject.collectionLabel} · ` : ''}${plural(routeSubject.total, 'card')} · ${plural(routeSubject.lectures.length, 'lesson')}`}
              trailing={
                <Button
                  variant="secondary"
                  className="btn-compact"
                  onClick={() => setStudySheet({ subjectId: routeSubject.id })}
                >
                  <SlidersIcon size={16} />
                  Study options
                </Button>
              }
            />

            <Group divider={false}>
              <div className="due-row">
                <SubjectTile subjectId={routeSubject.id} name={routeSubject.name} size="lg" />
                <div className="due-row-main">
                  <div className="row-title">All lessons</div>
                  <div className="row-sub tabular">
                    {plural(queue(catalog.filter(c=>c.subjectId===routeSubject.id), studyLog, previewAt, limits).length, 'card')} in queue
                  </div>
                </div>
                <div className="due-row-actions">
                  <Button variant="secondary" href={`#/catchup/${routeSubject.id}/all`}>
                    Catch up
                  </Button>
                  <Button
                    variant="primary"
                    href={`#/study/${routeSubject.id}/all`}
                  >
                    Study all
                  </Button>
                </div>
              </div>
            </Group>

            <section aria-label="Lessons">
              <SectionHeader title="Lessons" />
              <Group inset="lessons" divider={false}>
                <LessonRows
                  subject={routeSubject}
                  log={log}
                  stagger
                  onOpenLectureOptions={(lectureId) => setStudySheet({ subjectId: routeSubject.id, lectureId })}
                />
              </Group>
            </section>
          </div>
        ) : isStudyRoute ? (
          <StudySession
            key={studySessionKey}
            storageReady={storageReady}
            globalStudy={globalStudy}
            subjectId={parts[1] || ''}
            lectureId={parts[2] || 'all'}
            subjects={subjects}
            catalog={catalog}
            visibleIds={visibleIds}
            cards={cards}
            log={log}
            studyLog={studyLog}
            states={states}
            limits={limits}
            previewAt={previewAt}
            now={now}
            retention={settings.retention}
            media={media}
            effectiveMotion={effectiveMotion}
            streakDays={streakStats.current}
            noteOverlayOpen={Boolean(noteOverlay)}
            hasStorage={Boolean(storageRef.current)}
            onAppendEvent={async (event) => {
              const next = await storageRef.current!.append(event);
              setLog(next);
              return next;
            }}
            onRemoveEvents={async (ids) => {
              const next = await storageRef.current!.remove(ids);
              setLog(next);
              return next;
            }}
            onStorageError={setStorageNotice}
            onOpenStudySheet={setStudySheet}
            onCompleteChange={(complete) => setCompletedStudyKey(complete ? studySessionKey : null)}
          />
        ) : parts[0] === 'notes' ? (
          <Suspense fallback={<div className="section-stack"><PageHeader title="Notes" /></div>}>
            <NotesApp
              courseSlug={notesRoute.courseSlug}
              noteSlug={notesRoute.noteSlug}
              headingId={notesRoute.headingId}
              motion={effectiveMotion}
            />
          </Suspense>
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
            states={states}
            unseenBySubject={unseenBySubject}
            logSignature={logSignature}
            secPerAnswer={secPerAnswer}
            today={previewAt}
            onApplyPresetAll={applyGlobalPace}
            onOpenCourseOptions={(subjectId) => setStudySheet({ subjectId })}
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
        </div>
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
              href="#/notes"
              aria-current={parts[0] === 'notes' ? 'page' : undefined}
            >
              <span className="tab-icon" key={parts[0] === 'notes' ? 'notes-on' : 'notes-off'}>
                <NotesTabIcon />
              </span>
              <span>Notes</span>
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
    {sheetSubject && (
      <StudyOptionsSheet
        open={Boolean(studySheet)}
        onClose={() => setStudySheet(null)}
        subject={sheetSubject}
        lecture={sheetLecture}
        global={settings}
        retention={settings.retention}
        states={states}
        logSignature={logSignature}
        secPerAnswer={secPerAnswer}
        today={previewAt}
        onSaveCourse={saveCourseStudy}
        onSaveLecture={saveLectureStudy}
      />
    )}
    {noteOverlay && (
      <Suspense fallback={null}>
        <NotesOverlay
          target={noteOverlay}
          motion={effectiveMotion}
          onClose={() => setNoteOverlay(null)}
          onNavigate={(next) => setNoteOverlay(next)}
        />
      </Suspense>
    )}
    <UpdatePrompt />
    </NoteOpenContext.Provider>
    </ContentContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
