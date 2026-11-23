import { useSubjects } from '../contentCatalog';
import {
  formatDuration,
  formatPercent,
  parseDateKey,
  type DayStats,
} from './dailyStats';
import {
  Button,
  Group,
  NavRow,
  Row,
  SectionHeader,
  SubjectTile,
  formatSubjectDisplay,
} from '../ui';

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
  const subjects = useSubjects();
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

        <Group divider={false} padded className="cal-empty-card">
          <div className="row-title">
            {isFuture ? 'Upcoming day' : isToday ? 'No reviews yet' : 'No study recorded'}
          </div>
          <p className="cal-empty-sub">
            {isFuture
              ? 'Sessions completed on this date will appear here.'
              : isToday
                ? 'Start a session to log reviews for today.'
                : 'No cards were reviewed on this date.'}
          </p>
          {isToday && (
            <div className="cal-empty-cta">
              <Button variant="primary" size="full" href="#/subjects">
                Study
              </Button>
            </div>
          )}
        </Group>
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

      <Group ariaLabel="Day summary">
        {metricRows.map(([label, value]) => (
          <Row key={label} title={label} value={value} valueStrong />
        ))}
      </Group>

      <section aria-label="By subject">
        <SectionHeader title="By subject" />
        <Group inset="icons" ariaLabel="Subjects studied">
          {stats.subjects.map((subject) => {
            const meta = formatSubjectDisplay(subject.subjectId, subjects);
            const statsLine = `${formatDuration(subject.durationMs)} · ${formatPercent(subject.accuracy)}${
              subject.newCardsLearned > 0 ? ` · ${subject.newCardsLearned} new` : ''
            }`;
            const subtitle = meta.subtitle ? `${meta.subtitle} · ${statsLine}` : statsLine;
            const leading = (
              <SubjectTile subjectId={subject.subjectId} name={meta.name} />
            );
            const value = `${subject.cardsStudied} ${subject.cardsStudied === 1 ? 'card' : 'cards'}`;

            return meta.known ? (
              <NavRow
                key={subject.subjectId}
                href={`#/subjects/${subject.subjectId}`}
                leading={leading}
                title={meta.name}
                subtitle={subtitle}
                value={value}
              />
            ) : (
              <Row
                key={subject.subjectId}
                leading={leading}
                title={meta.name}
                subtitle={subtitle}
                value={value}
              />
            );
          })}
        </Group>
      </section>
    </aside>
  );
}
