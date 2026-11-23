/**
 * "How Flipwise works": three swipeable, animated panels (onboarding + Settings).
 *
 * Motion budget: only transform, opacity and SVG stroke-dashoffset animate. Each visual plays
 * when its panel arrives (the slide itself is the text's entrance: one entrance per container),
 * pauses while offscreen, and collapses to a complete static frame under Motion = Reduced/Off.
 */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { Rating } from '../reviewLog';
import { STUDY_CONFIG } from '../scheduler';
import { Group, IconButton, RatingButton, Row } from '../ui';
import { formatGap, goodChain, ratingOutcomes, shortGap } from './fsrsDemo';

export const EXPLAINER_PANELS = 3;

type Motion = 'full' | 'reduced' | 'off';
export const currentMotion = (): Motion => {
  const m = typeof document !== 'undefined' ? document.documentElement.dataset.motion : undefined;
  return m === 'reduced' || m === 'off' ? m : 'full';
};

const sv = (vars: Record<string, string | number>) => vars as CSSProperties;

// The numbers never change for a session: compute them once, not on every panel arrival.
let chainCache: number[] | null = null, outcomeCache: Record<Rating, number> | null = null;
const cachedChain = () => (chainCache ??= goodChain(5));
const cachedOutcomes = () => (outcomeCache ??= ratingOutcomes());

// ---------------------------------------------------------------------------
// Panel 1: memory fades, a review catches it just before it's gone, gaps stretch.

