import { describe, expect, it } from 'vitest';
import { INSTALL_HELP, installMethod, type InstallEnv } from './install';
import { buildVersion, passThrough, shellCacheName, shouldPrecache, staleCaches } from './swVersion';

const UA = {
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  ipadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  firefoxWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
};
const env = (over: Partial<InstallEnv>): InstallEnv => ({ userAgent: UA.chromeMac, maxTouchPoints: 0, standalone: false, hasPrompt: false, installed: false, ...over });

describe('install button platform logic', () => {
  it('uses the browser prompt on Chrome/Edge (Mac and Windows) once beforeinstallprompt fired', () => {
    expect(installMethod(env({ userAgent: UA.chromeMac, hasPrompt: true }))).toBe('prompt');
    expect(installMethod(env({ userAgent: UA.edgeWin, hasPrompt: true }))).toBe('prompt');
    expect(installMethod(env({ userAgent: UA.edgeWin }))).toBe('other'); // no prompt (yet): menu instructions
  });
  it('explains File › Add to Dock on Safari for Mac', () => {
    expect(installMethod(env({ userAgent: UA.safariMac }))).toBe('safari-mac');
    expect(INSTALL_HELP['safari-mac'].steps[0]).toContain('File › Add to Dock');
  });
  it('explains Share › Add to Home Screen on iPhone and iPad (iPadOS reports a Mac)', () => {
    expect(installMethod(env({ userAgent: UA.iphone, maxTouchPoints: 5 }))).toBe('ios');
    expect(installMethod(env({ userAgent: UA.ipadOS, maxTouchPoints: 5 }))).toBe('ios');
    expect(INSTALL_HELP.ios.steps.join(' ')).toContain('Add to Home Screen');
  });
  it('tells Firefox users to use another browser', () => {
    expect(installMethod(env({ userAgent: UA.firefoxWin }))).toBe('firefox');
    expect(installMethod(env({ userAgent: UA.firefoxMac }))).toBe('firefox');
  });
  it('hides the button when already installed or after appinstalled', () => {
    expect(installMethod(env({ standalone: true, hasPrompt: true }))).toBe('installed');
    expect(installMethod(env({ installed: true, userAgent: UA.safariMac }))).toBe('installed');
  });
});

describe('service worker versioning', () => {
  it('derives a stable version from the build, independent of order, that changes with any file', () => {
    const a = buildVersion(['assets/index-abc.js', 'assets/index-def.css', 'icons/icon-192.png:1a2b']);
    expect(buildVersion(['icons/icon-192.png:1a2b', 'assets/index-def.css', 'assets/index-abc.js'])).toBe(a);
    expect(buildVersion(['assets/index-abd.js', 'assets/index-def.css', 'icons/icon-192.png:1a2b'])).not.toBe(a);
    expect(shellCacheName(a)).toBe(`flipwise-shell-${a}`);
  });
  it('deletes only older shell caches on activate', () => {
    expect(staleCaches(['flipwise-shell-old', 'flipwise-shell-new', 'flipwise-runtime-v1', 'other-app'], 'new')).toEqual(['flipwise-shell-old']);
  });
  it('precaches the shell but leaves the starter pack, wasm and downloads to runtime/network', () => {
    for (const p of ['index.html', 'assets/index-abc.js', 'assets/index-abc.css', 'assets/KaTeX_Main-Regular-x.woff2', 'icons/icon-192.png', 'manifest.webmanifest'])
      expect(shouldPrecache(p)).toBe(true);
    for (const p of ['starter/ai-robotics.json', 'assets/sql-wasm-x.wasm', 'assets/flipwise-deck-maker-x.zip', 'assets/ai-deck-guide-x.md', 'assets/KaTeX_Main-x.ttf', 'sw.js'])
      expect(shouldPrecache(p)).toBe(false);
  });
  it('never handles cross-origin requests (Firebase, Google sign-in, Firestore)', () => {
    const scope = 'https://malikovski.github.io/flipwise/';
    expect(passThrough('https://firestore.googleapis.com/v1/projects/x', scope)).toBe(true);
    expect(passThrough('https://accounts.google.com/o/oauth2', scope)).toBe(true);
    expect(passThrough('https://malikovski.github.io/other-repo/', scope)).toBe(true);
    expect(passThrough('https://malikovski.github.io/flipwise/assets/index.js', scope)).toBe(false);
  });
});
