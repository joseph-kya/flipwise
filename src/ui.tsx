import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
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

/* Subject colour: one hue token per subject (style.css --hue-*), deterministic for imports. */
export type SubjectHue = 'analysis' | 'robotics' | 'physics' | 'programming' | 'h0' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5';
const KNOWN_HUES: Record<string, SubjectHue> = { 'analysis-1': 'analysis', robotics: 'robotics', 'physics-1': 'physics', 'programming-1': 'programming' };

export function subjectHue(subjectId: string, name?: string): SubjectHue {
  const known = KNOWN_HUES[subjectIconKey(name ?? subjectId)] ?? KNOWN_HUES[subjectIconKey(subjectId)];
  if (known) return known;
  let h = 0;
  for (const ch of name ?? subjectId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `h${h % 6}` as SubjectHue;
}

/** CSS colour for a subject, e.g. for `--subject` on a page or ring. */
export const subjectColor = (subjectId: string, name?: string) => `var(--hue-${subjectHue(subjectId, name)})`;

/** iOS Settings-style tile: a tinted rounded square behind a white glyph. */
export function IconTile({ hue, size = 'md', children, className }: { hue: SubjectHue; size?: 'sm' | 'md' | 'lg'; children: ReactNode; className?: string }) {
  return (
    <span className={`icon-tile icon-tile-${size}${className ? ` ${className}` : ''}`} style={{ '--tile': `var(--hue-${hue})` } as CSSProperties} aria-hidden="true">
      {children}
    </span>
  );
}

/** A subject's glyph on its colour tile. */
export function SubjectTile({ subjectId, name, size = 'md' }: { subjectId: string; name?: string; size?: 'sm' | 'md' | 'lg' }) {
  const glyph = size === 'sm' ? 16 : size === 'lg' ? 26 : 22;
  return (
    <IconTile hue={subjectHue(subjectId, name)} size={size}>
      <SubjectIcon subjectId={subjectId} name={name} size={glyph} />
    </IconTile>
  );
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
  ref,
}: {
  ref?: Ref<HTMLButtonElement>;
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
      ref={ref}
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

/** Tinted answer button used by study ratings and catch-up (Again/Hard/Good/Easy colours). */
export function RatingButton({
  tone,
  onClick,
  disabled,
  shortcut,
  className,
  children,
}: {
  tone: 'again' | 'hard' | 'good' | 'easy';
  onClick: () => void;
  disabled?: boolean;
  shortcut?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`rating-btn rating-${tone}${className ? ` ${className}` : ''}`}
      disabled={disabled}
      aria-keyshortcuts={shortcut}
      onClick={onClick}
    >
      {children}
      {shortcut && <kbd className="rating-kbd" aria-hidden="true">{shortcut}</kbd>}
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
  const [placement, setPlacement] = useState<{
    sheet: boolean;
    flipUp: boolean;
    maxHeight: number;
  }>({ sheet: false, flipUp: false, maxHeight: 300 });
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const current = selectedIndex >= 0 ? options[selectedIndex] : null;
  const displayLabel = current?.label ?? placeholder;
  const accessibleName = `${ariaLabel}: ${displayLabel}`;

  // Measure viewport space so the menu never clips under the phone tab bar or off-screen
  useLayoutEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const measure = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (vw <= 600) {
        setPlacement({
          sheet: true,
          flipUp: false,
          maxHeight: Math.max(180, Math.round(vh * 0.62)),
        });
        return;
      }
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) {
        setPlacement({ sheet: false, flipUp: false, maxHeight: 300 });
        return;
      }
      const tabbar = document.querySelector<HTMLElement>('.tabbar');
      const tabbarRect = tabbar ? tabbar.getBoundingClientRect() : null;
      const bottomEdge =
        tabbarRect && tabbarRect.height > 0 && tabbarRect.top < vh
          ? tabbarRect.top
          : vh;
      const topEdge = 60; // clear sticky topbar on desktop
      const spaceBelow = Math.max(0, bottomEdge - rect.bottom - 14);
      const spaceAbove = Math.max(0, rect.top - topEdge - 14);
      const estimatedMenu = Math.min(300, options.length * 44 + 16);
      const flipUp = spaceBelow < estimatedMenu && spaceAbove > spaceBelow;
      const available = flipUp ? spaceAbove : spaceBelow;
      setPlacement({
        sheet: false,
        flipUp,
        maxHeight: Math.min(300, Math.max(132, Math.floor(available))),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        rootRef.current &&
        !rootRef.current.contains(target) &&
        (!sheetRef.current || !sheetRef.current.contains(target))
      ) {
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

  const optionItems = options.map((opt, idx) => {
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
  });

  return (
    <div
      ref={rootRef}
      className={`ui-select ui-select-${variant}${open ? ' is-open' : ''}`}
    >
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        className={`ui-select-trigger ui-select-trigger-${variant}`}
        aria-label={accessibleName}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled || options.length === 0}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="ui-select-value">{displayLabel}</span>
        <ChevronUpDown size={15} className="ui-select-chevron" />
      </button>

      {open &&
        (placement.sheet && typeof document !== 'undefined'
          ? createPortal(
              <div
                ref={sheetRef}
                className="ui-select-sheet-backdrop"
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    setOpen(false);
                    triggerRef.current?.focus();
                  }
                }}
              >
                <div className="ui-select-sheet">
                  <div className="sheet-handle" aria-hidden="true" />
                  <div className="ui-select-sheet-head">
                    <span className="ui-select-sheet-title">{ariaLabel}</span>
                    <button
                      type="button"
                      className="btn btn-plain ui-select-sheet-done"
                      onClick={() => {
                        setOpen(false);
                        triggerRef.current?.focus();
                      }}
                    >
                      Done
                    </button>
                  </div>
                  <div
                    id={listId}
                    role="listbox"
                    aria-label={ariaLabel}
                    className="ui-select-sheet-list"
                    style={{ maxHeight: placement.maxHeight }}
                    onKeyDown={handleListKeyDown}
                  >
                    {optionItems}
                  </div>
                </div>
              </div>,
              document.body,
            )
          : (
          <div
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className={`ui-select-menu${placement.flipUp ? ' ui-select-menu-up' : ''}`}
            style={{ maxHeight: placement.maxHeight }}
            onKeyDown={handleListKeyDown}
          >
            {optionItems}
          </div>
        ))}
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
  style,
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
  /** For per-row custom properties (e.g. a stagger index). */
  style?: CSSProperties;
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
      <button type="button" className={cls} style={style} disabled={disabled} onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className={cls} style={style}>{content}</div>;
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

/** Bottom sheet on phones, centred dialog on desktop. Escape or the backdrop closes it. */
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, [open]);
  if (!open || typeof document === 'undefined') return null;
  // Portal to <body>: a transformed ancestor (e.g. an animating onboarding step) would otherwise
  // become the containing block for position: fixed and clip the backdrop.
  return createPortal(
    <div className="ui-sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="ui-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="sheet-handle" aria-hidden="true" />
        <h2 id={titleId} className="ui-sheet-title">{title}</h2>
        {children}
        <Button ref={closeRef} variant="secondary" size="full" onClick={onClose}>Done</Button>
      </section>
    </div>,
    document.body,
  );
}
