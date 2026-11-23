import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { subjects, type Subject, type Lecture } from './demoSubjects';
import './style.css';
import {
  loadReviewLog,
  saveReviewLog,
  seedDemoReviewLog,
  appendReview,
  type ReviewEvent,
  type Rating,
} from './reviewLog';
import { mastery } from './mastery';
import { sessionStats } from './sessionStats';
import { CalendarPage } from './calendar/CalendarPage';
import { Markdown } from './markdown';
import {
  CalendarTabIcon,
  CheckIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  SUBJECT_DESCRIPTIONS,
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
  showHeader = false,
}: {
  stats: ReturnType<typeof sessionStats>;
  totalCards: number;
  elapsed: string;
  showHeader?: boolean;
}) {
  const rows: ReadonlyArray<[string, string]> = [
    ['Done', `${stats.done} / ${totalCards}`],
    ['Remaining', String(stats.remaining)],
    ['Correct', String(stats.right)],
    ['Hard', String(stats.hard)],
    ['Again', String(stats.again)],
    ['Accuracy', stats.done > 0 ? `${stats.accuracy}%` : '—'],
    ['Time', elapsed],
  ];

  return (
    <div className="group group-divider">
      {showHeader && (
        <div className="group-row" style={{ minHeight: '44px' }}>
          <h2 className="section-title" style={{ fontSize: 'var(--text-sm)', color: 'var(--label)' }}>
            Session
          </h2>
        </div>
      )}
      {rows.map(([label, value]) => (
        <div className="group-row" key={label}>
          <span className="row-main">
            <span className="row-title" style={{ fontSize: 'var(--text-sm)', fontWeight: 400 }}>
              {label}
            </span>
          </span>
          <span className="row-value row-value-strong">{value}</span>
        </div>
      ))}
    </div>
  );
}

