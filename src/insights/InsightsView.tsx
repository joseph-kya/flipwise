import { useMemo, useState } from 'react';
import { InlineCardText } from '../anki/content';
import { useSubjects } from '../contentCatalog';
import { formatDuration } from '../calendar/dailyStats';
import type { EffectiveMotion } from '../settings';
import { ChevronRight, FlameIcon, Segmented, Select, type SelectOption } from '../ui';
import type { InsightsData, RangeKey, SubjectFilter } from './aggregate';
import { AreaLine, Bars, Donut, Histogram, StackedBars, YearHeatmap, type DonutSlice } from './Charts';

export const RANGE_OPTIONS: ReadonlyArray<{ value: RangeKey; label: string }> = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: '1y', label: '1y' },
];

export const STATE_COLORS: Record<string, string> = {
  mature: 'var(--sem-green-dot)',
  young: 'var(--accent)',
  learning: 'var(--sem-orange-dot)',
  new: 'var(--label-tertiary)',
  leech: 'var(--sem-red-dot)',
};

export function toDonutSlices(data: InsightsData): DonutSlice[] {
  return data.states.slices.map((s) => ({
    ...s,
    color: STATE_COLORS[s.id] ?? 'var(--accent)',
  }));
}

export function InsightsFilterBar({
  range,
  subjectId,
  onRangeChange,
  onSubjectChange,
  showRange = true,
}: {
  range: RangeKey;
  subjectId: SubjectFilter;
  onRangeChange: (next: RangeKey) => void;
  onSubjectChange: (next: SubjectFilter) => void;
  showRange?: boolean;
}) {
  const subjects = useSubjects();
  const options: SelectOption<SubjectFilter>[] = useMemo(
    () => [
      { value: 'all', label: 'All subjects' },
      ...subjects.map((s) => ({
        value: s.id,
        label: s.name,
        subtitle: s.collectionLabel,
      })),
    ],
    [subjects],
  );

  return (
    <div
      className={`insights-filters${showRange ? '' : ' insights-filters-subject-only'}`}
      role="region"
      aria-label="Insights filters"
    >
      {showRange && (
        <div className="insights-filters-range">
          <Segmented
            ariaLabel="Time range"
            options={RANGE_OPTIONS}
            value={range}
            onChange={onRangeChange}
          />
        </div>
      )}
      <div className="insights-filters-subject">
        <Select
          ariaLabel="Filter by subject"
          variant="pill"
          options={options}
          value={subjectId}
          onChange={onSubjectChange}
        />
      </div>
    </div>
  );
}

type DistTab = 'interval' | 'difficulty' | 'stability';

const DIST_OPTIONS: ReadonlyArray<{ value: DistTab; label: string }> = [
  { value: 'interval', label: 'Interval' },
  { value: 'difficulty', label: 'Difficulty' },
  { value: 'stability', label: 'Stability' },
];

