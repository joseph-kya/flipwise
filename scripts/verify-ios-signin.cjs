/*
 * Run with Auth :9099 / Firestore :8080 (demo-flipwise) and Vite :4443:
 * VITE_FIREBASE_EMULATOR=1 vite --host 127.0.0.1 --port 4443 --strictPort
 * node scripts/verify-ios-signin.cjs
 * After building BASE_PATH=/flipwise/ (with emulator config for isolation) and serving :4443:
 * node scripts/verify-ios-signin.cjs --production
 * PLAYWRIGHT_MODULE can point at an already installed Playwright module.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const modulePath = process.env.PLAYWRIGHT_MODULE || path.join(require('node:os').homedir(), '.npm/_npx/41b79885fbdb2a18/node_modules/playwright');
const { webkit, devices } = require(modulePath);
const production = process.argv.includes('--production');
const base = `http://127.0.0.1:4443${production ? '/flipwise/' : '/'}`;
const out = path.resolve('artifacts/ios-check');
fs.mkdirSync(out, { recursive: true });
const results = [], errors = [], unexpected = [];
let browser;
// Offline postMessage shim for gapi.iframes so Firebase's Auth Emulator iframe works with all external hosts blocked.
function gapiShim(onload) {
  return `(() => {
  let seq = 0;
  function makeChannel(targetWin) {
    const handlers = Object.create(null), pending = Object.create(null), queued = [];
    function dispatch(msg) {
      const fn = handlers[msg.name];
      if (!fn) { queued.push(msg); return; }
      const res = fn(msg.payload);
      targetWin().postMessage({ __gapi: 'reply', id: msg.id, res }, '*');
    }
    window.addEventListener('message', (e) => {
      const d = e.data;
      if (!d || typeof d !== 'object' || !d.__gapi) return;
      if (e.source !== targetWin()) return;
      if (d.__gapi === 'call') dispatch(d);
      else if (d.__gapi === 'reply' && pending[d.id]) { const cb = pending[d.id]; delete pending[d.id]; try { cb([d.res]); } catch { /* gapi swallows callback errors */ } }
    });
    return {
      register(name, fn) {
        handlers[name] = fn;
        for (let i = queued.length - 1; i >= 0; i--) {
          if (queued[i].name === name) { const m = queued.splice(i, 1)[0]; dispatch(m); }
        }
      },
      send(name, payload, cb) {
        const id = ++seq;
        if (cb) pending[id] = cb;
        targetWin().postMessage({ __gapi: 'call', id, name, payload }, '*');
      },
    };
  }
  const context = {
    open(opts, onOpen) {
      const el = document.createElement('iframe');
      el.src = opts.url;
      if (opts.attributes) {
        for (const [k, v] of Object.entries(opts.attributes)) {
          if (k === 'style' && v && typeof v === 'object') Object.assign(el.style, v);
          else el.setAttribute(k, String(v));
        }
      }
      let loaded = false;
      el.addEventListener('load', () => { loaded = true; }, { once: true });
      (opts.where || document.body).appendChild(el);
      const ch = makeChannel(() => el.contentWindow);
      const handle = {
        restyle: () => Promise.resolve(),
        ping: (cb) => new Promise((resolve) => {
          const done = () => { if (cb) cb(); resolve(); };
          if (loaded) done(); else el.addEventListener('load', done, { once: true });
        }),
        register: ch.register,
        send: ch.send,
      };
      return onOpen(handle);
    },
    getParentIframe() { return makeChannel(() => window.parent); },
  };
  window.gapi = {
    load(_mod, opts) { Promise.resolve().then(() => opts && opts.callback && opts.callback()); },
    iframes: { CROSS_ORIGIN_IFRAMES_FILTER: () => true, Iframe: function () {}, getContext: () => context },
  };
  const onloadName = ${JSON.stringify(onload || '')};
  if (onloadName && typeof window[onloadName] === 'function') window[onloadName]();
  if (typeof window.gapi_onload === 'function') window.gapi_onload();
})();`;
}
async function context() {
  const c = await browser.newContext({ ...devices['iPhone 15'], serviceWorkers: 'block' });
  c.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  await c.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.protocol === 'http:' && u.hostname === '127.0.0.1' && ['4443', '9099', '8080'].includes(u.port)) return route.continue();
    // Fulfill Firebase SDK / Auth Emulator's gapi.iframes script locally; zero external traffic leaves the machine.
    if (u.origin === 'https://apis.google.com' && u.pathname === '/js/api.js') {
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: gapiShim(u.searchParams.get('onload')) });
    }
    // Auth Emulator's own handler widget links CDN CSS/JS; stub them silently so offline testing stays clean.
    const fromEmulator = route.request().frame()?.url().startsWith('http://127.0.0.1:9099/');
    if (fromEmulator && ['https://unpkg.com', 'https://fonts.googleapis.com'].includes(u.origin)) {
      return route.abort();
    }
    unexpected.push(u.origin + u.pathname);
    return route.abort(); // never contact production Firebase, Google, or any external host
  });
  return c;
}
async function shot(p, name) { await p.screenshot({ path: path.join(out, `${name}.png`), fullPage: true }); }
async function account(p, query = '') {
  await p.goto(base + query);
  await p.getByRole('button', { name: 'Get started', exact: true }).click();
  await p.getByRole('button', { name: 'Sign in with Google', exact: true }).waitFor();
}
async function fakeUser(handler, email) {
  await handler.getByText('Add new account', { exact: true }).click();
  await handler.locator('#email-input').fill(email);
  await handler.locator('#display-name-input').fill('iPhone Emulator Test');
  await handler.getByRole('button', { name: 'Sign in with Google.com', exact: true }).click();
}
async function heading(p, name) { await p.getByRole('heading', { name, exact: true }).waitFor({ timeout: 45000 }); }
async function saved(p) { return p.evaluate(() => JSON.parse(localStorage.getItem('flipwise.onboarding-progress.v1'))); }
(async () => {
  browser = await webkit.launch();
  if (production) {
    const c = await context(), p = await c.newPage();
    await p.goto(base);
    await heading(p, 'Flipwise');
    await shot(p, 'production-welcome');
    await p.getByRole('button', { name: 'Get started', exact: true }).click();
    await heading(p, 'Sign in to keep your decks everywhere');
    await p.getByRole('button', { name: 'Sign in with Google', exact: true }).waitFor();
    await shot(p, 'production-account');
    results.push('production /flipwise/ Welcome → account, zero page errors');
    await c.close();
  } else {
    // (a) Actual Firebase popup and emulator fake user, with installed-mode detection enabled.
    let c = await context(), p = await c.newPage();
    await c.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    await account(p);
    const popupPromise = p.waitForEvent('popup');
    await p.getByRole('button', { name: 'Sign in with Google', exact: true }).click();
    const popup = await popupPromise;
    await fakeUser(popup, `popup-${Date.now()}@example.test`);
    await heading(p, 'Choose your start');
    assert.equal((await saved(p)).step, 'start');
    assert.equal(await p.getByRole('button', { name: 'Get started', exact: true }).count(), 0);
    await shot(p, 'a-popup-start');
    results.push('a: standalone-mode popup with fake emulator user → Choose your start (never Welcome)');
    console.log(results.at(-1));

    // (b1) Persist a subview and a changed course selection, then reload using actual Firebase persistence.
    await p.getByRole('button', { name: /AI & Robotics starter set/ }).click();
    await p.getByRole('switch').first().waitFor();
    await p.getByRole('switch').first().click();
    const before = await saved(p);
    assert.equal(before.view, 'starter');
    assert.ok(Array.isArray(before.choices));
    await p.reload();
    await heading(p, 'AI & Robotics starter set');
    await p.getByRole('switch').first().waitFor();
    assert.deepEqual(await saved(p), before);
    assert.equal(await p.getByRole('switch').first().getAttribute('aria-checked'), 'false');
    await shot(p, 'b1-restored-choices');
    results.push('b1: reload mid-onboarding restores start/starter and changed course choices');
    console.log(results.at(-1));

    // (b2) Reload while signed in with progress cleared back to welcome: must skip Welcome & sign-in.
    await p.evaluate(() => localStorage.removeItem('flipwise.onboarding-progress.v1'));
    await p.addInitScript(() => {
      window.__sawWelcome = false;
      const check = () => {
        if (document.body && document.body.innerText.includes('Get started')) window.__sawWelcome = true;
      };
      new MutationObserver(check).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await p.reload();
    await heading(p, 'Choose your start');
    assert.equal(await p.evaluate(() => window.__sawWelcome), false, 'signed-in reload must never flash Welcome');
    assert.equal((await saved(p)).step, 'start');
    await shot(p, 'b2-signedin-skip-signin');
    results.push('b2: reload while signed in skips Welcome and sign-in → Choose your start');
    console.log(results.at(-1));
    await c.close();

    // (c1) Force the SDK's real redirect against the emulator, then return a fake user.
    // WebKit partitions sessionStorage between top-level :9099 and :9099 embedded inside :4443
    // (the same cross-origin redirect storage isolation that affects GitHub Pages + firebaseapp.com).
    // Bridge only the emulator's own redirectEvent key across that test port boundary so the real
    // redirect-with-user path is verified; (c2) verifies the unbridged/empty redirect return.
    c = await context(); p = await c.newPage();
    let capturedRedirect = null;
    await c.exposeFunction('__saveEmulatorRedirect', (k, v) => { capturedRedirect = [k, v]; });
    await c.route('http://127.0.0.1:9099/emulator/auth/handler**', async route => {
      const resp = await route.fetch();
      const body = (await resp.text()).replace(
        'window.location = redirectUrl;',
        'window.__saveEmulatorRedirect("firebase:redirectEvent:" + storageKey, JSON.stringify(authEvent)).then(() => { window.location = redirectUrl; });',
      );
      await route.fulfill({ response: resp, body });
    });
    await c.route('http://127.0.0.1:9099/emulator/auth/iframe**', async route => {
      const resp = await route.fetch();
      let body = await resp.text();
      if (capturedRedirect) {
        const [k, v] = capturedRedirect;
        capturedRedirect = null;
        body = body.replace('<script>', `<script>sessionStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});</script><script>`);
      }
      await route.fulfill({ response: resp, body });
    });
    await account(p, '?authTest=redirect');
    await p.getByRole('button', { name: 'Sign in with Google', exact: true }).click();
    await p.waitForURL('http://127.0.0.1:9099/emulator/auth/handler**');
    await fakeUser(p, `redirect-${Date.now()}@example.test`);
    await heading(p, 'Choose your start');
    assert.equal((await saved(p)).step, 'start');
    await shot(p, 'c1-redirect-user');
    results.push('c1: forced emulator redirect with user → Choose your start');
    console.log(results.at(-1));
    await c.close();

    // (c2) Unbridged cross-origin redirect return (WebKit partitioned sessionStorage) and abandoned redirect
    // both return without a user and must stay on account with explanation + Try again (never Welcome).
    c = await context(); p = await c.newPage();
    await account(p, '?authTest=redirect');
    await p.getByRole('button', { name: 'Sign in with Google', exact: true }).click();
    await p.waitForURL('http://127.0.0.1:9099/emulator/auth/handler**');
    await p.goto(base);
    await p.getByRole('alert').filter({ hasText: "Sign-in didn't finish in the app" }).waitFor({ timeout: 45000 });
    await p.getByRole('button', { name: 'Try again', exact: true }).waitFor();
    assert.equal((await saved(p)).step, 'account');
    await shot(p, 'c2-redirect-no-user');
    results.push('c2: redirect returning without user → explanation and Try again (stays on account)');
    console.log(results.at(-1));
    await c.close();

    // (d) Two actual SDK popup cancellations unlock the account-free escape.
    c = await context(); p = await c.newPage();
    await account(p);
    for (let i = 0; i < 2; i++) {
      const opened = p.waitForEvent('popup');
      await p.getByRole('button', { name: i ? 'Try again' : 'Sign in with Google', exact: true }).click();
      const cancelled = await opened;
      await cancelled.waitForLoadState();
      await cancelled.close();
      await p.getByRole('alert').filter({ hasText: 'cancelled' }).waitFor({ timeout: 30000 });
    }
    await p.getByRole('button', { name: 'Continue without account', exact: true }).waitFor();
    await shot(p, 'd-cancel-twice');
    await p.getByRole('button', { name: 'Continue without account', exact: true }).click();
    await heading(p, 'Choose your start');
    results.push('d: two real popup cancellations → visible errors, retry, escape → Choose your start');
    console.log(results.at(-1));
    await c.close();
  }
  assert.deepEqual(errors, [], 'page errors');
  assert.deepEqual(unexpected, [], 'unexpected external requests');
  const evidence = { browser: 'Playwright WebKit', device: 'iPhone 15', base, results, errors, unexpected };
  fs.writeFileSync(path.join(out, production ? 'production-results.json' : 'emulator-results.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
