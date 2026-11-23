import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { deckMakerAssets } from './build/deckMakerAssets';

/** BASE_PATH lets the same build run at a sub-path (GitHub Pages: /flipwise/). Dev stays at /. */
const base = (() => {
  const raw = process.env.BASE_PATH?.trim();
  if (!raw) return '/';
  return `/${raw.replace(/^\/+|\/+$/g, '')}/`.replace(/^\/\/$/, '/');
})();

export default defineConfig({ base, plugins: [tailwindcss(), deckMakerAssets()] });
