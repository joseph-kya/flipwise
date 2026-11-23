import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { plural } from '../plural';
import type { EffectiveMotion } from '../settings';
import type { HeatmapCell, HistogramBin, StackedBucket } from './aggregate';

/**
 * Keeps 1 SVG user unit === 1 CSS pixel so axis labels stay crisp (11-12px)
 * and chart heights never distort at 390px phone or 1440px wide desktop cards.
 */
function useContainerWidth(ref: RefObject<HTMLDivElement | null>, fallback: number): number {
  const [width, setWidth] = useState(fallback);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w >= 160) setWidth(w);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = Math.round(el.getBoundingClientRect().width);
    if (w >= 160 && w !== width) setWidth(w);
  }, [ref, width]);

  return width;
}

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  highlight?: boolean;
  sublabel?: string;
}

export interface LineDatum {
  key: string;
  label: string;
  value: number;
  sublabel?: string;
}

export interface DonutSlice {
  id: string;
  label: string;
  count: number;
  percent: number;
  color: string;
}

function usePointerScrub(
  count: number,
  interactive: boolean,
  svgRef: RefObject<SVGSVGElement | null>,
  viewWidth: number,
  plotLeft: number,
  plotWidth: number,
) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const draggingRef = useRef(false);

  const indexFromClientX = (clientX: number): number | null => {
    const svg = svgRef.current;
    if (!svg || count <= 0) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const xSvg = ((clientX - rect.left) / rect.width) * viewWidth;
    const ratio = (xSvg - plotLeft) / plotWidth;
    const clamped = Math.max(0, Math.min(0.999999, ratio));
    return Math.floor(clamped * count);
  };

  const handlers = interactive
    ? {
        onPointerDown: (e: ReactPointerEvent<SVGSVGElement>) => {
          draggingRef.current = true;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Ignore capture failures
          }
          setActiveIndex(indexFromClientX(e.clientX));
        },
        onPointerMove: (e: ReactPointerEvent<SVGSVGElement>) => {
          if (e.pointerType === 'mouse' || draggingRef.current) {
            setActiveIndex(indexFromClientX(e.clientX));
          }
        },
        onPointerUp: (e: ReactPointerEvent<SVGSVGElement>) => {
          draggingRef.current = false;
          try {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          } catch {
            // Ignore release failures
          }
        },
        onPointerCancel: () => {
          draggingRef.current = false;
        },
        onPointerLeave: (e: ReactPointerEvent<SVGSVGElement>) => {
          if (e.pointerType === 'mouse' && !draggingRef.current) {
            setActiveIndex(null);
          }
        },
      }
    : {};

  return { activeIndex, setActiveIndex, handlers };
}

function pickTickIndices(count: number, maxTicks = 5): number[] {
  if (count <= 0) return [];
  if (count <= maxTicks) return Array.from({ length: count }, (_, i) => i);
  const indices: number[] = [];
  const step = (count - 1) / (maxTicks - 1);
  for (let i = 0; i < maxTicks; i++) {
    const idx = Math.round(i * step);
    if (!indices.includes(idx)) indices.push(idx);
  }
  return indices;
}

function formatAxisNumber(val: number): string {
  if (val >= 1000) return `${Math.round((val / 1000) * 10) / 10}k`;
  return Number.isInteger(val) ? String(val) : val.toFixed(1);
}

/**
 * 1. Vertical bar chart (time studied, 30-day forecast, 24h hourly breakdown)
 */
