import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { ReviewEvent } from '../reviewLog';
import type { EffectiveMotion } from '../settings';
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
import { ChevronLeft, ChevronRight } from '../ui';

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
  motion?: EffectiveMotion;
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

export function CalendarPage({ events, today, timeZone, motion = 'full' }: CalendarPageProps) {
  const todayKey = useMemo(
    () => toLocalDateKey(today ?? new Date(), timeZone),
    [today, timeZone],
  );
  const todayParts = useMemo(() => parseDateKey(todayKey), [todayKey]);

  const [viewYear, setViewYear] = useState(todayParts.year);
  const [viewMonth, setViewMonth] = useState(todayParts.monthIndex);
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [ringPos, setRingPos] = useState<{ x: number; y: number; visible: boolean; isToday: boolean }>({
    x: 0,
    y: 0,
    visible: false,
    isToday: true,
  });

  const gridRef = useRef<HTMLDivElement>(null);
  const ringReadyRef = useRef(false);

  const byDay = useMemo(() => aggregateByDay(events, timeZone), [events, timeZone]);
  const visibleMonthSummary = useMemo(
    () => monthSummary(byDay, viewYear, viewMonth),
    [byDay, viewYear, viewMonth],
  );

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
    const items: Array<{ day: number; dateKey: string; week: number }> = [];
    for (let d = 1; d <= totalDays; d++) {
      items.push({
        day: d,
        dateKey: formatDateKey(viewYear, viewMonth, d),
        week: Math.floor((leadingBlanks + d - 1) / 7),
      });
    }
    return items;
  }, [viewYear, viewMonth, totalDays, leadingBlanks]);

  const syncSelectionRing = () => {
    const grid = gridRef.current;
    if (!grid) return;
    const target = grid.querySelector<HTMLButtonElement>(`button[data-date="${selectedKey}"]`);
    if (!target) {
      setRingPos((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }
    setRingPos({
      x: target.offsetLeft,
      y: target.offsetTop,
      visible: true,
      isToday: selectedKey === todayKey,
    });
  };

  useLayoutEffect(() => {
    syncSelectionRing();
    if (!ringReadyRef.current) {
      requestAnimationFrame(() => {
        ringReadyRef.current = true;
      });
    }
  }, [selectedKey, viewYear, viewMonth, todayKey]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => syncSelectionRing());
    ro.observe(grid);
    return () => ro.disconnect();
  }, [selectedKey, viewYear, viewMonth, todayKey]);

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
    <div className="section-stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1 className="page-title">Calendar</h1>
      </div>

      <section className="group cal-summary" aria-label="Study summary">
        <div className="cal-summary-cell">
          <span className="cal-summary-label">Streak</span>
          <strong className="cal-summary-value">
            {streakStats.current} {streakStats.current === 1 ? 'day' : 'days'}
          </strong>
          <span className="cal-summary-sub">
            {streakStats.longest > 0 ? `Best ${streakStats.longest}d` : 'No streak yet'}
          </span>
        </div>

        <div className="cal-summary-cell">
          <span className="cal-summary-label">{monthName}</span>
          <strong className="cal-summary-value">
            {formatDuration(visibleMonthSummary.durationMs)}
          </strong>
          <span className="cal-summary-sub">
            {visibleMonthSummary.cardsStudied} cards · {visibleMonthSummary.activeDays}d
          </span>
        </div>

        <div className="cal-summary-cell">
          <span className="cal-summary-label">
            {isCurrentMonth ? 'This week' : 'Selected week'}
          </span>
          <strong className="cal-summary-value">{activeWeekSummary.cardsStudied} cards</strong>
          <span className="cal-summary-sub">
            {formatDuration(activeWeekSummary.durationMs)} · {activeWeekSummary.newCardsLearned} new
          </span>
        </div>

        <div className="cal-summary-cell">
          <span className="cal-summary-label">Accuracy</span>
          <strong className="cal-summary-value">
            {visibleMonthSummary.cardsStudied > 0
              ? formatPercent(visibleMonthSummary.accuracy)
              : '—'}
          </strong>
          <span className="cal-summary-sub">
            {visibleMonthSummary.newCardsLearned} new learned
          </span>
        </div>
      </section>

      <div className="cal-layout">
        <section className="group" aria-label={`Calendar for ${monthTitle}`}>
          <div className="cal-board-head">
            <h2 className="cal-month-title">{monthTitle}</h2>
            <div className="cal-nav">
              {(!isCurrentMonth || selectedKey !== todayKey) && (
                <button type="button" className="btn btn-plain" onClick={jumpToToday}>
                  Today
                </button>
              )}
              <button
                type="button"
                className="icon-btn"
                onClick={() => stepMonth(-1)}
                aria-label="Previous month"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => stepMonth(1)}
                aria-label="Next month"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="cal-grid-wrap">
            <div className="cal-weekdays" aria-hidden="true">
              {WEEKDAYS.map((day) => (
                <span key={day.short} className="cal-weekday" title={day.full}>
                  {day.short}
                </span>
              ))}
            </div>

            <div
              className="cal-grid"
              ref={gridRef}
              key={`${viewYear}-${viewMonth}`}
              role="group"
              aria-label={`${monthTitle} days`}
            >
              {ringPos.visible && (
                <span
                  aria-hidden="true"
                  className={`cal-selection-indicator${ringPos.isToday ? ' is-today' : ''}${ringReadyRef.current && motion === 'full' ? ' is-animated' : ''}`}
                  style={{ transform: `translate3d(${ringPos.x}px, ${ringPos.y}px, 0)` }}
                />
              )}

              {Array.from({ length: leadingBlanks }).map((_, index) => (
                <span key={`blank-${index}`} aria-hidden="true" />
              ))}

              {monthDays.map(({ day, dateKey, week }) => {
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
                    style={{ '--week': week } as CSSProperties}
                    data-date={dateKey}
                    data-level={level}
                    data-today={isToday ? 'true' : undefined}
                    data-selected={isSelected ? 'true' : undefined}
                    aria-label={buildDayAriaLabel(dateKey, isToday, stats)}
                    aria-pressed={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    onClick={() => setSelectedKey(dateKey)}
                    onKeyDown={(e) => handleDayKeyDown(e, dateKey)}
                  >
                    <span>{day}</span>
                    {isToday && !isSelected && (
                      <span className="cal-today-dot" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="cal-board-foot" aria-label="Study intensity scale from less to more">
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
