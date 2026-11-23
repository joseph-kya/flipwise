import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import type { Subject } from './demoSubjects';

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

export function ChevronUpDown({ size = 15, className }: IconProps) {
  return (
    <Svg size={size} className={className}>
      <path d="M8 9l4-4 4 4M8 15l4 4 4-4" />
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

export const SUBJECT_DESCRIPTIONS: Record<string, string> = {
  'analysis-1': 'Limits, change and continuity',
  robotics: 'Motion, sensing and control',
  'physics-1': 'The laws of the physical world',
  'programming-1': 'Thinking in algorithms',
};

/**
 * Resolves any subject ID (including URI-encoded imported Anki IDs like
 * "anki-Sample%20Semester%3A%3AAnalysis%201") into a clean display name and optional subtitle.
 */
export function formatSubjectDisplay(
  subjectId: string,
  knownSubjects: readonly Subject[] = [],
): { name: string; subtitle?: string; known: boolean } {
  const match = knownSubjects.find((s) => s.id === subjectId);
  if (match) {
    return {
      name: match.name,
      subtitle: match.collectionLabel ?? SUBJECT_DESCRIPTIONS[match.id],
      known: true,
    };
  }

  if (subjectId.startsWith('anki-')) {
    const raw = subjectId.slice(5);
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      // Keep raw fallback
    }
    const parts = decoded.split('::').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return {
        name: parts[parts.length - 1],
        subtitle: parts.slice(0, -1).join(' · '),
        known: false,
      };
    }
    return { name: decoded || subjectId, known: false };
  }

  let decoded = subjectId;
  try {
    decoded = decodeURIComponent(subjectId);
  } catch {
    // Keep original
  }
  const pretty = decoded
    .split('-')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ');
  return { name: pretty || subjectId, known: false };
}

/* -------------------------------------------------------------------------- */
/* Shared UI Primitives (single source of truth for controls across the app)  */
/* -------------------------------------------------------------------------- */

export type ButtonVariant = 'primary' | 'secondary' | 'plain' | 'destructive';
export type ButtonSize = 'regular' | 'full';

