import { subjects } from '../demoSubjects';
import {
  formatDuration,
  formatPercent,
  parseDateKey,
  type DayStats,
} from './dailyStats';

const SUBJECT_META = new Map(
  subjects.map((subject, index) => [
    subject.id,
    {
      name: subject.name,
      icon: ['∑', '⌘', 'φ', '{}'][index] ?? '·',
    },
  ]),
);

function formatSelectedHeading(dateKey: string, referenceYear: number): {
  weekday: string;
  dateLine: string;
} {
  const { year, monthIndex, day } = parseDateKey(dateKey);
  const displayDate = new Date(year, monthIndex, day, 12, 0, 0);
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long' }).format(displayDate);
  const dateLine = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    ...(year !== referenceYear ? { year: 'numeric' } : {}),
  }).format(displayDate);
  return { weekday, dateLine };
}

function subjectLabel(subjectId: string): { name: string; icon: string; known: boolean } {
  const meta = SUBJECT_META.get(subjectId);
  if (meta) return { ...meta, known: true };
  const pretty = subjectId
    .split('-')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ');
  return { name: pretty || subjectId, icon: '·', known: false };
}

interface DayDetailPanelProps {
  dateKey: string;
  stats: DayStats | undefined;
  isToday: boolean;
  isFuture: boolean;
  referenceYear: number;
}

