/**
 * Render the Flipwise app mark (public/icons/flipwise-mark.svg) to the PNG icons the web
 * manifest and iOS need. The PNGs are checked in; re-run only when the mark changes:
 *
 *   node scripts/build-icons.mjs
 *
 * Rasterizing uses Playwright's Chromium (no project dependency). If `playwright` isn't
 * resolvable, set PLAYWRIGHT_MODULE to its path, e.g. from `npx -y playwright@1.65.1 --version`'s
 * npx cache (~/.npm/_npx/<hash>/node_modules/playwright).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const out = resolve('public/icons');
const mark = readFileSync(join(out, 'flipwise-mark.svg'), 'utf8');

async function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright'];
  const npx = join(homedir(), '.npm/_npx');
  if (existsSync(npx)) for (const d of readdirSync(npx)) candidates.push(join(npx, d, 'node_modules/playwright/index.mjs'));
  for (const c of candidates.filter(Boolean)) {
    try { return await import(c.startsWith('/') ? pathToFileURL(c).href : c); } catch { /* try next */ }
  }
  throw new Error('Playwright not found. Run `npx -y playwright@1.65.1 install chromium` once, or set PLAYWRIGHT_MODULE.');
}

// "any" icons: macOS-style rounded square with transparent margin (Chrome/Edge show them as-is).
// maskable / apple-touch: full-bleed square; the OS applies its own mask (content in the safe zone).
const variants = [
  { file: 'icon-192.png', size: 192, mode: 'rounded' },
  { file: 'icon-512.png', size: 512, mode: 'rounded' },
  { file: 'maskable-512.png', size: 512, mode: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, mode: 'full' },
  { file: 'favicon-32.png', size: 32, mode: 'rounded' },
];

const html = ({ size, mode }) => {
  const inner = mode === 'rounded' ? size * 0.8125 : size; // Apple's 824/1024 icon grid
  const radius = mode === 'rounded' ? inner * 0.225 : 0;
  const art = mode === 'maskable' ? 1.12 : 1.36; // maskable keeps the cards inside the 80% safe zone
  return `<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:${size}px;height:${size}px;display:grid;place-items:center">
  <div style="width:${inner}px;height:${inner}px;border-radius:${radius}px;overflow:hidden;display:grid;place-items:center;
    background:linear-gradient(160deg,#6d6bf0,#4644c4)">
    <div style="width:${inner}px;height:${inner}px;transform:scale(${art})">${mark.replace('<svg', '<svg width="100%" height="100%"')}</div>
  </div>
</div></body></html>`;
};

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
for (const v of variants) {
  const page = await browser.newPage({ viewport: { width: v.size, height: v.size }, deviceScaleFactor: 1 });
  await page.setContent(html(v));
  await page.screenshot({ path: join(out, v.file), omitBackground: v.mode === 'rounded' });
  await page.close();
  console.log('wrote', v.file);
}
await browser.close();