export function Button({
  variant = 'secondary',
  size = 'regular',
  href,
  download,
  external,
  disabled,
  className,
  ariaLabel,
  onClick,
  children,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  href?: string;
  download?: string | boolean;
  external?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  children: ReactNode;
}) {
  const cls = [
    'btn',
    `btn-${variant}`,
    size === 'full' ? 'btn-full' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  if (href && !disabled) {
    return (
      <a
        className={cls}
        href={href}
        download={download}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        aria-label={ariaLabel}
        onClick={onClick}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={cls}
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function IconButton({
  ariaLabel,
  onClick,
  disabled,
  className,
  children,
}: {
  ariaLabel: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`icon-btn${className ? ` ${className}` : ''}`}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  labelledBy,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  labelledBy?: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      disabled={disabled}
      className={`ios-switch${checked ? ' is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="ios-switch-thumb" aria-hidden="true" />
    </button>
  );
}

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  subtitle?: string;
}

export function Select<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  placeholder = 'Select',
  variant = 'row',
  disabled = false,
}: {
  options: ReadonlyArray<SelectOption<T>>;
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  placeholder?: string;
  variant?: 'row' | 'pill';
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const current = selectedIndex >= 0 ? options[selectedIndex] : null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      const idx = selectedIndex >= 0 ? selectedIndex : 0;
      setFocusedIndex(idx);
      requestAnimationFrame(() => {
        optionRefs.current[idx]?.focus();
      });
    }
  }, [open, selectedIndex]);

  const choose = (opt: SelectOption<T>) => {
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const handleListKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (options.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (focusedIndex + 1) % options.length;
      setFocusedIndex(next);
      optionRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (focusedIndex - 1 + options.length) % options.length;
      setFocusedIndex(next);
      optionRefs.current[next]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusedIndex(0);
      optionRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      const last = options.length - 1;
      setFocusedIndex(last);
      optionRefs.current[last]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`ui-select ui-select-${variant}${open ? ' is-open' : ''}`}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`ui-select-trigger ui-select-trigger-${variant}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled || options.length === 0}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="ui-select-value">{current?.label ?? placeholder}</span>
        <ChevronUpDown size={15} className="ui-select-chevron" />
      </button>

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="ui-select-menu"
          onKeyDown={handleListKeyDown}
        >
          {options.map((opt, idx) => {
            const selected = opt.value === value;
            return (
              <button
                key={opt.value}
                ref={(el) => {
                  optionRefs.current[idx] = el;
                }}
                type="button"
                role="option"
                aria-selected={selected}
                className={`ui-select-option${selected ? ' is-selected' : ''}`}
                onClick={() => choose(opt)}
              >
                <span className="ui-select-check" aria-hidden="true">
                  {selected && <CheckIcon size={15} />}
                </span>
                <span className="ui-select-option-text">
                  <span className="ui-select-option-label">{opt.label}</span>
                  {opt.subtitle && (
                    <span className="ui-select-option-sub">{opt.subtitle}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { Select as Menu };

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

export { SegmentedControl as Segmented };

export function Group({
  as = 'section',
  divider = true,
  inset = 'default',
  padded = false,
  overflowVisible = false,
  ariaLabel,
  className,
  children,
}: {
  as?: 'section' | 'div';
  divider?: boolean;
  inset?: 'default' | 'icons' | 'lessons';
  padded?: boolean;
  overflowVisible?: boolean;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  const cls = [
    'group',
    divider ? 'group-divider' : '',
    inset === 'icons' ? 'group-icons' : inset === 'lessons' ? 'group-lessons' : '',
    padded ? 'group-pad' : '',
    overflowVisible ? 'group-overflow-visible' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  if (as === 'div') {
    return (
      <div className={cls} aria-label={ariaLabel}>
        {children}
      </div>
    );
  }
  return (
    <section className={cls} aria-label={ariaLabel}>
      {children}
    </section>
  );
}

export function Row({
  title,
  subtitle,
  leading,
  value,
  valueStrong = false,
  trailing,
  stacked = false,
  tone = 'default',
  onClick,
  disabled = false,
  titleId,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  value?: ReactNode;
  valueStrong?: boolean;
  trailing?: ReactNode;
  stacked?: boolean;
  tone?: 'default' | 'accent' | 'destructive';
  onClick?: () => void;
  disabled?: boolean;
  titleId?: string;
  className?: string;
}) {
  const cls = [
    'group-row',
    stacked ? 'row-stacked' : '',
    onClick ? 'group-row-interactive' : '',
    tone === 'accent' ? 'row-tone-accent' : '',
    tone === 'destructive' ? 'row-tone-destructive' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {leading}
      <span className="row-main">
        <span id={titleId} className="row-title">
          {title}
        </span>
        {subtitle && <span className="row-sub">{subtitle}</span>}
      </span>
      {value !== undefined && (
        <span className={`row-value${valueStrong ? ' row-value-strong' : ''}`}>{value}</span>
      )}
      {trailing && <span className="row-trailing">{trailing}</span>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={cls} disabled={disabled} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={cls}>{content}</div>;
}

export function NavRow({
  href,
  title,
  subtitle,
  leading,
  value,
  external = false,
  download,
  className,
  onClick,
}: {
  href: string;
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  value?: ReactNode;
  external?: boolean;
  download?: string | boolean;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <a
      className={`group-row group-row-interactive${className ? ` ${className}` : ''}`}
      href={href}
      download={download}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      onClick={onClick}
    >
      {leading}
      <span className="row-main">
        <span className="row-title">{title}</span>
        {subtitle && <span className="row-sub">{subtitle}</span>}
      </span>
      {value !== undefined && <span className="row-value">{value}</span>}
      <ChevronRight size={15} className="row-chevron" />
    </a>
  );
}

export function SectionHeader({
  title,
  action,
  id,
}: {
  title: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="section-head">
      <h2 id={id} className="section-title">
        {title}
      </h2>
      {action}
    </div>
  );
}

export function SectionFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={`section-footer${className ? ` ${className}` : ''}`}>{children}</p>;
}

export function PageHeader({
  title,
  eyebrow,
  subtitle,
  trailing,
  backHref,
  backLabel,
  className,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <div className={`page-header-wrap${className ? ` ${className}` : ''}`}>
      {backHref && backLabel && (
        <a className="back-link" href={backHref}>
          <ChevronLeft size={16} />
          {backLabel}
        </a>
      )}
      <div className={`page-head${trailing ? ' page-head-split' : ''}`} style={{ marginBottom: 0 }}>
        <div className="page-head-text">
          {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-sub">{subtitle}</p>}
        </div>
        {trailing}
      </div>
    </div>
  );
}

export function SwatchPicker<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ReadonlyArray<{ id: T; label: string; swatch: string }>;
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="swatch-row" role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={opt.label}
            className={`swatch-btn${selected ? ' is-selected' : ''}`}
            onClick={() => onChange(opt.id)}
          >
            <span className="swatch-circle" style={{ background: opt.swatch }}>
              {selected && <CheckIcon size={15} className="swatch-check" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
