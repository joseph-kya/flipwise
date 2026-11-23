import type { ReactNode } from 'react';

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

export function SunIcon({ size = 18, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2.5 12h2M19.5 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </Svg>
  );
}

export function MoonIcon({ size = 18, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
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

export function SubjectIcon({ subjectId, size = 18 }: { subjectId: string; size?: number }) {
  switch (subjectId) {
    case 'analysis-1':
      return (
        <Svg size={size}>
          <path d="M4 17c2.5-9 5.5-9 8 0s5.5 9 8 0" />
          <path d="M4 12h16" strokeOpacity={0.35} />
        </Svg>
      );
    case 'robotics':
      return (
        <Svg size={size}>
          <circle cx="6" cy="18" r="2.25" />
          <circle cx="12" cy="10" r="2.25" />
          <circle cx="18.5" cy="7" r="2" />
          <path d="M7.5 16.2L10.6 11.9M14.1 9.1L16.7 7.9" />
        </Svg>
      );
    case 'physics-1':
      return (
        <Svg size={size}>
          <circle cx="12" cy="12" r="1.75" fill="currentColor" stroke="none" />
          <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(30 12 12)" />
          <ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-30 12 12)" />
        </Svg>
      );
    case 'programming-1':
      return (
        <Svg size={size}>
          <path d="M8.5 8L4.5 12l4 4M15.5 8l4 4-4 4M13.2 6.5l-2.4 11" />
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

export const SUBJECT_DESCRIPTIONS: Record<string, string> = {
  'analysis-1': 'Limits, change and continuity',
  robotics: 'Motion, sensing and control',
  'physics-1': 'The laws of the physical world',
  'programming-1': 'Thinking in algorithms',
};
