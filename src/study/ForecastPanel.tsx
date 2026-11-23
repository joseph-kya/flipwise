import type { CSSProperties } from 'react';
import type { Forecast } from '../forecast';
import { plural } from '../plural';

function shortDate(d: Date, today: Date): string {
  const daysAway = Math.round((+d - +today) / 86_400_000);
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(daysAway > 330 ? { year: 'numeric' } : {}),
  });
}

function formatMinutes(min: number): string {
  if (min <= 0.05) return '0 min';
  if (min < 1) return '<1 min';
  return `${Math.round(min)} min`;
}

/** Live forecast: when you'll have seen everything, minutes a day, reviews ahead (8 weeks). */
export function ForecastPanel({
  forecast,
  name,
  color,
  totalCards,
  examDate,
  examBuffer,
  secPerAnswer,
  today,
}: {
  forecast: Forecast | null;
  name: string;
  color: string;
  totalCards?: number;
  examDate?: Date;
  examBuffer?: number;
  secPerAnswer?: number;
  today: Date;
}) {
  if (!forecast) {
    return (
      <section className="forecast" aria-busy="true" style={{ '--subject': color } as CSSProperties}>
        <p className="forecast-headline">Working out your pace…</p>
      </section>
    );
  }
  const f = forecast;
  const peak = Math.max(1, ...f.weeks.map((w) => w.reviewsPerDay));
  const isAll = name === 'all';
  const subjectLabel = isAll ? '' : `${name} `;

  const headline =
    totalCards === 0
      ? isAll
        ? 'No cards yet.'
        : `No cards in ${name} yet.`
      : f.unseen === 0
        ? isAll
          ? 'You’ve seen every card. From here it’s reviews only.'
          : `You’ve seen every ${name} card. From here it’s reviews only.`
        : f.finishDate === null
          ? isAll
            ? `New cards are paused. ${plural(f.unseen, 'card')} wait unseen.`
            : `New ${name} cards are paused. ${plural(f.unseen, 'card')} wait unseen.`
          : f.finishDay === 0
            ? `You’ll see the last ${plural(f.unseen, 'new card')} today.`
            : `You’ll have seen all ${f.unseen.toLocaleString()} ${subjectLabel}cards by ${shortDate(f.finishDate, today)}.`;

  const deadline =
    examDate && examBuffer !== undefined
      ? new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate() - examBuffer)
      : null;
  const warnings: string[] = [];
  if (deadline && f.unseen > 0 && (f.finishDate === null || f.finishDate > deadline)) {
    warnings.push(`At this pace you won’t finish ${examBuffer} days before the exam (${shortDate(examDate!, today)}).`);
  }
  if (f.heavy) {
    warnings.push(`The busiest week needs about ${Math.round(f.busiestWeekMinutes)} min/day. That’s a lot to sustain.`);
  }
  if (f.backlogGrowing) {
    warnings.push(`Your review limit is below demand, so about ${Math.round(f.backlogEnd)} reviews pile up by week 8.`);
  }

  const weekStart = (i: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i * 7);
  const week8Reviews = Math.round(f.weeks.at(-1)?.reviewsPerDay ?? 0);
  const endDate = weekStart(f.weeks.length - 1);

  return (
    <section className="forecast" aria-label="Forecast" style={{ '--subject': color } as CSSProperties}>
      <div className="forecast-kicker">Forecast</div>
      <p className="forecast-headline" aria-live="polite">{headline}</p>
      <div className="forecast-stats">
        <div className="forecast-stat">
          <span className="forecast-stat-value tabular">{formatMinutes(f.firstWeekMinutes)}</span>
          <span className="forecast-stat-label">
            a day this week
            {f.busiestWeekMinutes > f.firstWeekMinutes + 4 && (
              <> · peak {Math.round(f.busiestWeekMinutes)}m</>
            )}
          </span>
        </div>
        <div className="forecast-stat">
          <span className="forecast-stat-value tabular">{week8Reviews}</span>
          <span className="forecast-stat-label">reviews / day in week 8</span>
        </div>
      </div>
      <figure
        className="forecast-chart"
        aria-label={`Reviews per day for the next 8 weeks: ${f.weeks.map((w) => Math.round(w.reviewsPerDay)).join(', ')}`}
      >
        <div className="forecast-bars">
          {f.weeks.map((w, i) => {
            const ratio = w.reviewsPerDay <= 0 ? 0 : Math.max(0.05, w.reviewsPerDay / peak);
            return (
              <div key={i} className="forecast-bar-col" title={`Week of ${shortDate(weekStart(i), today)}: ${Math.round(w.reviewsPerDay)} reviews/day, ~${formatMinutes(w.minutesPerDay)}/day`}>
                <span className="forecast-bar-value tabular">{Math.round(w.reviewsPerDay)}</span>
                <span className="forecast-bar-track">
                  <span className="forecast-bar" style={{ transform: `scaleY(${ratio})` }} />
                </span>
                <span className="forecast-bar-label">{i === 0 ? 'Now' : `W${i + 1}`}</span>
              </div>
            );
          })}
        </div>
        <figcaption className="forecast-caption">
          Reviews / day · {shortDate(today, today)} – {shortDate(endDate, today)}
          {secPerAnswer !== undefined && <> · ~{Math.round(secPerAnswer)} s/card</>}
        </figcaption>
      </figure>
      {warnings.length > 0 && (
        <ul className="forecast-warnings" role="status">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
