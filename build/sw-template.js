/* Flipwise service worker. Generated at build time by build/serviceWorker.ts; do not edit dist/sw.js. */
const VERSION = __VERSION__;
const SHELL = __SHELL_PREFIX__ + VERSION;
const SHELL_PREFIX = __SHELL_PREFIX__;
const RUNTIME = __RUNTIME_CACHE__;
const PRECACHE = __PRECACHE__;
const scope = self.registration.scope;
const INDEX = new URL('./', scope).href;
const RUNTIME_RE = /(\/starter\/[^/]+\.json|\.wasm)$/;

self.addEventListener('install', (event) => {
  // Wait for the page to ask (update prompt) before taking over: no skipWaiting here.
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll([INDEX, ...PRECACHE.map((p) => new URL(p, scope).href)])));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(SHELL_PREFIX) && key !== SHELL) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  // Cross-origin (Firebase, Google sign-in, Firestore, fonts CDNs...) and out-of-scope: untouched.
  if (!request.url.startsWith(scope)) return;
  const path = new URL(request.url).pathname;
  if (request.mode === 'navigate') event.respondWith(networkFirst(request));
  else if (RUNTIME_RE.test(path)) event.respondWith(staleWhileRevalidate(request));
  else event.respondWith(cacheFirst(request));
});

/** index.html: always try the network so a new build is picked up; the cache is the offline copy. */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) (await caches.open(SHELL)).put(INDEX, response.clone());
    return response;
  } catch {
    return (await caches.match(INDEX)) || (await caches.match(request)) || Response.error();
  }
}

/** Hashed assets never change under the same URL: cache first. */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && new URL(request.url).pathname.includes('/assets/')) (await caches.open(RUNTIME)).put(request, response.clone());
  return response;
}

/** Starter pack and sql-wasm: serve the cached copy instantly, refresh it in the background. */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  const network = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => cached || Response.error());
  return cached || network;
}
