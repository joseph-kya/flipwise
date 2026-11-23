import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { subjects, type Subject } from './demoSubjects';
import './style.css';
import { readReviews, appendReview, type ReviewEvent, type Rating } from './reviewLog';
import { mastery } from './mastery';
import { sessionStats } from './sessionStats';
import { Markdown } from './markdown';

function App() {
  const [hash, setHash] = useState(location.hash || '#/');
  const [dark, setDark] = useState(false);
  const [index, setIndex] = useState(0);
  const [log, setLog] = useState<ReviewEvent[]>(readReviews);
  const [session, setSession] = useState<ReviewEvent[]>([]);
  const [started, setStarted] = useState(Date.now());
  const [cardStarted, setCardStarted] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [confirmed, setConfirmed] = useState<Rating | null>(null);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
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
  const card = cards[index];
  const revealed = parts[3] === 'answer';
  const studyUrl = subject ? `#/study/${subject.id}/${parts[2]}` : '';
  useEffect(() => { setIndex(0); setSession([]); setStarted(Date.now()); setCardStarted(Date.now()); }, [parts[1], parts[2]]);
  const rate = (rating: Rating) => {
    if (!subject || !card || !revealed || confirmed) return;
    const lesson = subject.lectures.find(l => l.cards.includes(card))!;
    const cardId = `${subject.id}/${lesson.id}/${card.id}`;
    const event: ReviewEvent = { id: crypto.randomUUID(), cardId, subjectId: subject.id, lessonId: lesson.id, rating, at: new Date().toISOString(), durationMs: Date.now() - cardStarted, isNew: !log.some(e => e.cardId === cardId) };
    setLog(appendReview(event)); setSession(events => [...events, event]); setConfirmed(rating);
    setTimeout(() => { setIndex(i => i + 1); setConfirmed(null); setCardStarted(Date.now()); location.hash = studyUrl; window.scrollTo(0, 0); }, 180);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!studying || !card || e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof HTMLElement && e.target.closest('input,textarea,select,[contenteditable]'))) return;
      if (e.code === 'Space') { e.preventDefault(); if (!revealed) location.hash = `${studyUrl}/answer`; }
      const rating = (['again','hard','good','easy'] as Rating[])[Number(e.key)-1];
      if (rating && revealed) { e.preventDefault(); rate(rating); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  const stats = sessionStats(session, cards.length);
  const statsPanel = <aside className="stats" aria-label="Session stats"><strong>Session</strong><span>{stats.done} done · {stats.remaining} remaining</span><span>{stats.right} right · {stats.again} again · {stats.hard} hard</span><span>{stats.accuracy}% accuracy · {Math.floor(Math.max(0,now-started)/60000)}:{String(Math.floor(Math.max(0,now-started)/1000)%60).padStart(2,'0')}</span><div className="streak" aria-label="Recent ratings">{session.slice(-10).map(e=><span key={e.id} className={`pip ${e.rating}`} title={e.rating}>{e.rating[0].toUpperCase()}</span>)}</div></aside>;
  const subjectRows = (_compact = false) => subjects.map((s: Subject, i) => (
    <details key={s.id}><summary className="subject-row"><span className="subject-icon">{['∑', '⌘', 'φ', '{}'][i]}</span><span className="subject-copy"><small className="muted">{['Limits, change and continuity','Motion, sensing and control','The laws of the physical world','Thinking in algorithms'][i]}</small><strong>{s.name}</strong><span className="muted">{s.total} cards · {s.lectures.length} lessons</span></span><span>⌄</span></summary><div className="lectures">{s.lectures.map((l,i)=><a className="lecture" key={l.id} href={`#/study/${s.id}/${l.id}`}><span aria-hidden="true">{['∿','◇','◎','⌁'][i%4]}</span><span className="lecture-name">{l.title}</span><span className={`mastery ${mastery(log,s.id,l.id,l.cards.map(c=>`${s.id}/${l.id}/${c.id}`)).label.toLowerCase().replace(" ","-")}`}>{mastery(log,s.id,l.id,l.cards.map(c=>`${s.id}/${l.id}/${c.id}`)).label === "Not started" ? "✕ " : "● "}{mastery(log,s.id,l.id,l.cards.map(c=>`${s.id}/${l.id}/${c.id}`)).label}</span><span className="card-count">{l.cards.length}</span></a>)}</div></details>
  ));
  return (
    <div className={dark ? 'app dark' : 'app'}>
      <header>
        <a className="brand" href="#/"><span className="mark">f</span>flipwise<span className="brand-dot">.</span></a>
        <span className="header-note">A little practice. Lasting knowledge.</span>
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
              {subject.lectures.map((l, i) => <a className="lecture" key={l.id} href={`#/study/${subject.id}/${l.id}`} onClick={() => setIndex(0)}><span className="lecture-number">{['∿','◇','◎','⌁'][i%4]}</span><span className="lecture-name">{l.title}</span><span className="card-count">{l.cards.length}</span><span aria-hidden="true">›</span></a>)}
            </div></section>
          </div>
        </> : studying && card ? <>
          <a className="back" href={`#/subjects/${subject.id}`}>‹ {subject.name} lectures</a>
          <div className="study-heading"><div><p className="muted">{subject.name}</p><h1>{lecture?.title || 'All lectures'}</h1></div><span className="demo">Demo session</span></div>
          {statsPanel}<section className={`study-card ${confirmed ? "leaving" : ""}`} key={index}>
            <div className="section-title"><span>Question</span><span>{index % cards.length + 1} of {cards.length}</span></div>
            <div className="question"><Markdown text={card.front}/></div>
            {revealed && <div className="revealed"><p className="muted">Answer</p><Markdown text={card.back}/></div>}
            {!revealed ? <a className="primary reveal-button" href={`${studyUrl}/answer`}>Show answer</a> : <div className="ratings">
              {(['again','hard','good','easy'] as Rating[]).map((r,i) => <button key={r} className={`rating ${r} ${confirmed === r ? 'confirmed' : ''}`} disabled={!!confirmed} onClick={() => rate(r)}><strong>{['Again','Hard','Good','Easy'][i]}</strong><span>{['Try again','Difficult','Remembered','Aced it'][i]}</span><kbd>{i+1}</kbd></button>)}
            </div>}
          </section>
          <p className="study-note">Space to reveal · 1–4 to rate. Reviews saved on this device.</p>
        </> : studying ? <><h1>Session complete.</h1>{statsPanel}<p>You reviewed {stats.done} cards. Take a breath.</p><a className="back" href="#/subjects">Back to subjects</a></> : <><h1>Page not found.</h1><a className="back" href="#/subjects">Choose a subject</a></>}
        <footer><span>Built for what you want to remember.</span><span>Demo cards · display totals reflect your subjects</span></footer>
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App/>);
