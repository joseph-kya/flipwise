import { useEffect, useRef, useState } from 'react';
import type { Rating } from './reviewLog';
import type { EffectiveMotion } from './settings';

export function AnimatedNumber({
  value,
  motion,
  suffix = '',
}: {
  value: number;
  motion: EffectiveMotion;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    if (motion !== 'full' || fromRef.current === value) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    const start = fromRef.current;
    const delta = value - start;
    const duration = 260;
    const t0 = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(start + delta * eased));
      if (p < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      fromRef.current = value;
    };
  }, [value, motion]);

  return (
    <span className="tabular">
      {display}
      {suffix}
    </span>
  );
}

export function AccuracyRing({
  percent,
  hasData = true,
  size = 44,
  strokeWidth = 4,
  motion = 'full',
  showLabel = true,
}: {
  percent: number;
  hasData?: boolean;
  size?: number;
  strokeWidth?: number;
  motion?: EffectiveMotion;
  showLabel?: boolean;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = hasData ? Math.max(0, Math.min(100, percent)) : 0;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div
      className="accuracy-ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={hasData ? `${Math.round(clamped)}% accuracy` : 'No ratings yet'}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="accuracy-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className="accuracy-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={motion === 'off' ? { transition: 'none' } : undefined}
        />
      </svg>
      {showLabel && (
        <span className="accuracy-ring-label tabular" style={{ fontSize: size >= 72 ? 'var(--text-lg)' : '11px' }}>
          {hasData ? <AnimatedNumber value={Math.round(clamped)} motion={motion} suffix="%" /> : '—'}
        </span>
      )}
    </div>
  );
}

export function ConfettiBurst({ active, motion }: { active: boolean; motion: EffectiveMotion }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active || motion !== 'full') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 220;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const accent = getComputedStyle(canvas).color || '#007aff';
    const colors = [accent];

    const cx = width / 2;
    const cy = height * 0.42;
    const particles = Array.from({ length: 28 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 28 + ((i % 3) - 1) * 0.12;
      const speed = 130 + (i % 5) * 34;
      return {
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 65,
        size: 4 + (i % 3) * 1.8,
        rot: (i * 0.7) % Math.PI,
        vrot: (i % 2 === 0 ? 1 : -1) * (4 + (i % 4)),
        color: colors[0],
        opacityScale: i % 3 === 0 ? 0.55 : i % 2 === 0 ? 0.8 : 1,
        circle: i % 3 === 0,
      };
    });

    const duration = 980;
    const start = performance.now();
    let last = start;
    let rafId = 0;

    const frame = (now: number) => {
      const elapsed = now - start;
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, width, height);

      const progress = Math.min(1, elapsed / duration);
      const alpha = progress < 0.65 ? 1 : 1 - (progress - 0.65) / 0.35;

      for (const p of particles) {
        p.vx *= 0.96;
        p.vy = p.vy * 0.96 + 260 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;

        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha * 0.92 * p.opacityScale);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.circle) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.45, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6);
        }
        ctx.restore();
      }

      if (elapsed < duration) {
        rafId = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [active, motion]);

  if (!active || motion !== 'full') return null;
  return <canvas ref={canvasRef} className="confetti-canvas" aria-hidden="true" />;
}

export function animateButtonSpring(el: HTMLElement | null, motion: EffectiveMotion) {
  if (!el || motion !== 'full' || typeof el.animate !== 'function') return;
  el.animate(
    [
      { transform: 'scale(0.95)' },
      { transform: 'scale(1.04)', offset: 0.62 },
      { transform: 'scale(1)' },
    ],
    {
      duration: 240,
      easing: 'cubic-bezier(0.22, 1.24, 0.36, 1)',
    },
  );
}

const EXIT_TRANSFORMS: Record<Rating, string> = {
  again: 'translate3d(-76px, 8px, 0) rotate(-6deg)',
  hard: 'translate3d(-34px, 0, 0) rotate(-2deg)',
  good: 'translate3d(76px, -4px, 0) rotate(5deg)',
  easy: 'translate3d(88px, -58px, 0) rotate(9deg) scale(0.96)',
};

export function animateCardExit(
  el: HTMLElement | null,
  rating: Rating,
  motion: EffectiveMotion,
  startTransform = 'translate3d(0, 0, 0) rotate(0deg)',
): Promise<void> {
  if (!el || motion === 'off' || typeof el.animate !== 'function') {
    return Promise.resolve();
  }
  if (motion === 'reduced') {
    const anim = el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 140,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
      fill: 'forwards',
    });
    return anim.finished.then(() => undefined, () => undefined);
  }
  const anim = el.animate(
    [
      { transform: startTransform, opacity: 1 },
      { transform: EXIT_TRANSFORMS[rating], opacity: 0 },
    ],
    {
      duration: 230,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
      fill: 'forwards',
    },
  );
  return anim.finished.then(() => undefined, () => undefined);
}