export function DayDetailPanel({
  dateKey,
  stats,
  isToday,
  isFuture,
  referenceYear,
}: DayDetailPanelProps) {
  const { weekday, dateLine } = formatSelectedHeading(dateKey, referenceYear);
  const hasStudy = Boolean(stats && stats.cardsStudied > 0);

  if (!hasStudy || !stats) {
    return (
      <aside className="cal-detail cal-detail-empty" aria-label={`Study details for ${weekday}, ${dateLine}`}>
        <div className="cal-detail-head">
          <div>
            <p className="cal-detail-weekday">{weekday}</p>
            <h2 className="cal-detail-date">{dateLine}</h2>
          </div>
          {isToday && <span className="cal-badge">Today</span>}
        </div>

        <div className="cal-empty-body">
          <p className="cal-empty-title">
            {isFuture ? 'Upcoming day' : isToday ? 'No reviews logged yet' : 'Rest day'}
          </p>
          <p className="cal-empty-copy">
            {isFuture
              ? 'Study sessions you complete on this day will appear here automatically.'
              : isToday
                ? 'A short session keeps recall steady without crowding your week.'
                : 'No cards were reviewed on this date. Quiet days are part of a sustainable pace.'}
          </p>
          {isToday ? (
            <a className="primary cal-empty-cta" href="#/subjects">
              Study now <span aria-hidden="true">↗</span>
            </a>
          ) : !isFuture ? (
            <a className="text-link" href="#/subjects">
              Choose a subject
            </a>
          ) : null}
        </div>
      </aside>
    );
  }

  const total = stats.cardsStudied;
  const correctPct = (stats.correct / total) * 100;
  const hardPct = (stats.hard / total) * 100;
  const mistakePct = (stats.mistakes / total) * 100;
  const maxSubjectCards = Math.max(...stats.subjects.map((s) => s.cardsStudied), 1);

  return (
    <aside className="cal-detail" aria-label={`Study details for ${weekday}, ${dateLine}`}>
      <div className="cal-detail-head">
        <div>
          <p className="cal-detail-weekday">{weekday}</p>
          <h2 className="cal-detail-date">{dateLine}</h2>
        </div>
        {isToday && <span className="cal-badge">Today</span>}
      </div>

      <div className="cal-hero-metrics">
        <div className="cal-hero-metric">
          <span className="cal-metric-label">Time studied</span>
          <strong className="cal-metric-big">{formatDuration(stats.durationMs)}</strong>
        </div>
        <div className="cal-hero-metric">
          <span className="cal-metric-label">Cards studied</span>
          <strong className="cal-metric-big">{stats.cardsStudied}</strong>
        </div>
      </div>

      <dl className="cal-sub-metrics">
        <div className="cal-sub-metric">
          <dt>New cards learned</dt>
          <dd>{stats.newCardsLearned}</dd>
        </div>
        <div className="cal-sub-metric">
          <dt>Accuracy</dt>
          <dd>{formatPercent(stats.accuracy)}</dd>
        </div>
      </dl>

      <section className="cal-section" aria-label="Answer ratings">
        <div className="cal-section-head">
          <h3>Ratings</h3>
          <span className="cal-section-note">{stats.correct} of {total} correct</span>
        </div>

        <div
          className="cal-rating-bar"
          role="img"
          aria-label={`${stats.correct} correct, ${stats.hard} hard, ${stats.mistakes} mistakes`}
        >
          {stats.correct > 0 && (
            <span
              className="cal-bar-seg cal-bar-correct"
              style={{ width: `${correctPct}%` }}
            />
          )}
          {stats.hard > 0 && (
            <span
              className="cal-bar-seg cal-bar-hard"
              style={{ width: `${hardPct}%` }}
            />
          )}
          {stats.mistakes > 0 && (
            <span
              className="cal-bar-seg cal-bar-mistake"
              style={{ width: `${mistakePct}%` }}
            />
          )}
        </div>

        <dl className="cal-rating-list">
          <div className="cal-rating-item">
            <dt>
              <span className="cal-dot cal-dot-correct" aria-hidden="true" />
              Correct
            </dt>
            <dd>
              <strong>{stats.correct}</strong>
              <span>Good + Easy</span>
            </dd>
          </div>
          <div className="cal-rating-item">
            <dt>
              <span className="cal-dot cal-dot-hard" aria-hidden="true" />
              Hard
            </dt>
            <dd>
              <strong>{stats.hard}</strong>
              <span>Needed effort</span>
            </dd>
          </div>
          <div className="cal-rating-item">
            <dt>
              <span className="cal-dot cal-dot-mistake" aria-hidden="true" />
              Mistakes
            </dt>
            <dd>
              <strong>{stats.mistakes}</strong>
              <span>Again</span>
            </dd>
          </div>
        </dl>
      </section>

      <section className="cal-section" aria-label="Per-subject breakdown">
        <div className="cal-section-head">
          <h3>By subject</h3>
          <span className="cal-section-note">
            {stats.subjects.length} {stats.subjects.length === 1 ? 'subject' : 'subjects'}
          </span>
        </div>

        <ul className="cal-subject-list">
          {stats.subjects.map((subject) => {
            const meta = subjectLabel(subject.subjectId);
            const barWidth = Math.max(8, Math.round((subject.cardsStudied / maxSubjectCards) * 100));
            const inner = (
              <>
                <span className="cal-subject-icon" aria-hidden="true">
                  {meta.icon}
                </span>
                <div className="cal-subject-body">
                  <div className="cal-subject-top">
                    <span className="cal-subject-name">{meta.name}</span>
                    <span className="cal-subject-count">
                      {subject.cardsStudied} {subject.cardsStudied === 1 ? 'card' : 'cards'}
                    </span>
                  </div>
                  <div className="cal-subject-meta">
                    <span>{formatDuration(subject.durationMs)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatPercent(subject.accuracy)} accuracy</span>
                    {subject.newCardsLearned > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{subject.newCardsLearned} new</span>
                      </>
                    )}
                  </div>
                  <div className="cal-subject-track" aria-hidden="true">
                    <span className="cal-subject-fill" style={{ width: `${barWidth}%` }} />
                  </div>
                </div>
              </>
            );

            return (
              <li key={subject.subjectId} className="cal-subject-row">
                {meta.known ? (
                  <a className="cal-subject-link" href={`#/subjects/${subject.subjectId}`}>
                    {inner}
                  </a>
                ) : (
                  <div className="cal-subject-link">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  );
}
