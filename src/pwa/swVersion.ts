/** Pure helpers shared by the service-worker build plugin and its tests. */

export const SHELL_PREFIX = 'flipwise-shell-';
export const RUNTIME_CACHE = 'flipwise-runtime-v2';

/** Stable short version from the build's file names (hashed) and public-file fingerprints. */
export function buildVersion(entries: readonly string[]): string {
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
  for (const e of [...entries].sort()) {
    for (let i = 0; i < e.length; i++) {
      const c = e.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193);
      h2 = Math.imul(h2 ^ c, 0x85ebca6b);
    }
    h1 = Math.imul(h1 ^ 0x0a, 0x01000193); // entry separator
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
}

export const shellCacheName = (version: string) => `${SHELL_PREFIX}${version}`;

/** Old shell caches to delete on activate (never the runtime cache, never other apps' caches). */
export function staleCaches(keys: readonly string[], version: string): string[] {
  const current = shellCacheName(version);
  return keys.filter((k) => k.startsWith(SHELL_PREFIX) && k !== current);
}

/**
 * Which build/public files go into the install-time precache. Big or rarely needed files are
 * left to the runtime cache (starter pack JSON, sql-wasm) or the network (downloads, old font
 * formats that browsers with woff2 never request).
 */
export function shouldPrecache(path: string): boolean {
  if (path === 'notes/index.json') return true; // precache lecture notes index for instant offline browse & deep links
  if (/(^|\/)notes\//.test(path)) return false; // individual notes runtime-cached on fetch
  if (/(^|\/)starter\//.test(path)) return false; // runtime-cached when chosen
  if (/\.(wasm|map|zip|md|ttf|woff)$/.test(path)) return false;
  if (/^(sw\.js|icons\/flipwise-mark\.svg)$/.test(path)) return false;
  return /\.(html|js|css|woff2|png|svg|webmanifest)$/.test(path);
}

/** Requests the SW must never touch: anything cross-origin (Firebase, Google auth, Firestore). */
export function passThrough(requestUrl: string, scope: string): boolean {
  return !requestUrl.startsWith(scope);
}