function CurveVisual({ run, motion }: { run: number; motion: Motion }) {
  const gaps = cachedChain();
  const W = 320, top = 26, catchY = 100, forgetY = 110, axisY = 158, x0 = 14;
  const weights = gaps.map((g) => Math.log10(g / 60_000) + 0.6);
  const scale = (W - x0 - 20) / weights.reduce((a, b) => a + b, 0);
  const xs = weights.reduce<number[]>((acc, w) => [...acc, acc.at(-1)! + w * scale], [x0]);
  // Timeline: each decay takes longer than the last (the gaps stretch), each catch is quick.
  const times: { start: number; dur: number }[] = [];
  let t = 0.25;
  for (let i = 0; i < gaps.length; i++) { const dur = 0.42 + i * 0.1; times.push({ start: t, dur }); t += dur + 0.22; }
  const glyph = useRef<SVGGElement>(null);

  useEffect(() => {
    const g = glyph.current;
    if (!g || motion !== 'full' || typeof g.animate !== 'function') return;
    const total = t * 1000;
    const frames: Keyframe[] = [{ transform: `translateX(${xs[0]}px)`, offset: 0 }];
    times.forEach(({ start, dur }, i) => {
      const land = (start + dur) * 1000;
      frames.push({ transform: `translateX(${xs[i]}px)`, offset: Math.min(1, land / total) });
      frames.push({ transform: `translateX(${xs[i + 1]}px)`, offset: Math.min(1, (land + 220) / total), easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    });
    frames.sort((a, b) => (a.offset as number) - (b.offset as number));
    const anim = g.animate(frames, { duration: total, fill: 'both', easing: 'linear' });
    return () => anim.cancel();
  }, [run, motion]);

  const decay = (i: number) => {
    const a = xs[i], b = xs[i + 1], w = b - a;
    return `M ${a} ${top} C ${a + w * 0.14} ${top + (catchY - top) * 0.78}, ${a + w * 0.48} ${catchY - 2}, ${b} ${catchY}`;
  };

  return (
    <svg className="xp-svg" viewBox={`0 0 ${W} 188`} role="img"
      aria-label={`Memory fades after each review. Each review catches it just before you'd forget, and the gaps stretch: ${gaps.map(formatGap).join(', ')}.`}>
      <line className="xp-forget" x1={x0} x2={W - 6} y1={forgetY} y2={forgetY} />
      <text className="xp-forget-label" x={W - 6} y={forgetY + 14}>forgotten</text>
      <text className="xp-axis-label" x={x0} y={14}>memory</text>
      <line className="xp-axis" x1={x0} x2={W - 6} y1={axisY} y2={axisY} />
      {gaps.map((g, i) => {
        const { start, dur } = times[i];
        const end = start + dur;
        return (
          <g key={i}>
            <path className="xp-anim xp-draw xp-decay" pathLength={1} d={decay(i)} style={sv({ animationDelay: `${start}s`, animationDuration: `${dur}s` })} />
            <line className="xp-anim xp-draw xp-rise" pathLength={1} x1={xs[i + 1]} x2={xs[i + 1]} y1={catchY} y2={top} style={sv({ animationDelay: `${end + 0.06}s`, animationDuration: '0.16s' })} />
            <circle className="xp-anim xp-catch" cx={xs[i + 1]} cy={catchY} r={5} style={sv({ animationDelay: `${end}s`, transformOrigin: `${xs[i + 1]}px ${catchY}px` })} />
            <line className="xp-anim xp-tick" x1={xs[i + 1]} x2={xs[i + 1]} y1={axisY - 4} y2={axisY + 4} style={sv({ animationDelay: `${end}s` })} />
            <text className="xp-anim xp-gap" x={(xs[i] + xs[i + 1]) / 2} y={axisY + 20} style={sv({ animationDelay: `${end + 0.05}s` })}>{shortGap(g)}</text>
          </g>
        );
      })}
      <circle cx={xs[0]} cy={top} r={4.5} className="xp-start" />
      <g ref={glyph} className="xp-glyph" style={{ transform: `translateX(${motion === 'full' ? xs[0] : xs.at(-1)}px)` }}>
        <rect x={-7} y={axisY - 24} width={14} height={18} rx={3} />
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Panel 2: what each rating does to the next gap (real ts-fsrs numbers).

const RATINGS: { key: Rating; label: string; meaning: string }[] = [
  { key: 'again', label: 'Again', meaning: 'didn’t remember' },
  { key: 'hard', label: 'Hard', meaning: 'got it, with effort' },
  { key: 'good', label: 'Good', meaning: 'remembered' },
  { key: 'easy', label: 'Easy', meaning: 'instant' },
];

function RatingsVisual({ run }: { run: number }) {
  const outcomes = cachedOutcomes();
  const [picked, setPicked] = useState<Rating>('good');
  useEffect(() => setPicked('good'), [run]);
  const maxLog = Math.log(outcomes.easy / 60_000);
  const frac = (ms: number) => Math.max(0.06, Math.log(ms / 60_000) / maxLog);
  const chosen = RATINGS.find((r) => r.key === picked)!;
  return (
    <div className="xp-ratings" key={run}>
      {RATINGS.map((r, i) => (
        <div key={r.key} className={`xp-rate-row${picked === r.key ? ' is-picked' : ''}`}>
          <RatingButton tone={r.key} className="xp-rate-btn" onClick={() => setPicked(r.key)}>{r.label}</RatingButton>
          <span className="xp-rate-track" aria-hidden="true">
            <span className={`xp-anim xp-rate-bar xp-rate-${r.key}`} style={sv({ '--f': frac(outcomes[r.key]), animationDelay: `${0.15 + i * 0.07}s` })} />
          </span>
          <span className="xp-anim xp-rate-gap tabular" style={sv({ animationDelay: `${0.3 + i * 0.07}s` })}>{shortGap(outcomes[r.key])}</span>
        </div>
      ))}
      <p className="xp-rate-caption" aria-live="polite">
        <strong>{chosen.label}</strong> ({chosen.meaning}): you’ll see it again in {formatGap(outcomes[picked])}.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel 3: the daily habit fills up.

function StreakVisual({ run, motion }: { run: number; motion: Motion }) {
  const days = 14;
  const counter = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = counter.current;
    if (!el) return;
    if (motion !== 'full') { el.textContent = String(days); return; }
    el.textContent = '0';
    const delay = 250, step = 70, t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const n = Math.max(0, Math.min(days, Math.floor((now - t0 - delay) / step) + 1));
      if (el.textContent !== String(n)) el.textContent = String(n); // DOM write, no React render per frame
      if (n < days) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, motion]);
  return (
    <div className="xp-streak" key={run}>
      <div className="xp-streak-grid" aria-hidden="true">
        {Array.from({ length: days }, (_, i) => (
          <span key={i} className="xp-anim xp-day" style={sv({ animationDelay: `${0.25 + i * 0.07}s`, '--k': (i / (days - 1)).toFixed(2) })} />
        ))}
      </div>
      <p className="xp-streak-count"><span ref={counter} className="tabular">{days}</span> days in a row</p>
    </div>
  );
}

// ---------------------------------------------------------------------------

const caps = [
  ['Physics 1', STUDY_CONFIG.courseNew['physics-1']],
  ['Robotics', STUDY_CONFIG.courseNew.robotics],
  ['Analysis 1', STUDY_CONFIG.courseNew['analysis-1']],
  ['Programming 1', STUDY_CONFIG.courseNew['programming-1']],
] as const;

function Panel({ i, run, motion }: { i: number; run: number; motion: Motion }) {
  if (i === 0)
    return (
      <>
        <h2 className="ob-title">Each card comes back just before you’d forget it</h2>
        <p className="ob-lead">Flipwise uses FSRS, a memory model that predicts when you’re about to forget a card and brings it back right before. Every catch makes the next gap longer.</p>
        <CurveVisual key={run} run={run} motion={motion} />
      </>
    );
  if (i === 1)
    return (
      <>
        <h2 className="ob-title">Rate honestly</h2>
        <p className="ob-lead">Your rating sets the next gap. Tap one to see what it does to a card you’ve already reviewed three times.</p>
        <RatingsVisual run={run} />
      </>
    );
  return (
    <>
      <h2 className="ob-title">A little, every day</h2>
      <p className="ob-lead">Being on board means opening Flipwise daily: 10–20 minutes, due cards first, then new ones.</p>
      <StreakVisual run={run} motion={motion} />
      <Group ariaLabel="Daily habit" className="xp-habit">
        <Row title="New cards are capped per course" subtitle={`${caps.map(([n, c]) => `${n} (${c})`).join(', ')} new cards a day, so reviews never snowball.`} />
        <Row title="Missed a few days?" subtitle="Reviews pile up. Catch-up mode clears them fast." />
      </Group>
    </>
  );
}

/** Apple's momentum projection (Designing Fluid Interfaces), velocity in px/ms. */
const project = (v: number, d = 0.998) => ((v * 1000) / 1000) * d / (1 - d);

export function Explainer({ index, onIndex }: { index: number; onIndex: (i: number) => void }) {
  const motion = currentMotion();
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [runs, setRuns] = useState<number[]>(() => Array(EXPLAINER_PANELS).fill(0));
  const [visible, setVisible] = useState(true);
  const drag = useRef<{ id: number; x: number; y: number; dx: number; lock: 'none' | 'x' | 'y'; hist: { x: number; t: number }[] } | null>(null);
  const suppressClick = useRef(false);

  // Replay a panel's visual each time it arrives.
  useEffect(() => { setRuns((r) => r.map((n, i) => (i === index ? n + 1 : n))); }, [index]);

  // Pause everything while scrolled out of view.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) root.current?.getAnimations?.({ subtree: true }).forEach((a) => a.pause());
    else root.current?.getAnimations?.({ subtree: true }).forEach((a) => { if (a.playState === 'paused') a.play(); });
  }, [visible]);

  const place = (dx = 0, animate = true) => {
    const el = track.current;
    if (!el) return;
    el.style.transition = animate && motion === 'full' ? 'transform 420ms cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
    el.style.transform = `translate3d(calc(${-index * 100}% + ${dx}px), 0, 0)`;
  };
  useEffect(() => place(0, true), [index, motion]);

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button > 0 || drag.current) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, lock: 'none', hist: [] };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || d.lock === 'y') return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (d.lock === 'none') {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      d.lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (d.lock === 'y') return;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    const atEdge = (index === 0 && dx > 0) || (index === EXPLAINER_PANELS - 1 && dx < 0);
    const w = root.current?.offsetWidth || 1;
    d.dx = atEdge ? (dx * w * 0.55) / (w + 0.55 * Math.abs(dx)) : dx; // rubber-band past the ends
    d.hist.push({ x: e.clientX, t: performance.now() });
    if (d.hist.length > 5) d.hist.shift();
    place(d.dx, false); // 1:1 while the finger is down
  };
  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (d.lock !== 'x') return;
    suppressClick.current = true;
    const first = d.hist[0], last = d.hist.at(-1);
    const v = first && last && last.t > first.t ? (last.x - first.x) / (last.t - first.t) : 0;
    const w = root.current?.offsetWidth || 1;
    const projected = d.dx + project(v, 0.99);
    const next = Math.max(0, Math.min(EXPLAINER_PANELS - 1, index + (projected < -w / 2 ? 1 : projected > w / 2 ? -1 : 0)));
    if (next !== index) onIndex(next);
    else place(0, true);
  };

  return (
    <div className={`xp${visible ? '' : ' is-offscreen'}`} ref={root} data-motion-mode={motion}>
      <div
        className="xp-viewport"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClickCapture={(e) => { if (suppressClick.current) { e.stopPropagation(); e.preventDefault(); suppressClick.current = false; } }}
      >
        <div className="xp-track" ref={track}>
          {Array.from({ length: EXPLAINER_PANELS }, (_, i) => (
            <section
              key={i}
              className={`xp-panel${i === index ? ' is-active' : ''}`}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${EXPLAINER_PANELS}`}
              aria-hidden={i !== index}
              inert={i !== index ? true : undefined}
            >
              <Panel i={i} run={runs[i]} motion={motion} />
            </section>
          ))}
        </div>
      </div>
      <div className="xp-dots" role="group" aria-label="Explainer pages">
        {Array.from({ length: EXPLAINER_PANELS }, (_, i) => (
          <IconButton key={i} className={`xp-dot${i === index ? ' is-on' : ''}`} ariaLabel={`Page ${i + 1} of ${EXPLAINER_PANELS}${i === index ? ', current' : ''}`} onClick={() => onIndex(i)}>
            <span />
          </IconButton>
        ))}
      </div>
    </div>
  );
}
