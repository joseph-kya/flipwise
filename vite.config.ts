import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { deckMakerAssets } from './build/deckMakerAssets';
export default defineConfig({plugins:[tailwindcss(), deckMakerAssets()]});