export function InsightsView({
  data,
  range,
  subjectId,
  motion,
  onRangeChange,
  onSubjectChange,
}: {
  data: InsightsData;
  range: RangeKey;
  subjectId: SubjectFilter;
  motion: EffectiveMotion;
  onRangeChange: (next: RangeKey) => void;
  onSubjectChange: (next: SubjectFilter) => void;
}) {
  const [distTab, setDistTab] = useState<DistTab>('interval');

  const distBins =
    distTab === 'interval'
      ? data.distributions.interval
      : distTab === 'difficulty'
        ? data.distributions.difficulty
        : data.distributions.stability;

  const distKeyNumber =
    distTab === 'interval'
      ? `${data.distributions.medianIntervalDays}d median`
      : distTab === 'difficulty'
        ? `${data.distributions.avgDifficulty} / 10 avg`
        : `${data.distributions.medianStabilityDays}d median`;

  const distCaption =
    distTab === 'interval'
      ? 'Scheduled interval across reviewed cards'
      : distTab === 'difficulty'
        ? 'FSRS difficulty distribution (1 easiest – 10 hardest)'
        : 'FSRS memory stability in days';

  const donutSlices = toDonutSlices(data);

  return (
    <div className="section-stack insights-stack">
      <InsightsFilterBar
        range={range}
        subjectId={subjectId}
        onRangeChange={onRangeChange}
        onSubjectChange={onSubjectChange}
      />

      <div className="insights-grid">
        {/* 1. Full-year review heatmap (full width) */}
        <a className="group insight-card insight-card-wide" href="#/insights/heatmap">
          <div className="insight-card-head">
            <span className="insight-card-title">Activity</span>
            <ChevronRight size={15} className="row-chevron" />
          </div>
          <div className="insight-metric tabular">
            {data.heatmap.totalYearReviews.toLocaleString()} reviews
          </div>
          <div className="insight-chart-body">
            <YearHeatmap
              cells={data.heatmap.cells}
              weeks={data.heatmap.weeks}
              monthLabels={data.heatmap.monthLabels}
              motion={motion}
              ariaLabel={`Full-year review heatmap with ${data.heatmap.totalYearReviews} reviews`}
            />
          </div>
          <div className="insight-card-foot">
            <span className="insight-caption">
              {data.heatmap.activeYearDays} active days in the past year
            </span>
            <span className="insight-heat-legend" aria-hidden="true">
              <span>Less</span>
              <span className="insight-heat-dot" data-level="0" />
              <span className="insight-heat-dot" data-level="1" />
              <span className="insight-heat-dot" data-level="2" />
              <span className="insight-heat-dot" data-level="3" />
              <span className="insight-heat-dot" data-level="4" />
              <span>More</span>
            </span>
          </div>
        </a>

        {/* 2. True retention */}
        <a className="group insight-card" href="#/insights/retention">
          <div className="insight-card-head">
            <span className="insight-card-title">True retention</span>
            <ChevronRight size={15} className="row-chevron" />
          </div>
          <div className="insight-metric tabular">
            {data.retention.overallRate !== null ? `${data.retention.overallRate}% retention` : 'No data yet'}
          </div>
          <div className="insight-chart-body">
            {data.retention.points.length > 0 ? (
              <AreaLine
                points={data.retention.points.map((p) => ({
                  key: p.key,
                  label: p.label,
                  value: p.rate,
                }))}
                yMin={50}
                yMax={100}
                targetValue={data.retention.targetPercent}
                targetLabel={`Target ${data.retention.targetPercent}%`}
                motion={motion}
                ariaLabel={`True retention chart averaging ${data.retention.overallRate ?? 0}%`}
              />
            ) : (
              <div className="insight-empty">Complete review-state cards to track retention.</div>
            )}
          </div>
          <p className="insight-caption">
            {data.retention.reviewTotal > 0
              ? `${data.retention.reviewPassed} of ${data.retention.reviewTotal} mature/young reviews passed`
              : `Target set to ${data.retention.targetPercent}% in Settings`}
          </p>
        </a>

        {/* 3. Daily reviews stacked by rating */}
        <a className="group insight-card" href="#/insights/reviews">
          <div className="insight-card-head">
            <span className="insight-card-title">Daily reviews</span>
            <ChevronRight size={15} className="row-chevron" />
          </div>
          <div className="insight-metric tabular">
            {data.reviews.total.toLocaleString()} reviews
          </div>
          <div className="insight-chart-body">
            <StackedBars
              buckets={data.reviews.buckets}
              motion={motion}
              ariaLabel={`Stacked daily reviews totaling ${data.reviews.total}`}
            />
          </div>
          <div className="insight-card-foot">
            <span className="insight-caption tabular">{data.reviews.avgPerDay}/day avg</span>
            <span className="insight-rating-dots" aria-hidden="true">
              <span className="rating-dot-item"><i style={{ background: 'var(--sem-red-dot)' }} />Again</span>
              <span className="rating-dot-item"><i style={{ background: 'var(--sem-orange-dot)' }} />Hard</span>
              <span className="rating-dot-item"><i style={{ background: 'var(--sem-yellow-dot)' }} />Good</span>
              <span className="rating-dot-item"><i style={{ background: 'var(--sem-green-dot)' }} />Easy</span>
            </span>
          </div>
        </a>

        {/* 4. 30-day due forecast */}
        <a className="group insight-card" href="#/insights/forecast">
          <div className="insight-card-head">
            <span className="insight-card-title">30-day forecast</span>
            <ChevronRight size={15} className="row-chevron" />
          </div>
          <div className="insight-metric tabular">{data.forecast.dueNext7} due this week</div>
          <div className="insight-chart-body">
            <Bars
              items={data.forecast.days.map((d) => ({
                key: d.dateKey,
                label: d.label,
                value: d.count,
                highlight: d.dayOffset === 0,
              }))}
              motion={motion}
              ariaLabel={`30-day forecast with ${data.forecast.dueNext30} cards due`}
            />
          </div>
          <p className="insight-caption tabular">
            {data.forecast.dueToday} due today · {data.forecast.dueNext30} over next 30 days
          </p>
        </a>

        {/* 5. Time studied */}
        <a className="group insight-card" href="#/insights/time">
          <div className="insight-card-head">
            <span className="insight-card-title">Time studied</span>
            <ChevronRight size={15} className="row-chevron" />
          </div>
          <div className="insight-metric tabular">{formatDuration(data.time.totalMs)}</div>
          <div className="insight-chart-body">
            <Bars
              items={data.time.buckets.map((b) => ({
                key: b.key,
                label: b.label,
                value: b.minutes,
              }))}
              motion={motion}
              ariaLabel={`Time studied totaling ${formatDuration(data.time.totalMs)}`}
            />
          </div>
          <p className="insight-caption tabular">
            {data.time.avgMsPerActiveDay > 0
              ? `${formatDuration(data.time.avgMsPerActiveDay)} average per study day`
              : 'No study sessions in this range'}
          </p>
        </a>

        {/* 6. Card states donut */}
        <a className="group insight-card" href="#/insights/states">
          <div className="insight-card-head">
            <span className="insight-card-title">Card states</span>
            <ChevronRight size={15} className="row-chevron" />
          </div>
          <div className="insight-metric tabular">{data.states.maturePercent}% mature</div>
          <div className="insight-chart-body">
            <Donut
              slices={donutSlices}
              centerValue={String(data.states.total)}
              centerLabel="cards"
              motion={motion}
              ariaLabel={`Card states donut with ${data.states.maturePercent}% mature`}
            />
          </div>
          <p className="insight-caption tabular">
            {data.states.matureCount} mature (21d+) out of {data.states.total} cards
          </p>
        </a>

        {/* 7. Streaks */}
        <a className="group insight-card" href="#/insights/streaks">
          <div className="insight-card-head">
            <span className="insight-card-title">Streaks</span>
            <ChevronRight size={15} className="row-chevron" />
          </div>
          <div className="insight-metric tabular insight-streak-metric">
            <FlameIcon size={20} className="streak-flame" />
            <span>
              {data.streaks.current} {data.streaks.current === 1 ? 'day' : 'days'}
            </span>
          </div>
          <div className="insight-chart-body">
            <div className="streak-pill-strip" aria-label="Last 14 days activity">
              {data.streaks.recentDays.map((d) => (
                <span
                  key={d.dateKey}
                  className="streak-pill-day"
                  data-level={d.level}
                  title={`${d.dateKey}: ${d.count} cards`}
                />
              ))}
            </div>
            <div className="streak-stats-row">
              <div>
                <span className="streak-stat-label">Longest</span>
                <strong className="streak-stat-val tabular">{data.streaks.longest}d</strong>
              </div>
              <div>
                <span className="streak-stat-label">In range</span>
                <strong className="streak-stat-val tabular">
                  {data.streaks.daysInRange} / {data.streaks.rangeDays}d
                </strong>
              </div>
            </div>
          </div>
          <p className="insight-caption">
            {data.streaks.activeToday ? 'Studied today — streak is live' : 'Study today to keep your streak'}
          </p>
        </a>

        {/* 8. Hourly breakdown */}
        <a className="group insight-card" href="#/insights/hourly">
          <div className="insight-card-head">
            <span className="insight-card-title">Best study hour</span>
            <ChevronRight size={15} className="row-chevron" />
          </div>
          <div className="insight-metric tabular">
            {data.hourly.bestHour ? `${data.hourly.bestHour.label} · ${data.hourly.bestHour.accuracy}%` : 'No data yet'}
          </div>
          <div className="insight-chart-body">
            <Bars
              items={data.hourly.buckets.map((h) => ({
                key: String(h.hour),
                label: `${h.hour}h`,
                value: h.reviews,
                highlight: h.isBest,
              }))}
              xLabels
              motion={motion}
              ariaLabel="24-hour review activity chart"
            />
          </div>
          <p className="insight-caption">
            {data.hourly.bestHour
              ? `Highest recall at ${data.hourly.bestHour.label} (${data.hourly.bestHour.reviews} reviews)`
              : 'Review across different times of day to find your peak'}
          </p>
        </a>

        {/* 9. Answer time */}
        <a className="group insight-card" href="#/insights/answer-time">
          <div className="insight-card-head">
            <span className="insight-card-title">Answer time</span>
            <ChevronRight size={15} className="row-chevron" />
          </div>
          <div className="insight-metric tabular">
            {data.answerTime.medianSec !== null ? `${data.answerTime.medianSec}s median` : 'No data yet'}
          </div>
          <div className="insight-chart-body">
            <Histogram
              bins={data.answerTime.bins}
              motion={motion}
              ariaLabel="Answer time distribution histogram"
            />
          </div>
          <p className="insight-caption tabular">
            {data.answerTime.avgSec !== null
              ? `${data.answerTime.avgSec}s average across ${data.answerTime.sampleCount} reviews`
              : 'Time spent per card is recorded automatically'}
          </p>
        </a>

        {/* 10. Distributions (Interval / Difficulty / Stability, full width for balanced grid) */}
        <article className="group insight-card insight-card-wide">
          <div className="insight-dist-top">
            <a className="insight-card-link" href="#/insights/distributions">
              <div className="insight-card-head">
                <span className="insight-card-title">Distributions</span>
                <ChevronRight size={15} className="row-chevron" />
              </div>
              <div className="insight-metric tabular">{distKeyNumber}</div>
            </a>
            <div className="insight-mini-seg">
              <Segmented
                ariaLabel="Distribution metric"
                options={DIST_OPTIONS}
                value={distTab}
                onChange={setDistTab}
              />
            </div>
          </div>
          <a className="insight-card-link insight-chart-body" href="#/insights/distributions">
            <Histogram
              bins={distBins}
              height={148}
              motion={motion}
              ariaLabel={`${distTab} distribution histogram`}
            />
          </a>
          <p className="insight-caption">{distCaption}</p>
        </article>

        {/* 11. Per-subject & per-lesson accuracy (wide) */}
        <article className="group insight-card insight-card-wide">
          <a className="insight-card-link" href="#/insights/subjects">
            <div className="insight-card-head">
              <span className="insight-card-title">Subjects & lessons</span>
              <ChevronRight size={15} className="row-chevron" />
            </div>
            <div className="insight-metric tabular">
              {data.subjects.length} {data.subjects.length === 1 ? 'subject' : 'subjects'}
            </div>
          </a>

          <div className="insight-table-list">
            {data.subjects.map((sub) => (
              <div key={sub.subjectId} className="insight-subject-block">
                <div className="insight-subject-head">
                  <div className="insight-subject-title-wrap">
                    <span className="insight-subject-name">{sub.name}</span>
                    {sub.collectionLabel && (
                      <span className="insight-subject-sub">{sub.collectionLabel}</span>
                    )}
                  </div>
                  <span className="insight-subject-meta tabular">
                    {sub.accuracy !== null ? `${sub.accuracy}%` : '—'} · {sub.reviews} rev
                  </span>
                </div>
                <div className="insight-lesson-grid">
                  {sub.lessons.map((l) => {
                    const level = l.masteryLabel.toLowerCase().replace(' ', '-');
                    return (
                      <a
                        key={l.lessonId}
                        href={`#/study/${sub.subjectId}/${l.lessonId}`}
                        className="insight-lesson-pill"
                      >
                        <span className={`mastery-indicator mastery-${level}`} aria-hidden="true" />
                        <span className="insight-lesson-name">{l.title}</span>
                        <span className="insight-lesson-acc tabular">
                          {l.accuracy !== null ? `${l.accuracy}%` : l.masteryLabel}
                        </span>
                      </a>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="insight-caption">Tap any lesson to jump straight into study</p>
        </article>

        {/* 12. Leeches & hardest cards (wide) */}
        <article className="group insight-card insight-card-wide">
          <a className="insight-card-link" href="#/insights/leeches">
            <div className="insight-card-head">
              <span className="insight-card-title">Leeches & hardest cards</span>
              <ChevronRight size={15} className="row-chevron" />
            </div>
            <div className="insight-metric tabular">
              {data.leeches.leechCount > 0
                ? `${data.leeches.leechCount} ${data.leeches.leechCount === 1 ? 'leech' : 'leeches'}`
                : `${data.leeches.items.length} tracked`}
            </div>
          </a>

          {data.leeches.items.length === 0 ? (
            <div className="insight-empty">No reviewed cards in this filter yet.</div>
          ) : (
            <div className="insight-leech-list">
              {data.leeches.items.slice(0, 5).map((item) => (
                <a
                  key={item.cardId}
                  href={`#/study/${item.subjectId}/${item.lessonId}`}
                  className="insight-leech-row"
                >
                  <span className="insight-leech-main">
                    <span className="insight-leech-front">
                      <InlineCardText text={item.front} />
                    </span>
                    <span className="insight-leech-sub">
                      {item.subjectName}
                      {item.collectionLabel ? ` · ${item.collectionLabel}` : ''} · {item.lessonTitle}
                    </span>
                  </span>
                  <span className="insight-leech-meta tabular">
                    {item.isLeech && <span className="leech-pill">Leech</span>}
                    <span>{item.lapses} {item.lapses === 1 ? 'lapse' : 'lapses'}</span>
                    <ChevronRight size={14} className="row-chevron" />
                  </span>
                </a>
              ))}
            </div>
          )}
          <p className="insight-caption">
            Ranked by lapses and FSRS difficulty · tap a card to practice its lesson
          </p>
        </article>
      </div>
    </div>
  );
}
