import { subjects } from '../demoSubjects';
import {
  formatDuration,
  formatPercent,
  parseDateKey,
  type DayStats,
} from './dailyStats';
import { ChevronRight, SubjectIcon } from '../ui';

const SUBJECT_NAMES = new Map(subjects.map((subject) => [subject.id, subject.name]));

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

function subjectInfo(subjectId: string): { name: string; known: boolean } {
  const name = SUBJECT_NAMES.get(subjectId);
  if (name) return { name, known: true };
  const pretty = subjectId
    .split('-')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ');
  return { name: pretty || subjectId, known: false };
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
      <aside className="cal-detail" aria-label={`Study details for ${weekday}, ${dateLine}`}>
        <div className="cal-detail-head">
          <h2 className="cal-detail-title">
            {weekday}, {dateLine}
          </h2>
          {isToday && <span className="cal-detail-today">Today</span>}
        </div>

        <div className="group group-pad">
          <div className="row-title" style={{ marginBottom: '4px' }}>
            {isFuture ? 'Upcoming day' : isToday ? 'No reviews yet' : 'No study recorded'}
          </div>
          <p className="row-sub" style={{ margin: 0 }}>
            {isFuture
              ? 'Sessions completed on this date will appear here.'
              : isToday
                ? 'Start a session to log reviews for today.'
                : 'No cards were reviewed on this date.'}
          </p>
          {isToday && (
            <div style={{ marginTop: '16px' }}>
              <a className="btn btn-primary btn-full" href="#/subjects">
                Study
              </a>
            </div>
          )}
        </div>
      </aside>
    );
  }

  const metricRows: ReadonlyArray<[string, string]> = [
    ['Time studied', formatDuration(stats.durationMs)],
    ['Cards studied', String(stats.cardsStudied)],
    ['New learned', String(stats.newCardsLearned)],
    ['Correct', `${stats.correct} · ${formatPercent(stats.accuracy)}`],
    ['Hard', String(stats.hard)],
    ['Mistakes', String(stats.mistakes)],
  ];

  return (
    <aside className="cal-detail" aria-label={`Study details for ${weekday}, ${dateLine}`}>
      <div className="cal-detail-head">
        <h2 className="cal-detail-title">
          {weekday}, {dateLine}
        </h2>
        {isToday && <span className="cal-detail-today">Today</span>}
      </div>

      <div className="group group-divider" aria-label="Day summary">
        {metricRows.map(([label, value]) => (
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

      <section aria-label="By subject">
        <div className="section-head">
          <h3 className="section-title">By subject</h3>
        </div>
        <ul className="group group-list group-divider group-icons">
          {stats.subjects.map((subject) => {
            const meta = subjectInfo(subject.subjectId);
            const content = (
              <>
                <span className="subject-tile">
                  <SubjectIcon subjectId={subject.subjectId} />
                </span>
                <span className="row-main">
                  <span className="row-title" style={{ fontSize: 'var(--text-sm)' }}>
                    {meta.name}
                  </span>
                  <span className="row-sub tabular">
                    {formatDuration(subject.durationMs)} · {formatPercent(subject.accuracy)}
                    {subject.newCardsLearned > 0 ? ` · ${subject.newCardsLearned} new` : ''}
                  </span>
                </span>
                <span className="row-value">
                  {subject.cardsStudied} {subject.cardsStudied === 1 ? 'card' : 'cards'}
                </span>
                {meta.known && <ChevronRight size={14} className="row-chevron" />}
              </>
            );

            return (
              <li key={subject.subjectId}>
                {meta.known ? (
                  <a
                    className="group-row group-row-interactive"
                    href={`#/subjects/${subject.subjectId}`}
                  >
                    {content}
                  </a>
                ) : (
                  <div className="group-row">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </aside>
  );
}
