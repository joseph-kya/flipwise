import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { ReviewEvent } from '../reviewLog';
import {
  aggregateByDay,
  daysInMonth,
  formatDateKey,
  formatDuration,
  formatPercent,
  heatmapLevel,
  monthSummary,
  parseDateKey,
  shiftDateKey,
  streak,
  toLocalDateKey,
  weekSummary,
  weekdayMondayFirst,
} from './dailyStats';
import { DayDetailPanel } from './DayDetailPanel';
import './calendar.css';

const WEEKDAYS = [
  { short: 'Mon', full: 'Monday' },
  { short: 'Tue', full: 'Tuesday' },
  { short: 'Wed', full: 'Wednesday' },
  { short: 'Thu', full: 'Thursday' },
  { short: 'Fri', full: 'Friday' },
  { short: 'Sat', full: 'Saturday' },
  { short: 'Sun', full: 'Sunday' },
] as const;

export interface CalendarPageProps {
  events: readonly ReviewEvent[];
  today?: Date;
  timeZone?: string;
}

function formatMonthTitle(year: number, monthIndex: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, monthIndex, 1, 12, 0, 0));
}

function formatMonthShort(year: number, monthIndex: number): string {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
  }).format(new Date(year, monthIndex, 1, 12, 0, 0));
}

function buildDayAriaLabel(
  dateKey: string,
  isToday: boolean,
  stats: ReturnType<ReturnType<typeof aggregateByDay>['get']>,
): string {
  const { year, monthIndex, day } = parseDateKey(dateKey);
  const fullDate = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, monthIndex, day, 12, 0, 0));

  const prefix = isToday ? `${fullDate}, today` : fullDate;
  if (!stats || stats.cardsStudied === 0) {
    return `${prefix}, no study recorded`;
  }
  return `${prefix}, ${stats.cardsStudied} ${stats.cardsStudied === 1 ? 'card' : 'cards'} studied, ${formatDuration(stats.durationMs)}, ${formatPercent(stats.accuracy)} accuracy`;
}