export function Bars({
  items,
  height = 112,
  interactive = false,
  formatValue = (v) => String(v),
  xLabels = false,
  ariaLabel,
  motion = 'full',
}: {
  items: readonly BarDatum[];
  height?: number;
  interactive?: boolean;
  formatValue?: (v: number) => string;
  xLabels?: boolean;
  ariaLabel: string;
  motion?: EffectiveMotion;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewWidth = useContainerWidth(wrapRef, interactive ? 640 : 340);
  const padTop = 12;
  const padBottom = xLabels ? 24 : 8;
  const padLeft = interactive ? 36 : 4;
  const padRight = 8;
  const plotW = Math.max(80, viewWidth - padLeft - padRight);
  const plotH = Math.max(40, height - padTop - padBottom);

  const { activeIndex, handlers } = usePointerScrub(
    items.length,
    interactive,
    svgRef,
    viewWidth,
    padLeft,
    plotW,
  );

  const maxVal = Math.max(1, ...items.map((d) => d.value));
  const hasHighlight = items.some((d) => d.highlight);
  const slotW = items.length > 0 ? plotW / items.length : plotW;
  const gap = Math.min(6, Math.max(1.5, slotW * 0.28));
  const barW = Math.max(2, slotW - gap);
  const radius = Math.min(4, barW / 2);
  const maxTickCount = viewWidth < 420 ? 4 : interactive ? 6 : 4;
  const ticks = xLabels ? pickTickIndices(items.length, maxTickCount) : [];
  const active = activeIndex !== null ? items[activeIndex] : null;

  return (
    <div ref={wrapRef} className={`chart-wrap${interactive ? ' chart-wrap-interactive' : ''}`}>
      {interactive && (
        <div className="chart-scrub-bar" aria-live="polite">
          {active ? (
            <>
              <span className="chart-scrub-label">{active.label}</span>
              <strong className="chart-scrub-value tabular">{formatValue(active.value)}</strong>
              {active.sublabel && <span className="chart-scrub-sub">{active.sublabel}</span>}
            </>
          ) : (
            <span className="chart-scrub-hint">Hover or drag across bars to inspect</span>
          )}
        </div>
      )}

      <svg
        ref={svgRef}
        className={`chart-svg${interactive ? ' chart-svg-scrub' : ''}`}
        viewBox={`0 0 ${viewWidth} ${height}`}
        role="img"
        aria-label={ariaLabel}
        {...handlers}
      >
        {/* Subtle horizontal gridlines */}
        {[0, 0.5, 1].map((frac) => {
          const y = padTop + plotH * (1 - frac);
          return (
            <g key={frac}>
              <line
                x1={padLeft}
                x2={viewWidth - padRight}
                y1={y}
                y2={y}
                className={frac === 0 ? 'chart-axis-line' : 'chart-grid-line'}
              />
              {interactive && frac > 0 && (
                <text x={padLeft - 6} y={y + 3.5} textAnchor="end" className="chart-axis-text">
                  {formatAxisNumber(maxVal * frac)}
                </text>
              )}
            </g>
          );
        })}

        {/* Active hairline */}
        {activeIndex !== null && (
          <line
            x1={padLeft + activeIndex * slotW + slotW / 2}
            x2={padLeft + activeIndex * slotW + slotW / 2}
            y1={padTop}
            y2={padTop + plotH}
            className="chart-scrub-guide"
          />
        )}

        {/* Bars */}
        {items.map((item, i) => {
          const h = item.value > 0 ? Math.max(3, (item.value / maxVal) * plotH) : 0;
          const x = padLeft + i * slotW + gap / 2;
          const y = padTop + plotH - h;
          const isFocused = activeIndex === i;
          const dimmed = activeIndex !== null && !isFocused;
          const fill = item.highlight
            ? 'var(--accent)'
            : hasHighlight
              ? 'color-mix(in srgb, var(--accent) 36%, transparent)'
              : 'var(--accent)';

          return (
            <rect
              key={item.key}
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={radius}
              ry={radius}
              fill={fill}
              opacity={dimmed ? 0.35 : 1}
              className={motion !== 'off' ? 'chart-bar-anim' : undefined}
              style={{ '--i': Math.min(i, 24) } as CSSProperties}
            />
          );
        })}

        {/* X-axis tick labels */}
        {ticks.map((idx) => {
          const item = items[idx];
          if (!item) return null;
          const x = padLeft + idx * slotW + slotW / 2;
          return (
            <text
              key={item.key}
              x={x}
              y={height - 6}
              textAnchor={idx === 0 ? 'start' : idx === items.length - 1 ? 'end' : 'middle'}
              className="chart-axis-text"
            >
              {item.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * 2. Stacked bars by rating (Again / Hard / Good / Easy in semantic tokens)
 */
export function StackedBars({
  buckets,
  height = 112,
  interactive = false,
  xLabels = false,
  ariaLabel,
  motion = 'full',
}: {
  buckets: readonly StackedBucket[];
  height?: number;
  interactive?: boolean;
  xLabels?: boolean;
  ariaLabel: string;
  motion?: EffectiveMotion;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewWidth = useContainerWidth(wrapRef, interactive ? 640 : 340);
  const padTop = 12;
  const padBottom = xLabels ? 24 : 8;
  const padLeft = interactive ? 36 : 4;
  const padRight = 8;
  const plotW = Math.max(80, viewWidth - padLeft - padRight);
  const plotH = Math.max(40, height - padTop - padBottom);

  const { activeIndex, handlers } = usePointerScrub(
    buckets.length,
    interactive,
    svgRef,
    viewWidth,
    padLeft,
    plotW,
  );

  const maxTotal = Math.max(1, ...buckets.map((b) => b.total));
  const slotW = buckets.length > 0 ? plotW / buckets.length : plotW;
  const gap = Math.min(6, Math.max(1.5, slotW * 0.28));
  const barW = Math.max(2, slotW - gap);
  const maxTickCount = viewWidth < 420 ? 3 : interactive ? 5 : 4;
  const ticks = xLabels ? pickTickIndices(buckets.length, maxTickCount) : [];
  const active = activeIndex !== null ? buckets[activeIndex] : null;

  return (
    <div ref={wrapRef} className={`chart-wrap${interactive ? ' chart-wrap-interactive' : ''}`}>
      {interactive && (
        <div className="chart-scrub-bar" aria-live="polite">
          {active ? (
            <>
              <span className="chart-scrub-label">{active.label}</span>
              <strong className="chart-scrub-value tabular">{plural(active.total, 'review')}</strong>
              <span className="chart-scrub-sub tabular">
                {active.easy} easy · {active.good} good · {active.hard} hard · {active.again} again
              </span>
            </>
          ) : (
            <span className="chart-scrub-hint">Hover or drag across bars to inspect rating mix</span>
          )}
        </div>
      )}

      <svg
        ref={svgRef}
        className={`chart-svg${interactive ? ' chart-svg-scrub' : ''}`}
        viewBox={`0 0 ${viewWidth} ${height}`}
        role="img"
        aria-label={ariaLabel}
        {...handlers}
      >
        {[0, 0.5, 1].map((frac) => {
          const y = padTop + plotH * (1 - frac);
          return (
            <g key={frac}>
              <line
                x1={padLeft}
                x2={viewWidth - padRight}
                y1={y}
                y2={y}
                className={frac === 0 ? 'chart-axis-line' : 'chart-grid-line'}
              />
              {interactive && frac > 0 && (
                <text x={padLeft - 6} y={y + 3.5} textAnchor="end" className="chart-axis-text">
                  {formatAxisNumber(Math.round(maxTotal * frac))}
                </text>
              )}
            </g>
          );
        })}

        {activeIndex !== null && (
          <line
            x1={padLeft + activeIndex * slotW + slotW / 2}
            x2={padLeft + activeIndex * slotW + slotW / 2}
            y1={padTop}
            y2={padTop + plotH}
            className="chart-scrub-guide"
          />
        )}

        {buckets.map((bucket, i) => {
          if (bucket.total <= 0) return null;
          const x = padLeft + i * slotW + gap / 2;
          const totalH = Math.max(4, (bucket.total / maxTotal) * plotH);
          const segments: Array<{ key: string; count: number; fill: string }> = [
            { key: 'again', count: bucket.again, fill: 'var(--sem-red-dot)' },
            { key: 'hard', count: bucket.hard, fill: 'var(--sem-orange-dot)' },
            { key: 'good', count: bucket.good, fill: 'var(--sem-yellow-dot)' },
            { key: 'easy', count: bucket.easy, fill: 'var(--sem-green-dot)' },
          ].filter((s) => s.count > 0);

          let cursorY = padTop + plotH;
          const dimmed = activeIndex !== null && activeIndex !== i;

          return (
            <g
              key={bucket.key}
              opacity={dimmed ? 0.35 : 1}
              className={motion !== 'off' ? 'chart-bar-anim' : undefined}
              style={{ '--i': Math.min(i, 24) } as CSSProperties}
            >
              {segments.map((seg, idx) => {
                const segH = (seg.count / bucket.total) * totalH;
                cursorY -= segH;
                const isTop = idx === segments.length - 1;
                return (
                  <rect
                    key={seg.key}
                    x={x}
                    y={cursorY}
                    width={barW}
                    height={Math.max(1, segH)}
                    rx={isTop ? Math.min(3, barW / 2) : 0}
                    fill={seg.fill}
                  />
                );
              })}
            </g>
          );
        })}

        {ticks.map((idx) => {
          const b = buckets[idx];
          if (!b) return null;
          const x = padLeft + idx * slotW + slotW / 2;
          return (
            <text
              key={b.key}
              x={x}
              y={height - 6}
              textAnchor={idx === 0 ? 'start' : idx === buckets.length - 1 ? 'end' : 'middle'}
              className="chart-axis-text"
            >
              {b.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * 3. Smooth line + area chart with optional dashed target line (True retention)
 */
export function AreaLine({
  points,
  height = 112,
  yMin = 0,
  yMax = 100,
  targetValue,
  targetLabel,
  interactive = false,
  formatValue = (v) => `${v}%`,
  xLabels = false,
  ariaLabel,
  motion = 'full',
}: {
  points: readonly LineDatum[];
  height?: number;
  yMin?: number;
  yMax?: number;
  targetValue?: number;
  targetLabel?: string;
  interactive?: boolean;
  formatValue?: (v: number) => string;
  xLabels?: boolean;
  ariaLabel: string;
  motion?: EffectiveMotion;
}) {
  const gradId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewWidth = useContainerWidth(wrapRef, interactive ? 640 : 340);
  const padTop = 14;
  const padBottom = xLabels ? 24 : 10;
  const padLeft = interactive ? 42 : 6;
  const padRight = 8;
  const plotW = Math.max(80, viewWidth - padLeft - padRight);
  const plotH = Math.max(40, height - padTop - padBottom);

  const { activeIndex, handlers } = usePointerScrub(
    points.length,
    interactive,
    svgRef,
    viewWidth,
    padLeft,
    plotW,
  );

  const span = Math.max(1, yMax - yMin);
  const toY = (val: number) => {
    const clamped = Math.max(yMin, Math.min(yMax, val));
    return padTop + plotH * (1 - (clamped - yMin) / span);
  };
  const toX = (i: number) =>
    points.length <= 1 ? padLeft + plotW / 2 : padLeft + (i / (points.length - 1)) * plotW;

  const coords = points.map((p, i) => ({ x: toX(i), y: toY(p.value) }));

  // Build smooth monotone-safe quadratic path
  let linePath = '';
  let areaPath = '';
  if (coords.length === 1) {
    linePath = `M ${coords[0].x} ${coords[0].y} L ${coords[0].x + 0.1} ${coords[0].y}`;
  } else if (coords.length > 1) {
    const parts: string[] = [`M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`];
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i];
      const p1 = coords[i + 1];
      const midX = (p0.x + p1.x) / 2;
      parts.push(
        `C ${midX.toFixed(1)} ${p0.y.toFixed(1)}, ${midX.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`,
      );
    }
    linePath = parts.join(' ');
    const baseY = (padTop + plotH).toFixed(1);
    areaPath = `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${baseY} L ${coords[0].x.toFixed(1)} ${baseY} Z`;
  }

  const ticks = xLabels ? pickTickIndices(points.length, viewWidth < 420 ? 3 : interactive ? 5 : 3) : [];
  const active = activeIndex !== null ? points[activeIndex] : null;
  const activeCoord = activeIndex !== null ? coords[activeIndex] : null;
  const targetY = targetValue !== undefined ? toY(targetValue) : null;

  return (
    <div ref={wrapRef} className={`chart-wrap${interactive ? ' chart-wrap-interactive' : ''}`}>
      {interactive && (
        <div className="chart-scrub-bar" aria-live="polite">
          {active ? (
            <>
              <span className="chart-scrub-label">{active.label}</span>
              <strong className="chart-scrub-value tabular">{formatValue(active.value)}</strong>
              {active.sublabel && <span className="chart-scrub-sub">{active.sublabel}</span>}
            </>
          ) : (
            <span className="chart-scrub-hint">Hover or drag along curve to inspect retention</span>
          )}
        </div>
      )}

      <svg
        ref={svgRef}
        className={`chart-svg${interactive ? ' chart-svg-scrub' : ''}`}
        viewBox={`0 0 ${viewWidth} ${height}`}
        role="img"
        aria-label={ariaLabel}
        {...handlers}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[yMin, Math.round((yMin + yMax) / 2), yMax].map((tickVal) => {
          const y = toY(tickVal);
          return (
            <g key={tickVal}>
              <line
                x1={padLeft}
                x2={viewWidth - padRight}
                y1={y}
                y2={y}
                className={tickVal === yMin ? 'chart-axis-line' : 'chart-grid-line'}
              />
              {interactive && (
                <text x={padLeft - 6} y={y + 3.5} textAnchor="end" className="chart-axis-text">
                  {tickVal}%
                </text>
              )}
            </g>
          );
        })}

        {/* Dashed target retention line */}
        {targetY !== null && (
          <g>
            <line
              x1={padLeft}
              x2={viewWidth - padRight}
              y1={targetY}
              y2={targetY}
              className="chart-target-line"
            />
            {targetLabel && (
              <text
                x={viewWidth - padRight}
                y={Math.max(10, targetY - 4)}
                textAnchor="end"
                className="chart-target-text"
              >
                {targetLabel}
              </text>
            )}
          </g>
        )}

        {areaPath && (
          <path
            d={areaPath}
            fill={`url(#${gradId})`}
            className={motion !== 'off' ? 'chart-fade-anim' : undefined}
          />
        )}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={interactive ? 2.5 : 2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={motion !== 'off' ? 'chart-fade-anim' : undefined}
          />
        )}

        {/* Single-point dot */}
        {coords.length === 1 && (
          <circle cx={coords[0].x} cy={coords[0].y} r={4} fill="var(--accent)" />
        )}

        {/* Active scrubber point */}
        {activeCoord && (
          <g>
            <line
              x1={activeCoord.x}
              x2={activeCoord.x}
              y1={padTop}
              y2={padTop + plotH}
              className="chart-scrub-guide"
            />
            <circle cx={activeCoord.x} cy={activeCoord.y} r={8} fill="var(--accent)" opacity={0.18} />
            <circle
              cx={activeCoord.x}
              cy={activeCoord.y}
              r={4.2}
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth={2}
            />
          </g>
        )}

        {ticks.map((idx) => {
          const p = points[idx];
          if (!p) return null;
          return (
            <text
              key={p.key}
              x={toX(idx)}
              y={height - 6}
              textAnchor={idx === 0 ? 'start' : idx === points.length - 1 ? 'end' : 'middle'}
              className="chart-axis-text"
            >
              {p.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * 4. Full-year GitHub/Anki-style review heatmap (52 weeks × 7 days)
 */
export function YearHeatmap({
  cells,
  weeks,
  monthLabels,
  interactive = false,
  ariaLabel,
  motion = 'full',
}: {
  cells: readonly HeatmapCell[];
  weeks: number;
  monthLabels: ReadonlyArray<{ weekIndex: number; label: string }>;
  interactive?: boolean;
  ariaLabel: string;
  motion?: EffectiveMotion;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeCell, setActiveCell] = useState<HeatmapCell | null>(null);
  const draggingRef = useRef(false);

  // Start scrolled to the most recent weeks on narrow screens so recent activity is immediately visible
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollWidth > el.clientWidth) {
      el.scrollLeft = el.scrollWidth - el.clientWidth;
    }
  }, [weeks]);

  const cellSize = 11;
  const gap = 3;
  const pitch = cellSize + gap;
  const leftPad = interactive ? 26 : 0;
  const topPad = 18;
  const viewWidth = leftPad + weeks * pitch;
  const viewHeight = topPad + 7 * pitch + 2;

  // Group cells by week so we keep animated elements <= 52 columns (well under 60)
  const cellLookup = new Map<string, HeatmapCell>();
  for (const c of cells) {
    cellLookup.set(`${c.weekIndex}:${c.dayOfWeek}`, c);
  }

  const pickCell = (clientX: number, clientY: number): HeatmapCell | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const xSvg = ((clientX - rect.left) / rect.width) * viewWidth - leftPad;
    const ySvg = ((clientY - rect.top) / rect.height) * viewHeight - topPad;
    const w = Math.floor(xSvg / pitch);
    const d = Math.floor(ySvg / pitch);
    if (w < 0 || w >= weeks || d < 0 || d >= 7) return null;
    return cellLookup.get(`${w}:${d}`) ?? null;
  };

  const levelFill = (level: HeatmapCell['level']) => {
    switch (level) {
      case 0:
        return 'var(--chart-heat-0)';
      case 1:
        return 'var(--chart-heat-1)';
      case 2:
        return 'var(--chart-heat-2)';
      case 3:
        return 'var(--chart-heat-3)';
      case 4:
        return 'var(--chart-heat-4)';
    }
  };

  const formatDate = (dateKey: string) => {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(y, m - 1, d, 12, 0, 0));
  };

  // Deduplicate adjacent month labels that are too close (< 3 weeks apart)
  const spacedMonths: Array<{ weekIndex: number; label: string }> = [];
  for (const m of monthLabels) {
    const prev = spacedMonths[spacedMonths.length - 1];
    if (!prev || m.weekIndex - prev.weekIndex >= 3) {
      spacedMonths.push(m);
    }
  }

  return (
    <div className={`chart-wrap${interactive ? ' chart-wrap-interactive' : ''}`}>
      {interactive && (
        <div className="chart-scrub-bar" aria-live="polite">
          {activeCell ? (
            <>
              <span className="chart-scrub-label">{formatDate(activeCell.dateKey)}</span>
              <strong className="chart-scrub-value tabular">
                {activeCell.count} {activeCell.count === 1 ? 'review' : 'reviews'}
              </strong>
            </>
          ) : (
            <span className="chart-scrub-hint">Hover or drag across days to inspect activity</span>
          )}
        </div>
      )}

      <div className="heatmap-scroll" ref={scrollRef}>
        <svg
          ref={svgRef}
          className={`chart-svg heatmap-svg${interactive ? ' chart-svg-scrub' : ''}`}
          viewBox={`0 0 ${viewWidth} ${viewHeight}`}
          role="img"
          aria-label={ariaLabel}
          onPointerDown={
            interactive
              ? (e) => {
                  draggingRef.current = true;
                  try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                  } catch {
                    // ignore
                  }
                  setActiveCell(pickCell(e.clientX, e.clientY));
                }
              : undefined
          }
          onPointerMove={
            interactive
              ? (e) => {
                  if (e.pointerType === 'mouse' || draggingRef.current) {
                    setActiveCell(pickCell(e.clientX, e.clientY));
                  }
                }
              : undefined
          }
          onPointerUp={
            interactive
              ? (e) => {
                  draggingRef.current = false;
                  try {
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                  } catch {
                    // ignore
                  }
                }
              : undefined
          }
          onPointerLeave={
            interactive
              ? (e) => {
                  if (e.pointerType === 'mouse' && !draggingRef.current) {
                    setActiveCell(null);
                  }
                }
              : undefined
          }
        >
          {/* Month labels */}
          {spacedMonths.map((m) => (
            <text
              key={`${m.weekIndex}-${m.label}`}
              x={leftPad + m.weekIndex * pitch}
              y={11}
              className="chart-axis-text"
            >
              {m.label}
            </text>
          ))}

          {/* Weekday labels in detail mode */}
          {interactive && (
            <>
              <text x={0} y={topPad + 0 * pitch + 9} className="chart-axis-text">
                Mon
              </text>
              <text x={0} y={topPad + 2 * pitch + 9} className="chart-axis-text">
                Wed
              </text>
              <text x={0} y={topPad + 4 * pitch + 9} className="chart-axis-text">
                Fri
              </text>
            </>
          )}

          {/* Cells grouped as one softly fading layer so GPU stays idle */}
          <g className={motion !== 'off' ? 'chart-fade-anim' : undefined}>
            {cells.map((c) => {
              const x = leftPad + c.weekIndex * pitch;
              const y = topPad + c.dayOfWeek * pitch;
              const isSelected = activeCell?.dateKey === c.dateKey;
              return (
                <rect
                  key={c.dateKey}
                  x={x}
                  y={y}
                  width={cellSize}
                  height={cellSize}
                  rx={2.5}
                  fill={levelFill(c.level)}
                  stroke={isSelected ? 'var(--label)' : 'none'}
                  strokeWidth={isSelected ? 1.5 : 0}
                />
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

/**
 * 5. Multi-segment Donut chart (Card states: Mature / Young / Learning / New / Leech)
 */
export function Donut({
  slices,
  centerValue,
  centerLabel,
  size = 112,
  interactive = false,
  ariaLabel,
  motion = 'full',
}: {
  slices: readonly DonutSlice[];
  centerValue: string;
  centerLabel: string;
  size?: number;
  interactive?: boolean;
  ariaLabel: string;
  motion?: EffectiveMotion;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const strokeWidth = interactive ? 16 : 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, s) => sum + s.count, 0);
  const activeSlice = activeId ? slices.find((s) => s.id === activeId) : null;

  let offset = 0;

  return (
    <div className={`donut-layout${interactive ? ' donut-layout-lg' : ''}`}>
      <div className="donut-ring-wrap" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={ariaLabel}
          className="donut-svg"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--fill)"
            strokeWidth={strokeWidth}
          />
          {total > 0 &&
            slices.map((slice, i) => {
              if (slice.count <= 0) return null;
              const frac = slice.count / total;
              const gapLen = slices.filter((s) => s.count > 0).length > 1 ? 2.2 : 0;
              const segLen = Math.max(0.5, frac * circumference - gapLen);
              const dashOffset = -offset;
              offset += frac * circumference;
              const isDimmed = activeId !== null && activeId !== slice.id;

              return (
                <circle
                  key={slice.id}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={activeId === slice.id ? strokeWidth + 2 : strokeWidth}
                  strokeDasharray={`${segLen} ${circumference}`}
                  strokeDashoffset={dashOffset}
                  opacity={isDimmed ? 0.32 : 1}
                  className={motion !== 'off' ? 'chart-fade-anim' : undefined}
                  style={{ '--i': i, cursor: interactive ? 'pointer' : undefined } as CSSProperties}
                  onPointerEnter={interactive ? () => setActiveId(slice.id) : undefined}
                  onPointerLeave={interactive ? () => setActiveId(null) : undefined}
                  onClick={
                    interactive
                      ? () => setActiveId((prev) => (prev === slice.id ? null : slice.id))
                      : undefined
                  }
                />
              );
            })}
        </svg>
        <div className="donut-center">
          <strong className="donut-center-value tabular">
            {activeSlice ? `${activeSlice.percent}%` : centerValue}
          </strong>
          <span className="donut-center-label">
            {activeSlice ? activeSlice.label : centerLabel}
          </span>
        </div>
      </div>

      <div className="donut-legend">
        {slices.map((slice) => (
          <div
            key={slice.id}
            className={`donut-legend-row${activeId === slice.id ? ' is-active' : ''}`}
            onPointerEnter={interactive ? () => setActiveId(slice.id) : undefined}
            onPointerLeave={interactive ? () => setActiveId(null) : undefined}
          >
            <span className="donut-dot" style={{ background: slice.color }} aria-hidden="true" />
            <span className="donut-legend-label">{slice.label}</span>
            <span className="donut-legend-val tabular">{slice.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 6. Binned Histogram with highlighted median bin (Interval, Difficulty, Stability, Answer time)
 */
export function Histogram({
  bins,
  height = 112,
  interactive = false,
  formatCount = (n) => `${n} ${n === 1 ? 'card' : 'cards'}`,
  ariaLabel,
  motion = 'full',
}: {
  bins: readonly HistogramBin[];
  height?: number;
  interactive?: boolean;
  formatCount?: (n: number) => string;
  ariaLabel: string;
  motion?: EffectiveMotion;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const viewWidth = useContainerWidth(wrapRef, interactive ? 640 : 340);
  const padTop = 12;
  const padBottom = 24;
  const padLeft = interactive ? 36 : 4;
  const padRight = 8;
  const plotW = Math.max(80, viewWidth - padLeft - padRight);
  const plotH = Math.max(40, height - padTop - padBottom);

  const { activeIndex, handlers } = usePointerScrub(
    bins.length,
    interactive,
    svgRef,
    viewWidth,
    padLeft,
    plotW,
  );

  const maxCount = Math.max(1, ...bins.map((b) => b.count));
  const slotW = bins.length > 0 ? plotW / bins.length : plotW;
  const gap = Math.min(12, Math.max(4, slotW * 0.24));
  const barW = Math.max(4, slotW - gap);
  const active = activeIndex !== null ? bins[activeIndex] : null;

  return (
    <div ref={wrapRef} className={`chart-wrap${interactive ? ' chart-wrap-interactive' : ''}`}>
      {interactive && (
        <div className="chart-scrub-bar" aria-live="polite">
          {active ? (
            <>
              <span className="chart-scrub-label">{active.label}</span>
              <strong className="chart-scrub-value tabular">{formatCount(active.count)}</strong>
              {active.isMedian && <span className="chart-scrub-sub">Median bucket</span>}
            </>
          ) : (
            <span className="chart-scrub-hint">Hover or drag across buckets to inspect distribution</span>
          )}
        </div>
      )}

      <svg
        ref={svgRef}
        className={`chart-svg${interactive ? ' chart-svg-scrub' : ''}`}
        viewBox={`0 0 ${viewWidth} ${height}`}
        role="img"
        aria-label={ariaLabel}
        {...handlers}
      >
        {[0, 0.5, 1].map((frac) => {
          const y = padTop + plotH * (1 - frac);
          return (
            <g key={frac}>
              <line
                x1={padLeft}
                x2={viewWidth - padRight}
                y1={y}
                y2={y}
                className={frac === 0 ? 'chart-axis-line' : 'chart-grid-line'}
              />
              {interactive && frac > 0 && (
                <text x={padLeft - 6} y={y + 3.5} textAnchor="end" className="chart-axis-text">
                  {formatAxisNumber(Math.round(maxCount * frac))}
                </text>
              )}
            </g>
          );
        })}

        {bins.map((bin, i) => {
          const h = bin.count > 0 ? Math.max(3, (bin.count / maxCount) * plotH) : 0;
          const x = padLeft + i * slotW + gap / 2;
          const y = padTop + plotH - h;
          const dimmed = activeIndex !== null && activeIndex !== i;

          return (
            <g key={bin.label}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={Math.min(4, barW / 2)}
                fill={
                  bin.isMedian
                    ? 'var(--accent)'
                    : 'color-mix(in srgb, var(--accent) 36%, transparent)'
                }
                opacity={dimmed ? 0.35 : 1}
                className={motion !== 'off' ? 'chart-bar-anim' : undefined}
                style={{ '--i': Math.min(i, 12) } as CSSProperties}
              />
              <text
                x={x + barW / 2}
                y={height - 6}
                textAnchor="middle"
                className={`chart-axis-text${bin.isMedian ? ' chart-axis-text-strong' : ''}`}
              >
                {bin.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
