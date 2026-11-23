import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { zipSync } from 'fflate';
import type { Plugin } from 'vite';

/** Build directly from the portable folder; no generated files enter source control. */
export function deckMakerAssets(): Plugin {
  let root: string;
  let base = '/';
  let serving = false;
  const virtualId = '\0virtual:deck-maker-assets';
  const guide = () => readFileSync(resolve(root, 'docs/ai-deck-guide.md'));
  function archive() {
    const base = resolve(root, 'skills');
    const files: Record<string, Uint8Array> = {};
    function visit(path: string) {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === '__pycache__') continue;
        const file = resolve(path, entry.name);
        if (entry.isDirectory()) visit(file);
        else if (/\.(md|json|py)$/.test(entry.name)) files[relative(base, file).split(sep).join('/')] = readFileSync(file);
      }
    }
    visit(resolve(base, 'flipwise-deck-maker'));
    return zipSync(files, { level: 9, mtime: new Date(1980, 0, 1) });
  }
  return {
    name: 'flipwise-deck-maker-assets',
    configResolved(config) { root = config.root; base = config.base; serving = config.command === 'serve'; },
    resolveId(id) { if (id === 'virtual:deck-maker-assets') return virtualId; },
    load(id) {
      if (id !== virtualId) return;
      if (serving) {
        return `export const skillZipUrl='${base}__flipwise/deck-maker.zip'; export const guideUrl='${base}__flipwise/ai-deck-guide.md';`;
      }
      const zip = this.emitFile({ type: 'asset', name: 'flipwise-deck-maker.zip', source: archive() });
      const doc = this.emitFile({ type: 'asset', name: 'ai-deck-guide.md', source: guide() });
      return `export const skillZipUrl=import.meta.ROLLUP_FILE_URL_${zip}; export const guideUrl=import.meta.ROLLUP_FILE_URL_${doc};`;
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0]?.replace(base, '/');
        if (path !== '/__flipwise/deck-maker.zip' && path !== '/__flipwise/ai-deck-guide.md') return next();
        try {
          response.setHeader('Content-Type', path.endsWith('.zip') ? 'application/zip' : 'text/plain; charset=utf-8');
          response.end(path.endsWith('.zip') ? archive() : guide());
        } catch (error) { next(error); }
      });
    },
  };
}