export function CalendarPage({ events, today, timeZone }: CalendarPageProps) {
  const todayKey = useMemo(
    () => toLocalDateKey(today ?? new Date(), timeZone),
    [today, timeZone],
  );
  const todayParts = useMemo(() => parseDateKey(todayKey), [todayKey]);

  const [viewYear, setViewYear] = useState(todayParts.year);
  const [viewMonth, setViewMonth] = useState(todayParts.monthIndex);
  const [selectedKey, setSelectedKey] = useState(todayKey);

  const gridRef = useRef<HTMLDivElement>(null);

  const byDay = useMemo(() => aggregateByDay(events, timeZone), [events, timeZone]);
  const visibleMonthSummary = useMemo(
    () => monthSummary(byDay, viewYear, viewMonth),
    [byDay, viewYear, viewMonth],
  );

  // Show the week containing today when viewing the current month,
  // or the week containing the selected day when browsing another month.
  const isCurrentMonth = viewYear === todayParts.year && viewMonth === todayParts.monthIndex;
  const weekAnchor = isCurrentMonth ? todayKey : selectedKey;
  const activeWeekSummary = useMemo(
    () => weekSummary(byDay, weekAnchor),
    [byDay, weekAnchor],
  );

  const streakStats = useMemo(() => streak(byDay, todayKey), [byDay, todayKey]);

  const leadingBlanks = weekdayMondayFirst(viewYear, viewMonth, 1);
  const totalDays = daysInMonth(viewYear, viewMonth);
  const monthTitle = formatMonthTitle(viewYear, viewMonth);
  const monthName = formatMonthShort(viewYear, viewMonth);

  const monthDays = useMemo(() => {
    const items: Array<{ day: number; dateKey: string }> = [];
    for (let d = 1; d <= totalDays; d++) {
      items.push({ day: d, dateKey: formatDateKey(viewYear, viewMonth, d) });
    }
    return items;
  }, [viewYear, viewMonth, totalDays]);

  const focusDateButton = (dateKey: string) => {
    requestAnimationFrame(() => {
      const btn = gridRef.current?.querySelector<HTMLButtonElement>(
        `button[data-date="${dateKey}"]`,
      );
      btn?.focus();
    });
  };

  const stepMonth = (delta: number, focusDay?: number) => {
    const nextDate = new Date(Date.UTC(viewYear, viewMonth + delta, 1));
    const nextYear = nextDate.getUTCFullYear();
    const nextMonth = nextDate.getUTCMonth();
    const clampedDay = Math.min(focusDay ?? 1, daysInMonth(nextYear, nextMonth));
    const nextKey = formatDateKey(nextYear, nextMonth, clampedDay);

    setViewYear(nextYear);
    setViewMonth(nextMonth);
    if (focusDay !== undefined) {
      setSelectedKey(nextKey);
      focusDateButton(nextKey);
    }
  };

  const jumpToToday = () => {
    setViewYear(todayParts.year);
    setViewMonth(todayParts.monthIndex);
    setSelectedKey(todayKey);
    focusDateButton(todayKey);
  };

  const selectAndFocus = (nextKey: string) => {
    const parsed = parseDateKey(nextKey);
    setSelectedKey(nextKey);
    if (parsed.year !== viewYear || parsed.monthIndex !== viewMonth) {
      setViewYear(parsed.year);
      setViewMonth(parsed.monthIndex);
    }
    focusDateButton(nextKey);
  };

  const handleDayKeyDown = (event: KeyboardEvent<HTMLButtonElement>, dateKey: string) => {
    const { day } = parseDateKey(dateKey);
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        selectAndFocus(shiftDateKey(dateKey, -1));
        break;
      case 'ArrowRight':
        event.preventDefault();
        selectAndFocus(shiftDateKey(dateKey, 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectAndFocus(shiftDateKey(dateKey, -7));
        break;
      case 'ArrowDown':
        event.preventDefault();
        selectAndFocus(shiftDateKey(dateKey, 7));
        break;
      case 'Home':
        event.preventDefault();
        selectAndFocus(formatDateKey(viewYear, viewMonth, 1));
        break;
      case 'End':
        event.preventDefault();
        selectAndFocus(formatDateKey(viewYear, viewMonth, totalDays));
        break;
      case 'PageUp':
        event.preventDefault();
        stepMonth(-1, day);
        break;
      case 'PageDown':
        event.preventDefault();
        stepMonth(1, day);
        break;
      default:
        break;
    }
  };

  const selectedStats = byDay.get(selectedKey);
  const selectedIsFuture = selectedKey > todayKey;

  return (
    <div className="cal-page">
      <a className="back" href="#/">‹ Back to today</a>

      <div className="heading cal-heading">
        <div>
          <p className="muted">Study log</p>
          <h1>Study calendar.</h1>
        </div>
        <span className="demo">Local study log</span>
      </div>

      <section className="cal-summary" aria-label="Study summary">
        <div className="cal-stat">
          <span className="cal-stat-label">Current streak</span>
          <strong className="cal-stat-value">
            {streakStats.activeToday && <span className="cal-live-dot" aria-hidden="true" />}
            {streakStats.current} {streakStats.current === 1 ? 'day' : 'days'}
          </strong>
          <span className="cal-stat-sub">
            {streakStats.longest > 0
              ? `Longest ${streakStats.longest} ${streakStats.longest === 1 ? 'day' : 'days'}`
              : 'Ready when you are'}
          </span>
        </div>

        <div className="cal-stat">
          <span className="cal-stat-label">{monthName} total</span>
          <strong className="cal-stat-value">
            {formatDuration(visibleMonthSummary.durationMs)}
          </strong>
          <span className="cal-stat-sub">
            {visibleMonthSummary.cardsStudied} cards · {visibleMonthSummary.activeDays}{' '}
            {visibleMonthSummary.activeDays === 1 ? 'day' : 'days'}
          </span>
        </div>

        <div className="cal-stat">
          <span className="cal-stat-label">{isCurrentMonth ? 'This week' : 'Selected week'}</span>
          <strong className="cal-stat-value">
            {activeWeekSummary.cardsStudied} cards
          </strong>
          <span className="cal-stat-sub">
            {formatDuration(activeWeekSummary.durationMs)} · {activeWeekSummary.newCardsLearned} new
          </span>
        </div>

        <div className="cal-stat">
          <span className="cal-stat-label">{monthName} accuracy</span>
          <strong className="cal-stat-value">
            {visibleMonthSummary.cardsStudied > 0
              ? formatPercent(visibleMonthSummary.accuracy)
              : '—'}
          </strong>
          <span className="cal-stat-sub">
            {visibleMonthSummary.newCardsLearned} new cards learned
          </span>
        </div>
      </section>

      <div className="cal-workspace">
        <section className="cal-board" aria-label={`Calendar for ${monthTitle}`}>
          <div className="cal-board-head">
            <h2 className="cal-month-title">{monthTitle}</h2>
            <div className="cal-nav-group">
              {(!isCurrentMonth || selectedKey !== todayKey) && (
                <button
                  type="button"
                  className="cal-today-btn"
                  onClick={jumpToToday}
                >
                  Today
                </button>
              )}
              <button
                type="button"
                className="cal-icon-btn"
                onClick={() => stepMonth(-1)}
                aria-label="Previous month"
              >
                <span aria-hidden="true">‹</span>
              </button>
              <button
                type="button"
                className="cal-icon-btn"
                onClick={() => stepMonth(1)}
                aria-label="Next month"
              >
                <span aria-hidden="true">›</span>
              </button>
            </div>
          </div>

          <div className="cal-weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => (
              <span key={day.short} className="cal-weekday" title={day.full}>
                {day.short}
              </span>
            ))}
          </div>

          <div className="cal-grid" ref={gridRef} role="group" aria-label={`${monthTitle} days`}>
            {Array.from({ length: leadingBlanks }).map((_, index) => (
              <span key={`blank-${index}`} className="cal-blank" aria-hidden="true" />
            ))}

            {monthDays.map(({ day, dateKey }) => {
              const stats = byDay.get(dateKey);
              const count = stats?.cardsStudied ?? 0;
              const level = heatmapLevel(count);
              const isToday = dateKey === todayKey;
              const isSelected = dateKey === selectedKey;

              return (
                <button
                  key={dateKey}
                  type="button"
                  className="cal-day"
                  data-date={dateKey}
                  data-level={level}
                  data-today={isToday || undefined}
                  data-selected={isSelected || undefined}
                  aria-label={buildDayAriaLabel(dateKey, isToday, stats)}
                  aria-pressed={isSelected}
                  aria-current={isToday ? 'date' : undefined}
                  onClick={() => setSelectedKey(dateKey)}
                  onKeyDown={(e) => handleDayKeyDown(e, dateKey)}
                >
                  <span className="cal-day-num">{day}</span>
                  {count > 0 ? (
                    <span className="cal-day-count" aria-hidden="true">
                      {count}
                    </span>
                  ) : isToday ? (
                    <span className="cal-day-today-label" aria-hidden="true">
                      •
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="cal-board-foot">
            <span className="cal-keyboard-hint">Select a day to inspect its session</span>
            <div className="cal-legend" aria-label="Study intensity scale from less to more">
              <span>Less</span>
              <span className="cal-swatch" data-level="0" aria-hidden="true" />
              <span className="cal-swatch" data-level="1" aria-hidden="true" />
              <span className="cal-swatch" data-level="2" aria-hidden="true" />
              <span className="cal-swatch" data-level="3" aria-hidden="true" />
              <span className="cal-swatch" data-level="4" aria-hidden="true" />
              <span>More</span>
            </div>
          </div>
        </section>

        <DayDetailPanel
          dateKey={selectedKey}
          stats={selectedStats}
          isToday={selectedKey === todayKey}
          isFuture={selectedIsFuture}
          referenceYear={todayParts.year}
        />
      </div>
    </div>
  );
}
