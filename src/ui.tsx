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

export function CheckIcon({ size = 24, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M5 13l4.5 4.5L19 7.5" />
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

export function SubjectIcon({ subjectId, size = 22 }: { subjectId: string; size?: number }) {
  switch (subjectId) {
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

export const SUBJECT_DESCRIPTIONS: Record<string, string> = {
  'analysis-1': 'Limits, change and continuity',
  robotics: 'Motion, sensing and control',
  'physics-1': 'The laws of the physical world',
  'programming-1': 'Thinking in algorithms',
};
