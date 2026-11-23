import type { CSSProperties } from 'react';
import type { Forecast } from '../forecast';
import { plural } from '../plural';

const shortDate = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/** Live forecast: when you'll have seen everything, minutes a day, reviews ahead (8 weeks). */
export function ForecastPanel({ forecast, name, color, examDate, examBuffer, today }: {
  forecast: Forecast | null; name: string; color: string; examDate?: Date; examBuffer?: number; today: Date;
}) {
  if (!forecast) return <section className="forecast" aria-busy="true"><p className="forecast-headline">Working out your pace…</p></section>;
  const f = forecast;
  const peak = Math.max(1, ...f.weeks.map((w) => w.reviewsPerDay));
  const headline = f.unseen === 0
    ? `You’ve seen every ${name} card. From here it’s reviews only.`
    : f.finishDate === null
      ? `New ${name} cards are paused. ${plural(f.unseen, 'card')} wait unseen.`
      : f.finishDay === 0
        ? `You’ll see the last ${plural(f.unseen, 'new card')} today.`
        : `You’ll have seen all ${f.unseen.toLocaleString()} ${name} cards by ${shortDate(f.finishDate)}.`;
  const deadline = examDate && examBuffer !== undefined ? new Date(examDate.getFullYear(), examDate.getMonth(), examDate.getDate() - examBuffer) : null;
  const warnings: string[] = [];
  if (deadline && f.unseen > 0 && (f.finishDate === null || f.finishDate > deadline)) warnings.push(`At this pace you won’t have seen everything ${examBuffer} days before the exam.`);
  if (f.heavy) warnings.push(`The busiest week needs about ${Math.round(f.busiestWeekMinutes)} minutes a day. That’s a lot to keep up.`);
  if (f.backlogGrowing) warnings.push(`Your review limit is below what’s due, so about ${Math.round(f.backlogEnd)} reviews pile up by week 8.`);
  const weekStart = (i: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i * 7);
  return (
    <section className="forecast" aria-label="Forecast" style={{ '--subject': color } as CSSProperties}>
      <p className="forecast-headline" aria-live="polite">{headline}</p>
      <div className="forecast-stats">
        <div className="forecast-stat"><span className="forecast-stat-value tabular">{Math.max(1, Math.round(f.firstWeekMinutes))} min</span><span className="forecast-stat-label">a day this week</span></div>
        <div className="forecast-stat"><span className="forecast-stat-value tabular">{Math.round(f.weeks.at(-1)?.reviewsPerDay ?? 0)}</span><span className="forecast-stat-label">reviews a day in week 8</span></div>
      </div>
      <figure className="forecast-chart" aria-label={`Reviews per day for the next 8 weeks: ${f.weeks.map((w) => Math.round(w.reviewsPerDay)).join(', ')}`}>
        <div className="forecast-bars">
          {f.weeks.map((w, i) => (
            <div key={i} className="forecast-bar-col">
              <span className="forecast-bar-value tabular">{Math.round(w.reviewsPerDay)}</span>
              <span className="forecast-bar-track"><span className="forecast-bar" style={{ transform: `scaleY(${Math.max(0.02, w.reviewsPerDay / peak)})` }} /></span>
              <span className="forecast-bar-label">{i === 0 ? 'Now' : shortDate(weekStart(i))}</span>
            </div>
          ))}
        </div>
        <figcaption className="forecast-caption">Reviews a day, averaged per week</figcaption>
      </figure>
      {warnings.length > 0 && (
        <ul className="forecast-warnings">
          {warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
    </section>
  );
}
