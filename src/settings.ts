export type AccentId = 'blue' | 'indigo' | 'purple' | 'pink' | 'orange' | 'teal';
export type ThemeMode = 'auto' | 'light' | 'dark' | 'black';
export type CardStyle = 'classic' | 'glass' | 'paper';
export type FontFamily = 'system' | 'rounded' | 'serif';
export type TextSize = 'sm' | 'md' | 'lg';
export type MotionSetting = 'full' | 'reduced' | 'off';
export type EffectiveMotion = 'full' | 'reduced' | 'off';

export interface AppearanceSettings {
  accent: AccentId;
  theme: ThemeMode;
  cardStyle: CardStyle;
  font: FontFamily;
  textSize: TextSize;
  motion: MotionSetting;
}

export const SETTINGS_STORAGE_KEY = 'flipwise.appearance.v1';

export const DEFAULT_SETTINGS: AppearanceSettings = {
  accent: 'blue',
  theme: 'auto',
  cardStyle: 'classic',
  font: 'system',
  textSize: 'md',
  motion: 'full',
};

export const ACCENTS: ReadonlyArray<{ id: AccentId; label: string; swatch: string }> = [
  { id: 'blue', label: 'Blue', swatch: '#007aff' },
  { id: 'indigo', label: 'Indigo', swatch: '#5856d6' },
  { id: 'purple', label: 'Purple', swatch: '#af52de' },
  { id: 'pink', label: 'Pink', swatch: '#ff2d55' },
  { id: 'orange', label: 'Orange', swatch: '#ff9500' },
  { id: 'teal', label: 'Teal', swatch: '#00a0b0' },
];

const VALID_ACCENTS = new Set<string>(ACCENTS.map((a) => a.id));
const VALID_THEMES = new Set<string>(['auto', 'light', 'dark', 'black']);
const VALID_CARDS = new Set<string>(['classic', 'glass', 'paper']);
const VALID_FONTS = new Set<string>(['system', 'rounded', 'serif']);
const VALID_SIZES = new Set<string>(['sm', 'md', 'lg']);
const VALID_MOTIONS = new Set<string>(['full', 'reduced', 'off']);

function getStorage(storage?: Pick<Storage, 'getItem' | 'setItem'> | null) {
  if (storage !== undefined) return storage;
  try {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) return null;
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function sanitizeSettings(input: unknown): AppearanceSettings {
  if (!input || typeof input !== 'object') return { ...DEFAULT_SETTINGS };
  const raw = input as Record<string, unknown>;
  return {
    accent: typeof raw.accent === 'string' && VALID_ACCENTS.has(raw.accent)
      ? (raw.accent as AccentId)
      : DEFAULT_SETTINGS.accent,
    theme: typeof raw.theme === 'string' && VALID_THEMES.has(raw.theme)
      ? (raw.theme as ThemeMode)
      : DEFAULT_SETTINGS.theme,
    cardStyle: typeof raw.cardStyle === 'string' && VALID_CARDS.has(raw.cardStyle)
      ? (raw.cardStyle as CardStyle)
      : DEFAULT_SETTINGS.cardStyle,
    font: typeof raw.font === 'string' && VALID_FONTS.has(raw.font)
      ? (raw.font as FontFamily)
      : DEFAULT_SETTINGS.font,
    textSize: typeof raw.textSize === 'string' && VALID_SIZES.has(raw.textSize)
      ? (raw.textSize as TextSize)
      : DEFAULT_SETTINGS.textSize,
    motion: typeof raw.motion === 'string' && VALID_MOTIONS.has(raw.motion)
      ? (raw.motion as MotionSetting)
      : DEFAULT_SETTINGS.motion,
  };
}

export function loadSettings(storage?: Pick<Storage, 'getItem' | 'setItem'> | null): AppearanceSettings {
  const store = getStorage(storage);
  if (!store) return { ...DEFAULT_SETTINGS };
  try {
    const raw = store.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(
  settings: AppearanceSettings,
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null,
): void {
  const store = getStorage(storage);
  if (!store) return;
  try {
    store.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore private-mode or quota errors.
  }
}

export function resolveMotion(
  setting: MotionSetting,
  prefersReducedMotion: boolean,
): EffectiveMotion {
  if (setting === 'off') return 'off';
  if (setting === 'reduced') return 'reduced';
  return prefersReducedMotion ? 'reduced' : 'full';
}

export function applyAppearance(
  settings: AppearanceSettings,
  prefersReducedMotion: boolean,
  root: HTMLElement = document.documentElement,
): EffectiveMotion {
  const effectiveMotion = resolveMotion(settings.motion, prefersReducedMotion);
  root.dataset.accent = settings.accent;
  root.dataset.theme = settings.theme;
  root.dataset.cardStyle = settings.cardStyle;
  root.dataset.font = settings.font;
  root.dataset.textSize = settings.textSize;
  root.dataset.motion = effectiveMotion;
  return effectiveMotion;
}
