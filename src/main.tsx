import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { subjects, type Subject } from './demoSubjects';
import './style.css';
import { Markdown } from './markdown';
import { CalendarPage } from './calendar/CalendarPage';
import { loadReviewLog, seedDemoReviewLog } from './reviewLog';

function App() {
  const [hash, setHash] = useState(location.hash || '#/');
  const [dark, setDark] = useState(false);
  const [index, setIndex] = useState(0);
  const reviewEvents = useMemo(() => {
    const saved = loadReviewLog();
    return saved.length > 0 ? saved : seedDemoReviewLog();
  }, []);
  useEffect(() => {
    const navigate = () => setHash(location.hash || '#/');
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  const parts = hash.replace(/^#\//, '').split('/');
  const subject = subjects.find(s => s.id === parts[1]);
  const lecture = subject?.lectures.find(l => l.id === parts[2]);
  const studying = parts[0] === 'study' && subject && (lecture || parts[2] === 'all');
  const cards = lecture?.cards || subject?.lectures.flatMap(l => l.cards) || [];
  const card = cards[index % Math.max(cards.length, 1)];
  const revealed = parts[3] === 'answer';
  const studyUrl = subject ? `#/study/${subject.id}/${parts[2]}` : '';
  const subjectRows = (compact = false) => subjects.map((s: Subject, i) => (
    <a className="subject-row" href={`#/subjects/${s.id}`} key={s.id}>
      <span className="subject-icon" aria-hidden="true">{['∑', '⌘', 'φ', '{}'][i]}</span>
      <span className="subject-copy"><strong>{s.name}</strong><span className="muted">{s.total} cards · {s.lectures.length} lectures</span></span>
      {!compact && <span className="subject-action">Choose lectures</span>}
      <span aria-hidden="true">›</span>
    </a>
  ));
  return (
    <div className={dark ? 'app dark' : 'app'}>
      <header>
        <a className="brand" href="#/"><span className="mark">f</span>flipwise<span className="brand-dot">.</span></a>
        <span className="header-note">A little practice. Lasting knowledge.</span>
        <a className="text-link" href="#/calendar" aria-current={parts[0] === 'calendar' ? 'page' : undefined}>Calendar</a>
        <button className="theme" onClick={() => setDark(!dark)} aria-label={dark ? 'Use light theme' : 'Use dark theme'}>{dark ? '☀' : '☾'}</button>
      </header>
      <main id="main">
        {parts[0] === '' ? <>
          <div className="heading"><div><p className="muted">Monday, 23 November</p><h1>Make room for recall.</h1></div><span className="demo">Demo workspace</span></div>
          <div className="layout">
            <aside className="today">
              <div className="today-top"><span>Today’s review</span><span aria-hidden="true">✦</span></div>
              <div className="due">24</div><h2>cards ready for you</h2>
              <p>A small session now. <br/>A little less to relearn later.</p>
              <a className="primary" href="#/subjects">Study now <span aria-hidden="true">↗</span></a>
              <div className="session-info"><span>About 8 minutes</span><span>Demo review count</span></div>
              <div className="aside-bottom"><span className="status-dot"/> Your semester. One step at a time.</div>
            </aside>
            <section className="subjects">
              <div className="section-title"><h2>Your subjects</h2><a className="text-link" href="#/subjects">View all subjects</a></div>
              {subjectRows(true)}
              <p className="collection-note">Your semester, one lecture at a time.</p>
            </section>
          </div>
        </> : parts[0] === 'subjects' && !parts[1] ? <>
          <a className="back" href="#/">‹ Back to today</a>
          <div className="heading"><div><p className="muted">Winter semester 2026</p><h1>Choose a subject.</h1></div><span className="demo">4 subjects</span></div>
          <section className="picker">{subjectRows()}</section>
        </> : parts[0] === 'subjects' && subject ? <>
          <a className="back" href="#/subjects">‹ All subjects</a>
          <div className="heading"><div><p className="muted">{subject.total} cards · {subject.lectures.length} lectures</p><h1>{subject.name}</h1></div></div>
          <div className="layout">
            <aside className="today lecture-summary"><h2>Find your focus.</h2><p>Pick a lecture, or work through the subject at your own pace.</p><a className="primary" href={`#/study/${subject.id}/all`} onClick={() => setIndex(0)}>Study all lectures <span aria-hidden="true">↗</span></a></aside>
            <section><div className="section-title"><h2>Choose a lecture</h2><span>Demo cards</span></div><div className="lectures">
              {subject.lectures.map((l, i) => <a className="lecture" key={l.id} href={`#/study/${subject.id}/${l.id}`} onClick={() => setIndex(0)}><span className="lecture-number">{String(i + 1).padStart(2, '0')}</span><span className="lecture-name">{l.title}</span><span className="card-count">{l.cards.length}</span><span aria-hidden="true">›</span></a>)}
            </div></section>
          </div>
        </> : studying && card ? <>
          <a className="back" href={`#/subjects/${subject.id}`}>‹ {subject.name} lectures</a>
          <div className="study-heading"><div><p className="muted">{subject.name}</p><h1>{lecture?.title || 'All lectures'}</h1></div><span className="demo">Demo session</span></div>
          <section className="study-card">
            <div className="section-title"><span>Question</span><span>{index % cards.length + 1} of {cards.length}</span></div>
            <div className="question"><Markdown text={card.front}/></div>
            {revealed && <div className="revealed"><p className="muted">Answer</p><Markdown text={card.back}/></div>}
            {!revealed ? <a className="primary reveal-button" href={`${studyUrl}/answer`}>Show answer</a> : <div className="ratings">
              {['Again', 'Hard', 'Good'].map((label, i) => <button key={label} className={`rating rating-${i}`} onClick={() => { setIndex(index + 1); location.hash = studyUrl; }}><strong>{label}</strong><span>{['<1 min', '6 min', '1 day'][i]}</span></button>)}
            </div>}
          </section>
          <p className="study-note">Demo only. Ratings advance the card; no reviews are scheduled.</p>
        </> : parts[0] === 'calendar' ? <CalendarPage events={reviewEvents} /> : <><h1>Page not found.</h1><a className="back" href="#/subjects">Choose a subject</a></>}
        <footer><span>Built for what you want to remember.</span><span>Demo cards · display totals reflect your subjects</span></footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App/>);
