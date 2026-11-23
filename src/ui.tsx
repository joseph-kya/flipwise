import type { CSSProperties, ReactNode } from 'react';

interface IconProps {
  className?: string;
  size?: number;
}

function Svg({ size = 20, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function ChevronRight({ size = 16, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

export function ChevronLeft({ size = 16, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M15 6l-6 6 6 6" />
    </Svg>
  );
}

export function ChevronDown({ size = 16, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  );
}

export function CheckIcon({ size = 24, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M5 13l4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function FlameIcon({ size = 18, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M12.5 3.5c.8 3.2-2.2 4.6-2.2 7.2 0 1.4 1 2.5 2.3 2.5 1.7 0 2.7-1.5 2.4-3.6 1.8 1.5 3 3.7 3 6.1a6 6 0 1 1-12 0c0-3.8 2.6-6.9 6.5-12.2Z" />
    </Svg>
  );
}

export function TodayTabIcon({ size = 22, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M6.5 5h11" />
      <rect x="4" y="8.5" width="16" height="11.5" rx="2.5" />
    </Svg>
  );
}

export function SubjectsTabIcon({ size = 22, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </Svg>
  );
}

export function CalendarTabIcon({ size = 22, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M8 3v3.5M16 3v3.5M3.5 10h17" />
    </Svg>
  );
}

export function SettingsTabIcon({ size = 22, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </Svg>
  );
}

export function subjectIconKey(name: string) {
  const value = name.toLowerCase();
  if (/analysis|calculus/.test(value)) return 'analysis-1';
  if (/robot/.test(value)) return 'robotics';
  if (/physics|physik/.test(value)) return 'physics-1';
  if (/programming|computer science|coding/.test(value)) return 'programming-1';
  return name;
}
export function SubjectIcon({ subjectId, name, size = 22 }: { subjectId: string; name?: string; size?: number }) {
  switch (subjectIconKey(name ?? subjectId)) {
    case 'analysis-1':
      return (
        <Svg size={size}>
          <path d="M2.5 12c2.5-6.5 6.5-6.5 9.5 0s7 6.5 9.5 0" />
        </Svg>
      );
    case 'robotics':
      return (
        <Svg size={size}>
          <circle cx="12" cy="12" r="3" />
          <circle cx="12" cy="12" r="6.25" />
          <path d="M12 2.75v2.75M12 18.5v2.75M20 7.4l-2.4 1.38M6.4 15.22 4 16.6M20 16.6l-2.4-1.38M6.4 8.78 4 7.4" />
        </Svg>
      );
    case 'physics-1':
      return (
        <Svg size={size}>
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(60 12 12)" />
          <ellipse cx="12" cy="12" rx="9.5" ry="4" transform="rotate(-60 12 12)" />
        </Svg>
      );
    case 'programming-1':
      return (
        <Svg size={size}>
          <path d="M7.5 7.5 3 12l4.5 4.5M16.5 7.5 21 12l-4.5 4.5M13.5 5.5l-3 13" />
        </Svg>
      );
    default:
      return (
        <Svg size={size}>
          <rect x="5" y="4" width="14" height="16" rx="2.5" />
          <path d="M9 9h6M9 13h6" />
        </Svg>
      );
  }
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  style?: CSSProperties;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  return (
    <div
      className="segmented"
      role="radiogroup"
      aria-label={ariaLabel}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        className="segmented-thumb"
        aria-hidden="true"
        style={{
          width: `calc((100% - 6px) / ${options.length})`,
          transform: `translate3d(${activeIndex * 100}%, 0, 0)`,
        }}
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className="segmented-btn"
            style={option.style}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export const SUBJECT_DESCRIPTIONS: Record<string, string> = {
  'analysis-1': 'Limits, change and continuity',
  robotics: 'Motion, sensing and control',
  'physics-1': 'The laws of the physical world',
  'programming-1': 'Thinking in algorithms',
};
