import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  loadSettings,
  resolveMotion,
  saveSettings,
  type AppearanceSettings,
} from './settings';

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe('settings', () => {
  it('returns defaults when storage is empty or unavailable', () => {
    expect(loadSettings(createMemoryStorage())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips saved appearance settings cleanly', () => {
    const storage = createMemoryStorage();
    const custom: AppearanceSettings = {
      accent: 'purple',
      theme: 'black',
      cardStyle: 'glass',
      font: 'serif',
      textSize: 'lg',
      motion: 'reduced',
    };
    saveSettings(custom, storage);
    expect(loadSettings(storage)).toEqual(custom);
  });

  it('falls back to defaults on corrupt JSON or invalid values', () => {
    const storage = createMemoryStorage();
    storage.setItem(SETTINGS_STORAGE_KEY, '{not valid json');
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);

    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify('just a string'));
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);

    storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        accent: 'neon-lime',
        theme: 'dark',
        cardStyle: 'paper',
        font: 'comic',
        textSize: 'sm',
        motion: 'off',
      }),
    );
    expect(loadSettings(storage)).toEqual({
      accent: 'blue',
      theme: 'dark',
      cardStyle: 'paper',
      font: 'system',
      textSize: 'sm',
      motion: 'off',
    });
  });

  it('resolves effective motion against OS prefers-reduced-motion', () => {
    expect(resolveMotion('full', false)).toBe('full');
    expect(resolveMotion('full', true)).toBe('reduced');
    expect(resolveMotion('reduced', false)).toBe('reduced');
    expect(resolveMotion('reduced', true)).toBe('reduced');
    expect(resolveMotion('off', false)).toBe('off');
    expect(resolveMotion('off', true)).toBe('off');
  });
});