function LessonRows({ subject, log }: { subject: Subject; log: readonly ReviewEvent[] }) {
  return (
    <>
      {subject.lectures.map((lecture: Lecture) => {
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
            className="lesson-row"
            href={`#/study/${subject.id}/${lecture.id}`}
          >
            <span className={`mastery-indicator mastery-${level}`} aria-hidden="true" />
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
  return (
    <div className="group group-divider">
      {subjects.map((s) => (
        <details key={s.id} className="subject-details">
          <summary className="group-row group-row-interactive">
            <span className="subject-tile">
              <SubjectIcon subjectId={s.id} />
            </span>
            <span className="row-main">
              <span className="row-title">{s.name}</span>
              <span className="row-sub">{SUBJECT_DESCRIPTIONS[s.id]}</span>
            </span>
            <span className="row-value">{s.total} cards</span>
            <ChevronDown size={16} className="row-chevron subject-chevron" />
          </summary>
          <div className="lesson-list">
            <LessonRows subject={s} log={log} />
          </div>
        </details>
      ))}
    </div>
  );
}

function App() {
  const [hash, setHash] = useState(location.hash || '#/');
  const [index, setIndex] = useState(0);
  const [log, setLog] = useState<ReviewEvent[]>(() => {
    const saved = loadReviewLog();
    if (saved.length) return saved;
    const demo = seedDemoReviewLog();
    saveReviewLog(demo);
    return demo;
  });
  const [session, setSession] = useState<ReviewEvent[]>([]);
  const [started, setStarted] = useState(Date.now());
  const [cardStarted, setCardStarted] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const navigate = () => setHash(location.hash || '#/');
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);

  const parts = hash.replace(/^#\//, '').split('/');
  const subject = subjects.find((s) => s.id === parts[1]);
  const lecture = subject?.lectures.find((l) => l.id === parts[2]);
  const studying = parts[0] === 'study' && Boolean(subject) && Boolean(lecture || parts[2] === 'all');
  const cards = lecture?.cards || subject?.lectures.flatMap((l) => l.cards) || [];
  const card = cards[index];
  const revealed = parts[3] === 'answer';
  const studyUrl = subject ? `#/study/${subject.id}/${parts[2]}` : '';

  useEffect(() => {
    setIndex(0);
    setSession([]);
    setStarted(Date.now());
    setCardStarted(Date.now());
    setLeaving(false);
  }, [parts[1], parts[2]]);

  const rate = (rating: Rating) => {
    if (!subject || !card || !revealed || leaving) return;
    const lesson = subject.lectures.find((l) => l.cards.includes(card))!;
    const cardId = `${subject.id}/${lesson.id}/${card.id}`;
    const event: ReviewEvent = {
      id: crypto.randomUUID(),
      cardId,
      subjectId: subject.id,
      lessonId: lesson.id,
      rating,
      at: new Date().toISOString(),
      durationMs: Date.now() - cardStarted,
      isNew: !log.some((e) => e.cardId === cardId),
    };
    setLog(appendReview(event));
    setSession((events) => [...events, event]);
    setLeaving(true);
    setTimeout(() => {
      setIndex((i) => i + 1);
      setLeaving(false);
      setCardStarted(Date.now());
      location.hash = studyUrl;
      window.scrollTo(0, 0);
    }, 140);
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
        if (!revealed) location.hash = `${studyUrl}/answer`;
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

  const stats = sessionStats(
    log.filter((e) => session.some((review) => review.id === e.id)),
    cards.length,
  );
  const elapsed = formatElapsed(now - started);

  const restart = () => {
    setIndex(0);
    setSession([]);
    setStarted(Date.now());
    setCardStarted(Date.now());
    setLeaving(false);
    location.hash = studyUrl;
  };

  const activeStudy = studying && Boolean(card);
  const hasMobileRatingBar = activeStudy && revealed;
  const showTabBar = !activeStudy;

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
              aria-current={parts[0] === 'calendar' ? 'page' : undefined}
            >
              Calendar
            </a>
          </nav>
        </div>
      </header>

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
                    <div className="due-figure">24</div>
                    <div className="due-label">Cards due</div>
                  </div>
                  <a className="btn btn-primary" href="#/subjects">
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
            <div>
              <a className="back-link" href="#/">
                <ChevronLeft size={16} />
                Today
              </a>
              <div className="page-head" style={{ marginBottom: 0 }}>
                <h1 className="page-title">Subjects</h1>
              </div>
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
              <div className="group">
                <LessonRows subject={subject} log={log} />
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
                      {stats.done} / {cards.length} done
                    </span>
                    <span>
                      {stats.done > 0 ? `${stats.accuracy}% · ` : ''}
                      {elapsed}
                    </span>
                  </div>
                  <div className="progress-track" aria-hidden="true">
                    <div
                      className="progress-fill"
                      style={{
                        transform: `scaleX(${cards.length ? Math.min(1, stats.done / cards.length) : 0})`,
                      }}
                    />
                  </div>
                </div>

                <section
                  className={`study-card${leaving ? ' study-card-leaving' : ''}`}
                  key={index}
                  aria-label="Flashcard"
                >
                  <div className="card-meta">
                    <span>Question</span>
                    <span>
                      {(index % cards.length) + 1} of {cards.length}
                    </span>
                  </div>
                  <div className="card-question">
                    <Markdown text={card.front} />
                  </div>
                  {revealed && (
                    <div className="card-answer">
                      <p className="card-answer-label">Answer</p>
                      <Markdown text={card.back} />
                    </div>
                  )}
                  {!revealed && (
                    <div className="card-reveal-wrap">
                      <a className="btn btn-primary btn-full" href={`${studyUrl}/answer`}>
                        Show answer
                      </a>
                    </div>
                  )}
                </section>

                {revealed && (
                  <div className="ratings-bar" role="group" aria-label="Rate your recall">
                    <div className="ratings-grid">
                      {RATINGS.map(({ key, label }) => (
                        <button
                          key={key}
                          type="button"
                          className={`rating-btn rating-${key}`}
                          disabled={leaving}
                          onClick={() => rate(key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <p className="study-hint">
                  {revealed ? 'Press 1–4 to rate' : 'Press Space to show answer'}
                </p>
              </div>

              <aside className="study-sidebar" aria-label="Session stats">
                <SessionStatsGroup
                  stats={stats}
                  totalCards={cards.length}
                  elapsed={elapsed}
                  showHeader
                />
              </aside>
            </div>
          </>
        ) : studying ? (
          <section className="complete-wrap" aria-label="Session complete">
            <div className="complete-head">
              <span className="complete-icon" aria-hidden="true">
                <CheckIcon size={24} />
              </span>
              <h1 className="page-title">Session complete</h1>
              <p className="page-sub tabular">
                {stats.done} {stats.done === 1 ? 'card' : 'cards'} reviewed
              </p>
            </div>

            <SessionStatsGroup stats={stats} totalCards={cards.length} elapsed={elapsed} />

            <div className="complete-actions">
              <a className="btn btn-primary" href="#/subjects">
                Back to subjects
              </a>
              <button type="button" className="btn btn-secondary" onClick={restart}>
                Study again
              </button>
            </div>

            <div>
              <a className="btn btn-plain" style={{ paddingLeft: 0 }} href="#/calendar">
                View calendar
              </a>
            </div>
          </section>
        ) : parts[0] === 'calendar' ? (
          <CalendarPage events={log} />
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

      {!activeStudy && (
        <footer className={`app-footer${showTabBar ? ' app-footer-above-tabbar' : ''}`}>
          Demo data · saved locally
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
              <TodayTabIcon />
              <span>Today</span>
            </a>
            <a
              className="tab-item"
              href="#/subjects"
              aria-current={parts[0] === 'subjects' ? 'page' : undefined}
            >
              <SubjectsTabIcon />
              <span>Subjects</span>
            </a>
            <a
              className="tab-item"
              href="#/calendar"
              aria-current={parts[0] === 'calendar' ? 'page' : undefined}
            >
              <CalendarTabIcon />
              <span>Calendar</span>
            </a>
          </div>
        </nav>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
