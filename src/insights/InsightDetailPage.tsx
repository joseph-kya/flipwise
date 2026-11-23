import { useState } from 'react';
import { formatDuration } from '../calendar/dailyStats';
import { subjects } from '../demoSubjects';
import type { EffectiveMotion } from '../settings';
import { ChevronLeft, ChevronRight, FlameIcon, SegmentedControl } from '../ui';
import type { ChartId, InsightsData, RangeKey, SubjectFilter } from './aggregate';
import { AreaLine, Bars, Donut, Histogram, StackedBars, YearHeatmap } from './Charts';
import { cleanCardFront, InsightsFilterBar, STATE_COLORS, toDonutSlices } from './InsightsView';

const CHART_META: Record<ChartId, { title: string; subtitle: string }> = {
  heatmap: { title: 'Activity', subtitle: 'Full-year review consistency' },
  reviews: { title: 'Daily reviews', subtitle: 'Answer volume split by rating' },
  time: { title: 'Time studied', subtitle: 'Total time spent reviewing' },
  retention: { title: 'True retention', subtitle: 'Review-state recall vs your FSRS target' },
  forecast: { title: '30-day forecast', subtitle: 'Upcoming scheduled workload' },
  states: { title: 'Card states', subtitle: 'Maturity breakdown across your deck' },
  distributions: { title: 'Distributions', subtitle: 'Interval, difficulty, and memory stability' },
  hourly: { title: 'Hourly breakdown', subtitle: 'Volume and accuracy across the day' },
  subjects: { title: 'Subjects & lessons', subtitle: 'Accuracy and mastery by topic' },
  streaks: { title: 'Streaks', subtitle: 'Consistency and active study days' },
  leeches: { title: 'Leeches & hardest cards', subtitle: 'Cards with the most lapses and highest difficulty' },
  'answer-time': { title: 'Answer time', subtitle: 'Seconds spent thinking before rating' },
};

export function isValidChartId(value: string | undefined): value is ChartId {
  return Boolean(value && value in CHART_META);
}

type DistTab = 'interval' | 'difficulty' | 'stability';
const DIST_OPTIONS: ReadonlyArray<{ value: DistTab; label: string }> = [
  { value: 'interval', label: 'Interval' },
  { value: 'difficulty', label: 'Difficulty' },
  { value: 'stability', label: 'Stability' },
];

function BreakdownRow({
  label,
  sub,
  value,
  dotColor,
  href,
}: {
  label: string;
  sub?: string;
  value: string;
  dotColor?: string;
  href?: string;
}) {
  const inner = (
    <>
      {dotColor && (
        <span className="donut-dot" style={{ background: dotColor, marginTop: 2 }} aria-hidden="true" />
      )}
      <span className="row-main">
        <span className="row-title" style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
          {label}
        </span>
        {sub && <span className="row-sub">{sub}</span>}
      </span>
      <span className="row-value row-value-strong tabular">{value}</span>
      {href && <ChevronRight size={14} className="row-chevron" />}
    </>
  );

  if (href) {
    return (
      <a className="group-row group-row-interactive" href={href}>
        {inner}
      </a>
    );
  }
  return <div className="group-row">{inner}</div>;
}

