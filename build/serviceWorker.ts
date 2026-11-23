import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { RUNTIME_CACHE, SHELL_PREFIX, buildVersion, shouldPrecache } from '../src/pwa/swVersion';

/** Emits dist/sw.js (build only) with a precache list and a version derived from the build. */
export function serviceWorker(): Plugin {
  let root = '', publicDir = '';
  return {
    name: 'flipwise-service-worker',
    apply: 'build',
    configResolved(config) { root = config.root; publicDir = config.publicDir; },
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter(shouldPrecache);
      const publicFiles: string[] = [];
      const fingerprints: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) { walk(full); continue; }
          const rel = relative(publicDir, full).split(sep).join('/');
          fingerprints.push(`${rel}:${createHash('sha1').update(readFileSync(full)).digest('hex').slice(0, 12)}`);
          if (shouldPrecache(rel)) publicFiles.push(rel);
        }
      };
      if (publicDir) walk(publicDir);
      const precache = [...files, ...publicFiles].sort();
      const version = buildVersion([...Object.keys(bundle), ...fingerprints]);
      const source = readFileSync(resolve(root, 'build/sw-template.js'), 'utf8')
        .replace('__VERSION__', JSON.stringify(version))
        .replace(/__SHELL_PREFIX__/g, JSON.stringify(SHELL_PREFIX))
        .replace('__RUNTIME_CACHE__', JSON.stringify(RUNTIME_CACHE))
        .replace('__PRECACHE__', JSON.stringify(precache.map((p) => `./${p}`)));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}