export function InsightDetailPage({
  chartId,
  data,
  range,
  subjectId,
  motion,
  onRangeChange,
  onSubjectChange,
}: {
  chartId: ChartId;
  data: InsightsData;
  range: RangeKey;
  subjectId: SubjectFilter;
  motion: EffectiveMotion;
  onRangeChange: (next: RangeKey) => void;
  onSubjectChange: (next: SubjectFilter) => void;
}) {
  const [distTab, setDistTab] = useState<DistTab>('interval');
  const meta = CHART_META[chartId];
  const subjectLabel =
    subjectId === 'all'
      ? 'All subjects'
      : subjects.find((s) => s.id === subjectId)?.name ?? subjectId;

  const showRange = chartId !== 'forecast';

  return (
    <div className="section-stack insights-stack">
      <div>
        <a className="back-link" href="#/insights">
          <ChevronLeft size={16} />
          Insights
        </a>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <h1 className="page-title">{meta.title}</h1>
          <p className="page-sub">
            {meta.subtitle}
            {showRange ? ` · ${range}` : ''} · {subjectLabel}
          </p>
        </div>
      </div>

      <InsightsFilterBar
        range={range}
        subjectId={subjectId}
        onRangeChange={onRangeChange}
        onSubjectChange={onSubjectChange}
        showRange={showRange}
      />

      {chartId === 'heatmap' && (
        <>
          <section className="group insight-detail-card">
            <div className="insight-detail-metric tabular">
              {data.heatmap.totalYearReviews.toLocaleString()} reviews
            </div>
            <YearHeatmap
              cells={data.heatmap.cells}
              weeks={data.heatmap.weeks}
              monthLabels={data.heatmap.monthLabels}
              interactive
              motion={motion}
              ariaLabel="Interactive full-year activity heatmap"
            />
          </section>
          <section aria-label="Activity breakdown">
            <div className="section-head">
              <h2 className="section-title">Summary</h2>
            </div>
            <div className="group group-divider">
              <BreakdownRow label="Total reviews (past year)" value={data.heatmap.totalYearReviews.toLocaleString()} />
              <BreakdownRow label="Active study days" value={`${data.heatmap.activeYearDays} days`} />
              <BreakdownRow
                label="Average per active day"
                value={
                  data.heatmap.activeYearDays > 0
                    ? `${Math.round(data.heatmap.totalYearReviews / data.heatmap.activeYearDays)} reviews`
                    : '—'
                }
              />
              {(() => {
                const peak = [...data.heatmap.cells].sort((a, b) => b.count - a.count)[0];
                return peak && peak.count > 0 ? (
                  <BreakdownRow label="Busiest day" sub={peak.dateKey} value={`${peak.count} reviews`} />
                ) : null;
              })()}
            </div>
          </section>
        </>
      )}

      {chartId === 'reviews' && (
        <>
          <section className="group insight-detail-card">
            <div className="insight-detail-metric tabular">
              {data.reviews.total.toLocaleString()} reviews
            </div>
            <StackedBars
              buckets={data.reviews.buckets}
              height={230}
              interactive
              xLabels
              motion={motion}
              ariaLabel="Interactive daily reviews stacked bar chart"
            />
          </section>
          <section aria-label="Rating breakdown">
            <div className="section-head">
              <h2 className="section-title">By rating</h2>
            </div>
            <div className="group group-divider">
              {(
                [
                  ['easy', 'Easy', 'var(--sem-green-dot)'],
                  ['good', 'Good', 'var(--sem-yellow-dot)'],
                  ['hard', 'Hard', 'var(--sem-orange-dot)'],
                  ['again', 'Again', 'var(--sem-red-dot)'],
                ] as const
              ).map(([key, label, dot]) => {
                const count = data.reviews.totalsByRating[key];
                const pct = data.reviews.total > 0 ? Math.round((count / data.reviews.total) * 100) : 0;
                return (
                  <BreakdownRow
                    key={key}
                    label={label}
                    dotColor={dot}
                    value={`${count} (${pct}%)`}
                  />
                );
              })}
              <BreakdownRow label="Daily average" value={`${data.reviews.avgPerDay} / day`} />
            </div>
          </section>
        </>
      )}

      {chartId === 'time' && (
        <>
          <section className="group insight-detail-card">
            <div className="insight-detail-metric tabular">{formatDuration(data.time.totalMs)}</div>
            <Bars
              items={data.time.buckets.map((b) => ({
                key: b.key,
                label: b.label,
                value: b.minutes,
                sublabel: formatDuration(b.durationMs),
              }))}
              height={230}
              interactive
              xLabels
              formatValue={(v) => `${v}m`}
              motion={motion}
              ariaLabel="Interactive time studied chart"
            />
          </section>
          <section aria-label="Time breakdown">
            <div className="section-head">
              <h2 className="section-title">Summary</h2>
            </div>
            <div className="group group-divider">
              <BreakdownRow label="Total time in range" value={formatDuration(data.time.totalMs)} />
              <BreakdownRow
                label="Average per active day"
                value={data.time.avgMsPerActiveDay > 0 ? formatDuration(data.time.avgMsPerActiveDay) : '—'}
              />
              {(() => {
                const peak = [...data.time.buckets].sort((a, b) => b.durationMs - a.durationMs)[0];
                return peak && peak.durationMs > 0 ? (
                  <BreakdownRow label="Longest period" sub={peak.label} value={formatDuration(peak.durationMs)} />
                ) : null;
              })()}
            </div>
          </section>
        </>
      )}

      {chartId === 'retention' && (
        <>
          <section className="group insight-detail-card">
            <div className="insight-detail-metric tabular">
              {data.retention.overallRate !== null ? `${data.retention.overallRate}%` : '—'}
            </div>
            {data.retention.points.length > 0 ? (
              <AreaLine
                points={data.retention.points.map((p) => ({
                  key: p.key,
                  label: p.label,
                  value: p.rate,
                  sublabel: `${p.passed}/${p.total} passed`,
                }))}
                height={235}
                yMin={50}
                yMax={100}
                targetValue={data.retention.targetPercent}
                targetLabel={`Target ${data.retention.targetPercent}%`}
                interactive
                xLabels
                motion={motion}
                ariaLabel="Interactive true retention chart"
              />
            ) : (
              <div className="insight-empty">No review-state answers recorded in this range yet.</div>
            )}
          </section>
          <section aria-label="Retention breakdown">
            <div className="section-head">
              <h2 className="section-title">Breakdown</h2>
            </div>
            <div className="group group-divider">
              <BreakdownRow
                label="True retention"
                sub="Review-state cards not rated Again"
                value={data.retention.overallRate !== null ? `${data.retention.overallRate}%` : '—'}
              />
              <BreakdownRow label="Desired target" value={`${data.retention.targetPercent}%`} />
              <BreakdownRow
                label="Passed reviews"
                value={`${data.retention.reviewPassed} / ${data.retention.reviewTotal}`}
              />
              {data.retention.overallRate !== null && (
                <BreakdownRow
                  label="Difference vs target"
                  value={`${data.retention.overallRate - data.retention.targetPercent >= 0 ? '+' : ''}${
                    data.retention.overallRate - data.retention.targetPercent
                  }%`}
                />
              )}
            </div>
          </section>
        </>
      )}

      {chartId === 'forecast' && (
        <>
          <section className="group insight-detail-card">
            <div className="insight-detail-metric tabular">{data.forecast.dueNext30} due in 30d</div>
            <Bars
              items={data.forecast.days.map((d) => ({
                key: d.dateKey,
                label: d.label,
                value: d.count,
                highlight: d.dayOffset === 0,
                sublabel: `${d.cumulative} cumulative`,
              }))}
              height={230}
              interactive
              xLabels
              formatValue={(v) => `${v} ${v === 1 ? 'card' : 'cards'}`}
              motion={motion}
              ariaLabel="Interactive 30-day forecast chart"
            />
          </section>
          <section aria-label="Upcoming schedule">
            <div className="section-head">
              <h2 className="section-title">Workload</h2>
            </div>
            <div className="group group-divider">
              <BreakdownRow label="Due today (including overdue)" value={`${data.forecast.dueToday}`} />
              <BreakdownRow label="Due in next 7 days" value={`${data.forecast.dueNext7}`} />
              <BreakdownRow label="Due in next 30 days" value={`${data.forecast.dueNext30}`} />
              {data.forecast.days.slice(0, 7).map((d) => (
                <BreakdownRow
                  key={d.dateKey}
                  label={d.label}
                  sub={d.dateKey}
                  value={`${d.count} due`}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {chartId === 'states' && (
        <>
          <section className="group insight-detail-card insight-detail-donut">
            <Donut
              slices={toDonutSlices(data)}
              centerValue={String(data.states.total)}
              centerLabel="total cards"
              size={188}
              interactive
              motion={motion}
              ariaLabel="Interactive card states donut chart"
            />
          </section>
          <section aria-label="State breakdown">
            <div className="section-head">
              <h2 className="section-title">Card states</h2>
            </div>
            <div className="group group-divider">
              {data.states.slices.map((s) => (
                <BreakdownRow
                  key={s.id}
                  label={s.label}
                  dotColor={STATE_COLORS[s.id]}
                  sub={
                    s.id === 'mature'
                      ? 'Scheduled interval 21 days or longer'
                      : s.id === 'young'
                        ? 'In review with interval under 21 days'
                        : s.id === 'learning'
                          ? 'Learning or relearning steps'
                          : s.id === 'leech'
                            ? '8 or more lapses'
                            : 'Not yet studied'
                  }
                  value={`${s.count} (${s.percent}%)`}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {chartId === 'distributions' && (
        <>
          <section className="group insight-detail-card">
            <div className="insight-detail-dist-head">
              <div className="insight-detail-metric tabular">
                {distTab === 'interval'
                  ? `${data.distributions.medianIntervalDays}d median`
                  : distTab === 'difficulty'
                    ? `${data.distributions.avgDifficulty} / 10 avg`
                    : `${data.distributions.medianStabilityDays}d median`}
              </div>
              <div className="insight-detail-seg">
                <SegmentedControl
                  ariaLabel="Distribution type"
                  options={DIST_OPTIONS}
                  value={distTab}
                  onChange={setDistTab}
                />
              </div>
            </div>
            <Histogram
              bins={
                distTab === 'interval'
                  ? data.distributions.interval
                  : distTab === 'difficulty'
                    ? data.distributions.difficulty
                    : data.distributions.stability
              }
              height={230}
              interactive
              motion={motion}
              ariaLabel={`Interactive ${distTab} histogram`}
            />
          </section>
          <section aria-label="Distribution summary">
            <div className="section-head">
              <h2 className="section-title">FSRS parameters</h2>
            </div>
            <div className="group group-divider">
              <BreakdownRow label="Median scheduled interval" value={`${data.distributions.medianIntervalDays} days`} />
              <BreakdownRow label="Average card difficulty" value={`${data.distributions.avgDifficulty} / 10`} />
              <BreakdownRow label="Median memory stability" value={`${data.distributions.medianStabilityDays} days`} />
            </div>
          </section>
        </>
      )}

      {chartId === 'hourly' && (
        <>
          <section className="group insight-detail-card">
            <div className="insight-detail-metric tabular">
              {data.hourly.bestHour
                ? `${data.hourly.bestHour.label} · ${data.hourly.bestHour.accuracy}% accuracy`
                : 'No hourly data yet'}
            </div>
            <Bars
              items={data.hourly.buckets.map((h) => ({
                key: String(h.hour),
                label: h.label,
                value: h.reviews,
                highlight: h.isBest,
                sublabel: h.reviews > 0 ? `${h.accuracy}% correct` : 'No reviews',
              }))}
              height={230}
              interactive
              xLabels
              formatValue={(v) => `${v} reviews`}
              motion={motion}
              ariaLabel="Interactive 24-hour breakdown chart"
            />
          </section>
          <section aria-label="Active study hours">
            <div className="section-head">
              <h2 className="section-title">Active hours</h2>
            </div>
            <div className="group group-divider">
              {data.hourly.buckets
                .filter((h) => h.reviews > 0)
                .map((h) => (
                  <BreakdownRow
                    key={h.hour}
                    label={h.label}
                    sub={h.isBest ? 'Best recall hour' : `${h.correct} / ${h.reviews} Good or Easy`}
                    value={`${h.accuracy}% · ${h.reviews}`}
                  />
                ))}
            </div>
          </section>
        </>
      )}

      {chartId === 'subjects' && (
        <div className="section-stack">
          {data.subjects.map((sub) => (
            <section key={sub.subjectId} aria-label={sub.name}>
              <div className="section-head">
                <h2 className="section-title">{sub.name}</h2>
                <span className="row-sub tabular">
                  {sub.accuracy !== null ? `${sub.accuracy}% accuracy` : 'Not studied'} · {sub.reviews} rev
                </span>
              </div>
              <div className="group group-divider">
                {sub.lessons.map((l) => {
                  const level = l.masteryLabel.toLowerCase().replace(' ', '-');
                  return (
                    <a
                      key={l.lessonId}
                      className="lesson-row"
                      href={`#/study/${sub.subjectId}/${l.lessonId}`}
                    >
                      <span className={`mastery-indicator mastery-${level}`} aria-hidden="true" />
                      <span className="lesson-title">{l.title}</span>
                      <span className="lesson-meta tabular">
                        <span>{l.accuracy !== null ? `${l.accuracy}%` : l.masteryLabel}</span>
                        <span>{l.reviews} rev</span>
                        <ChevronRight size={14} className="row-chevron" />
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {chartId === 'streaks' && (
        <>
          <section className="group insight-detail-card">
            <div className="insight-detail-metric tabular insight-streak-metric">
              <FlameIcon size={24} className="streak-flame" />
              <span>
                {data.streaks.current} {data.streaks.current === 1 ? 'day' : 'days'}
              </span>
            </div>
            <div className="streak-pill-strip streak-pill-strip-lg" aria-label="Last 14 days">
              {data.streaks.recentDays.map((d) => (
                <div key={d.dateKey} className="streak-day-col">
                  <span className="streak-pill-day" data-level={d.level} />
                  <span className="streak-day-num tabular">{d.dateKey.slice(8)}</span>
                </div>
              ))}
            </div>
          </section>
          <section aria-label="Streak stats">
            <div className="section-head">
              <h2 className="section-title">Consistency</h2>
            </div>
            <div className="group group-divider">
              <BreakdownRow label="Current streak" value={`${data.streaks.current} days`} />
              <BreakdownRow label="Longest streak" value={`${data.streaks.longest} days`} />
              <BreakdownRow
                label="Days studied in range"
                value={`${data.streaks.daysInRange} / ${data.streaks.rangeDays}`}
              />
              <BreakdownRow
                label="Consistency"
                value={`${Math.round((data.streaks.daysInRange / data.streaks.rangeDays) * 100)}%`}
              />
            </div>
          </section>
        </>
      )}

      {chartId === 'leeches' && (
        <section aria-label="Hardest cards">
          <div className="section-head">
            <h2 className="section-title">Top 10 hardest cards</h2>
            <span className="row-sub tabular">{data.leeches.leechCount} leeches</span>
          </div>
          <div className="group group-divider">
            {data.leeches.items.length === 0 ? (
              <div className="group-row">
                <span className="row-sub">No reviewed cards in this filter yet.</span>
              </div>
            ) : (
              data.leeches.items.map((item) => (
                <a
                  key={item.cardId}
                  href={`#/study/${item.subjectId}/${item.lessonId}`}
                  className="group-row group-row-interactive"
                >
                  <span className="row-main">
                    <span className="row-title" style={{ fontSize: 'var(--text-sm)' }}>
                      {cleanCardFront(item.front)}
                    </span>
                    <span className="row-sub">
                      {item.subjectName} · {item.lessonTitle} · Difficulty {item.difficulty}
                    </span>
                  </span>
                  <span className="insight-leech-meta tabular">
                    {item.isLeech && <span className="leech-pill">Leech</span>}
                    <span className="row-value row-value-strong">
                      {item.lapses} {item.lapses === 1 ? 'lapse' : 'lapses'}
                    </span>
                    <ChevronRight size={14} className="row-chevron" />
                  </span>
                </a>
              ))
            )}
          </div>
        </section>
      )}

      {chartId === 'answer-time' && (
        <>
          <section className="group insight-detail-card">
            <div className="insight-detail-metric tabular">
              {data.answerTime.medianSec !== null ? `${data.answerTime.medianSec}s median` : '—'}
            </div>
            <Histogram
              bins={data.answerTime.bins}
              height={230}
              interactive
              formatCount={(n) => `${n} ${n === 1 ? 'review' : 'reviews'}`}
              motion={motion}
              ariaLabel="Interactive answer time histogram"
            />
          </section>
          <section aria-label="Answer time breakdown">
            <div className="section-head">
              <h2 className="section-title">Timing</h2>
            </div>
            <div className="group group-divider">
              <BreakdownRow
                label="Median answer time"
                value={data.answerTime.medianSec !== null ? `${data.answerTime.medianSec}s` : '—'}
              />
              <BreakdownRow
                label="Average answer time"
                value={data.answerTime.avgSec !== null ? `${data.answerTime.avgSec}s` : '—'}
              />
              <BreakdownRow label="Samples in range" value={`${data.answerTime.sampleCount}`} />
              {data.answerTime.bins.map((b) => (
                <BreakdownRow key={b.label} label={b.label} value={`${b.count} reviews`} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
