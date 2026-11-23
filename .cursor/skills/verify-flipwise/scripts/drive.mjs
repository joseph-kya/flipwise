import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const playwright = require('playwright');

const SCENARIO = process.env.VERIFY_SCENARIO || 'study-session';
const BROWSER_NAME = process.env.VERIFY_BROWSER || 'chromium';
const STRICT = process.env.VERIFY_STRICT === '1';
const MODE = process.env.VERIFY_MODE || 'dev';
const URL = process.env.VERIFY_URL;
const PROFILE_DIR = process.env.VERIFY_PROFILE_DIR;
const ARTIFACTS_DIR = process.env.VERIFY_ARTIFACTS_DIR;
const REPO_ROOT = process.env.VERIFY_REPO_ROOT;
const RUN_ID = process.env.VERIFY_RUN_ID;

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const SEED_DECK_PATH = path.join(REPO_ROOT, 'decks', 'intro-to-robotics.flipwise.json');

if (!URL || !PROFILE_DIR || !ARTIFACTS_DIR) {
  console.error('Missing verification env vars. Invoke via verify-drive.sh.');
  process.exit(2);
}

const browserType = playwright[BROWSER_NAME];
if (!browserType) {
  console.error(`Unsupported browser '${BROWSER_NAME}'. Use chromium or webkit.`);
  process.exit(2);
}

const outDir = path.join(ARTIFACTS_DIR, SCENARIO);
fs.mkdirSync(outDir, { recursive: true });

// Keep each scenario's disposable profile isolated inside this run's temp profile dir.
const scenarioProfile = path.join(PROFILE_DIR, `${BROWSER_NAME}-${SCENARIO}`);
fs.mkdirSync(scenarioProfile, { recursive: true });

async function capturePair(page, stepName) {
  await page.setViewportSize(PHONE);
  // Wait long enough for 550ms card flip transitions to settle cleanly
  await page.waitForTimeout(650);
  const phonePath = path.join(outDir, `${stepName}-phone-390x844.png`);
  await page.screenshot({ path: phonePath, fullPage: true });

  const ariaPath = path.join(outDir, `${stepName}.aria.txt`);
  const aria = await page.locator('body').ariaSnapshot();
  fs.writeFileSync(ariaPath, aria + '\n', 'utf8');

  await page.setViewportSize(DESKTOP);
  await page.waitForTimeout(200);
  const desktopPath = path.join(outDir, `${stepName}-desktop-1440x900.png`);
  await page.screenshot({ path: desktopPath, fullPage: true });

  await page.setViewportSize(PHONE);
  await page.waitForTimeout(150);
  return { phonePath, desktopPath, ariaPath };
}

async function auditTouchTargets(page) {
  await page.setViewportSize(PHONE);
  await page.waitForTimeout(150);
  return page.evaluate(() => {
    const selector = 'button, a[href], select, input:not([type="hidden"]), [role="button"], [role="tab"], [role="checkbox"]';
    const els = Array.from(document.querySelectorAll(selector));
    const measured = [];
    const violations = [];
    for (const el of els) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      const target = (el.tagName === 'INPUT' && el.closest('label')) ? el.closest('label') : el;
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const linkedLabel = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
      const rawLabel =
        el.getAttribute('aria-label') ||
        (linkedLabel ? linkedLabel.textContent : null) ||
        (el.tagName === 'SELECT' ? el.id : target.textContent) ||
        el.id ||
        el.tagName;
      const label = rawLabel.replace(/\s+/g, ' ').trim().slice(0, 60);
      const entry = {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        role: el.getAttribute('role') || null,
        label,
        width: Math.round(rect.width * 10) / 10,
        height: Math.round(rect.height * 10) / 10,
        pass: rect.width >= 44 && rect.height >= 44,
      };
      measured.push(entry);
      if (!entry.pass) violations.push(entry);
    }
    return { total: measured.length, violations, measured };
  });
}

async function auditViewportMeta(page) {
  return page.evaluate(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    const content = meta ? meta.getAttribute('content') || '' : null;
    return {
      present: Boolean(meta),
      content,
      hasDeviceWidth: Boolean(content && /width\s*=\s*device-width/i.test(content)),
    };
  });
}

async function auditReducedMotion(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(50);
  const res = await page.evaluate(() => {
    const matches = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const card = document.querySelector('#card, [aria-label*="flip" i], [data-testid="flashcard"]');
    const cardTransition = card ? window.getComputedStyle(card).transitionDuration : null;
    const animated = Array.from(document.querySelectorAll('button, .card, .bar i, [data-animated]'))
      .map((el) => ({
        label: (el.getAttribute('aria-label') || el.id || el.className || el.tagName).toString().slice(0, 40),
        transitionDuration: window.getComputedStyle(el).transitionDuration,
        animationDuration: window.getComputedStyle(el).animationDuration,
      }));
    const cardHonors = cardTransition === null || cardTransition === '0s' || parseFloat(cardTransition) <= 0.01;
    return { mediaMatches: matches, cardTransition, cardHonors, sample: animated.slice(0, 8) };
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  return res;
}

async function readStorage(page) {
  return page.evaluate(async () => {
    const local = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      try {
        local[k] = JSON.parse(localStorage.getItem(k));
      } catch {
        local[k] = localStorage.getItem(k);
      }
    }
    const idb = [];
    if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases();
      for (const info of dbs) {
        if (!info.name) continue;
        const dbData = await new Promise((resolve) => {
          const req = indexedDB.open(info.name);
          req.onerror = () => resolve({ name: info.name, error: 'open-failed' });
          req.onsuccess = () => {
            const db = req.result;
            const storeNames = Array.from(db.objectStoreNames);
            if (!storeNames.length) {
              db.close();
              resolve({ name: info.name, version: db.version, stores: {} });
              return;
            }
            const tx = db.transaction(storeNames, 'readonly');
            const stores = {};
            let pending = storeNames.length;
            for (const sName of storeNames) {
              const getAll = tx.objectStore(sName).getAll();
              getAll.onsuccess = () => {
                stores[sName] = { count: getAll.result.length, sample: getAll.result.slice(0, 5) };
                if (--pending === 0) {
                  db.close();
                  resolve({ name: info.name, version: db.version, stores });
                }
              };
              getAll.onerror = () => {
                stores[sName] = { error: 'read-failed' };
                if (--pending === 0) {
                  db.close();
                  resolve({ name: info.name, version: db.version, stores });
                }
              };
            }
          };
        });
        idb.push(dbData);
      }
    }
    return { indexedDB: idb, localStorage: local };
  });
}

async function waitForCardReady(page) {
  const cardBtn = page.getByRole('button', { name: /flashcard|flip|show answer/i }).first();
  await cardBtn.waitFor({ state: 'visible', timeout: 10000 });
  // Wait for card text to populate (deck fetch / IDB load)
  await page.waitForFunction(() => {
    const q = document.querySelector('#fQ, [data-testid="card-front"], .q');
    return q && q.textContent.trim().length > 0;
  }, { timeout: 10000 });
  return cardBtn;
}

async function getCurrentCardInfo(page) {
  return page.evaluate(() => {
    const qEl = document.querySelector('#fQ, [data-testid="card-front"], .q');
    const aEl = document.querySelector('#bA, [data-testid="card-back"], .a');
    const idEl = document.querySelector('#fSrc, [data-testid="card-id"]');
    const posEl = document.querySelector('#pos');
    const totEl = document.querySelector('#tot');
    return {
      id: idEl ? idEl.textContent.trim() : null,
      question: qEl ? qEl.textContent.trim() : '',
      answer: aEl ? aEl.textContent.trim() : '',
      pos: posEl ? posEl.textContent.trim() : null,
      tot: totEl ? totEl.textContent.trim() : null,
    };
  });
}

async function checkOfflineReload(context, page) {
  await context.setOffline(true);
  let loaded = false;
  let error = null;
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 5000 });
    const bodyText = await page.locator('body').innerText({ timeout: 3000 });
    loaded = /Flipwise/i.test(bodyText);
  } catch (err) {
    error = err.message.split('\n')[0];
  } finally {
    await context.setOffline(false);
  }
  return { loaded, error };
}

const report = {
  runId: RUN_ID,
  mode: MODE,
  browser: BROWSER_NAME,
  scenario: SCENARIO,
  url: URL,
  timestamp: new Date().toISOString(),
  consoleErrors: [],
  pageErrors: [],
  checks: {},
  artifacts: [],
  passed: false,
  failures: [],
  standInGaps: [],
};

function assertCheck(name, condition, message, { standInAllowed = false } = {}) {
  report.checks[name] = { pass: Boolean(condition), message };
  if (!condition) {
    if (MODE === 'mockup' && standInAllowed && !STRICT) {
      report.standInGaps.push(`${name}: ${message}`);
    } else {
      report.failures.push(`${name}: ${message}`);
    }
  }
}

const context = await browserType.launchPersistentContext(scenarioProfile, {
  headless: true,
  viewport: PHONE,
  hasTouch: true,
});

const page = context.pages()[0] || (await context.newPage());
page.on('console', (msg) => {
  if (msg.type() === 'error') report.consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => {
  report.pageErrors.push(err.message);
});

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

  if (SCENARIO === 'study-session') {
    const cardBtn = await waitForCardReady(page);
    const beforeCard = await getCurrentCardInfo(page);
    report.artifacts.push(await capturePair(page, '01-before-flip'));

    const viewportMeta = await auditViewportMeta(page);
    report.checks.viewportMeta = viewportMeta;
    assertCheck(
      'mobileViewportMeta',
      viewportMeta.hasDeviceWidth,
      'Page must declare <meta name="viewport" content="width=device-width, initial-scale=1"> for iPhone 390px layout',
      { standInAllowed: true }
    );

    const touchAudit = await auditTouchTargets(page);
    report.checks.touchTargets = {
      total: touchAudit.total,
      violationCount: touchAudit.violations.length,
      violations: touchAudit.violations,
    };
    const coreTargetsPass = !touchAudit.violations.some((v) =>
      /flashcard|flip|again|didn't know|hard|unsure|good|knew it/i.test(v.label)
    );
    assertCheck('coreTouchTargets44px', coreTargetsPass, 'Core study controls (card and rating buttons) must be >= 44x44px');
    assertCheck(
      'allTouchTargets44px',
      touchAudit.violations.length === 0,
      `${touchAudit.violations.length} interactive control(s) smaller than 44x44px at 390x844: ${touchAudit.violations.map((v) => `${v.label} (${v.width}x${v.height})`).join(', ')}`,
      { standInAllowed: true }
    );

    const motionAudit = await auditReducedMotion(page);
    report.checks.reducedMotion = motionAudit;
    assertCheck(
      'prefersReducedMotion',
      motionAudit.mediaMatches && motionAudit.cardHonors,
      `card transitionDuration under reduce=${motionAudit.cardTransition}`
    );

    // Flip the card
    await cardBtn.click();
    const btnAgain = page.getByRole('button', { name: /again|didn't know/i }).first();
    const btnHard = page.getByRole('button', { name: /hard|unsure/i }).first();
    const btnGood = page.getByRole('button', { name: /good|knew it/i }).first();
    await btnGood.waitFor({ state: 'visible', timeout: 5000 });

    const ratingVisible = (await btnAgain.isVisible()) && (await btnHard.isVisible()) && (await btnGood.isVisible());
    assertCheck('flipRevealsRatings', ratingVisible, 'Flipping card exposes Again/Hard/Good rating buttons');
    report.artifacts.push(await capturePair(page, '02-after-flip'));

    // Rate Good -> next card appears
    await btnGood.click();
    await page.waitForFunction(
      (prevQ) => {
        const q = document.querySelector('#fQ, [data-testid="card-front"], .q');
        return q && q.textContent.trim() !== prevQ;
      },
      beforeCard.question,
      { timeout: 5000 }
    );
    const afterCard = await getCurrentCardInfo(page);
    assertCheck(
      'nextCardAppears',
      afterCard.question !== beforeCard.question,
      `Card advanced from '${beforeCard.id || beforeCard.question.slice(0, 30)}' to '${afterCard.id || afterCard.question.slice(0, 30)}'`
    );
    report.artifacts.push(await capturePair(page, '03-after-rate'));

    // Check storage + reload persistence
    const storageBeforeReload = await readStorage(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForCardReady(page);
    const afterReloadCard = await getCurrentCardInfo(page);
    const storageAfterReload = await readStorage(page);
    report.checks.storage = {
      indexedDBCount: storageAfterReload.indexedDB.length,
      localStorageKeys: Object.keys(storageAfterReload.localStorage),
      cardBeforeRate: beforeCard.id || beforeCard.question,
      cardAfterReload: afterReloadCard.id || afterReloadCard.question,
      beforeReload: storageBeforeReload,
      afterReload: storageAfterReload,
    };

    const persistedUi = afterReloadCard.question !== beforeCard.question;
    assertCheck('reloadPersistsProgress', persistedUi, 'Rated card does not reappear as first due card after reload');
    assertCheck(
      'indexedDBPersisted',
      storageAfterReload.indexedDB.length > 0,
      'PWA review state must persist in IndexedDB (mockup uses localStorage instead)',
      { standInAllowed: true }
    );

    // Offline reload check
    const offlineRes = await checkOfflineReload(context, page);
    report.checks.offlineReload = offlineRes;
    assertCheck(
      'offlineModeReload',
      offlineRes.loaded,
      offlineRes.loaded ? 'App reloaded offline' : `Offline reload failed (${offlineRes.error || 'not cached'}; requires vite preview + service worker)`,
      { standInAllowed: MODE !== 'preview' }
    );
  } else if (SCENARIO === 'scheduling') {
    const cardBtn = await waitForCardReady(page);
    const rated = [];
    for (const [label, regex] of [
      ['again', /again|didn't know/i],
      ['hard', /hard|unsure/i],
      ['good', /good|knew it/i],
    ]) {
      const info = await getCurrentCardInfo(page);
      await cardBtn.click();
      await page.getByRole('button', { name: regex }).first().click();
      await page.waitForTimeout(150);
      rated.push({ rating: label, id: info.id, question: info.question });
    }
    report.artifacts.push(await capturePair(page, '01-after-three-ratings'));

    const storageBefore = await readStorage(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForCardReady(page);
    const storageAfter = await readStorage(page);
    report.artifacts.push(await capturePair(page, '02-after-reload'));

    // Inspect scheduling due dates (mockup localStorage['fw.srs'] or IndexedDB)
    const srs = storageAfter.localStorage['fw.srs'] || null;
    if (srs && rated.every((r) => r.id && srs[r.id])) {
      const dueAgain = srs[rated[0].id].due;
      const dueHard = srs[rated[1].id].due;
      const dueGood = srs[rated[2].id].due;
      report.checks.schedulingOrder = { rated, dueAgain, dueHard, dueGood };
      assertCheck(
        'dueOrdering',
        dueAgain < dueHard && dueHard < dueGood,
        `Expected due(Again) < due(Hard) < due(Good), got ${dueAgain}, ${dueHard}, ${dueGood}`
      );
    } else {
      assertCheck(
        'indexedDBSchedulingPersisted',
        storageAfter.indexedDB.length > 0,
        'Expected scheduling records in IndexedDB (or fw.srs in mockup)'
      );
    }
    assertCheck(
      'indexedDBPersisted',
      storageAfter.indexedDB.length > 0,
      'PWA scheduling must persist in IndexedDB',
      { standInAllowed: true }
    );
    report.checks.storageBeforeReload = storageBefore;
    report.checks.storageAfterReload = storageAfter;
  } else if (SCENARIO === 'navigation') {
    await waitForCardReady(page);
    const subjectSelect = page.getByRole('combobox', { name: /subject/i });
    const lectureSelect = page.getByRole('combobox', { name: /lecture/i });
    assertCheck('subjectSelectorVisible', await subjectSelect.isVisible(), 'Subject combobox is visible');
    assertCheck('lectureSelectorVisible', await lectureSelect.isVisible(), 'Lecture combobox is visible');

    await lectureSelect.selectOption('L02');
    await page.waitForTimeout(150);
    const l02Card = await getCurrentCardInfo(page);
    assertCheck('lectureL02Filter', (l02Card.id || '').startsWith('ir-l02') || l02Card.tot === '46', `L02 card=${l02Card.id}, tot=${l02Card.tot}`);
    report.artifacts.push(await capturePair(page, '01-lecture-l02'));

    const examOnly = page.getByRole('checkbox', { name: /exam-style/i });
    if (await examOnly.isVisible()) {
      await examOnly.check();
      await page.waitForTimeout(150);
      const examCard = await getCurrentCardInfo(page);
      assertCheck('examOnlyFilter', Number(examCard.tot) > 0 && Number(examCard.tot) <= 46, `Exam-style subset tot=${examCard.tot}`);
      report.artifacts.push(await capturePair(page, '02-lecture-l02-exam'));
    }
  } else if (SCENARIO === 'import') {
    const decksTab = page.getByRole('tab', { name: /decks/i });
    if (await decksTab.isVisible()) await decksTab.click();
    await page.waitForTimeout(150);
    report.artifacts.push(await capturePair(page, '01-decks-view'));

    const fileInput = page.locator('input[type="file"]').first();
    const hasFileInput = (await fileInput.count()) > 0;
    assertCheck('importFileInputPresent', hasFileInput, 'Deck import requires an <input type="file"> accepting *.flipwise.json (missing in mockup)');
    if (hasFileInput) {
      await fileInput.setInputFiles(SEED_DECK_PATH);
      await page.waitForTimeout(500);
      const bodyText = await page.locator('body').innerText();
      assertCheck('importedDeckVisible', /Introduction to Robotics/i.test(bodyText) && /341/.test(bodyText), 'Imported deck and 341 card count appear');
      report.artifacts.push(await capturePair(page, '02-after-import'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      const storage = await readStorage(page);
      assertCheck('importedDeckPersistedIDB', storage.indexedDB.length > 0, 'Imported deck persisted in IndexedDB');
    }
  } else if (SCENARIO === 'offline') {
    const manifestInfo = await page.evaluate(async () => {
      const link = document.querySelector('link[rel="manifest"]');
      if (!link) return { present: false };
      const res = await fetch(link.href);
      return { present: true, status: res.status, json: res.ok ? await res.json() : null };
    });
    report.checks.manifest = manifestInfo;
    assertCheck('webAppManifest', manifestInfo.present && manifestInfo.status === 200, 'Web App Manifest link present and returns HTTP 200');

    const swState = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { supported: false };
      const regs = await navigator.serviceWorker.getRegistrations();
      return {
        supported: true,
        registrations: regs.length,
        controlled: Boolean(navigator.serviceWorker.controller),
      };
    });
    report.checks.serviceWorker = swState;
    assertCheck('serviceWorkerRegistered', swState.registrations > 0, `Service worker registrations=${swState.registrations}`);

    const offlineRes = await checkOfflineReload(context, page);
    report.checks.offlineReload = offlineRes;
    assertCheck('offlineReloadWorks', offlineRes.loaded, offlineRes.error || 'App reloaded while offline');
    report.artifacts.push(await capturePair(page, '01-offline-state'));
  } else if (SCENARIO === 'audit') {
    await waitForCardReady(page);
    report.artifacts.push(await capturePair(page, '01-audit'));
    const touchAudit = await auditTouchTargets(page);
    const motionAudit = await auditReducedMotion(page);
    const storage = await readStorage(page);
    report.checks.touchTargets = touchAudit;
    report.checks.reducedMotion = motionAudit;
    report.checks.storage = storage;
    assertCheck('allTouchTargets44px', touchAudit.violations.length === 0, `${touchAudit.violations.length} controls < 44x44px`, { standInAllowed: true });
    assertCheck('prefersReducedMotion', motionAudit.mediaMatches && motionAudit.cardHonors, `cardTransition=${motionAudit.cardTransition}`);
  } else {
    throw new Error(`Unknown scenario '${SCENARIO}'.`);
  }

  assertCheck('noPageErrors', report.pageErrors.length === 0, `Uncaught page errors: ${report.pageErrors.join('; ') || 'none'}`);
  report.passed = report.failures.length === 0;
} catch (err) {
  report.failures.push(`exception: ${err.message}`);
  report.passed = false;
} finally {
  await context.close();
}

const reportPath = path.join(outDir, 'report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log(`Scenario: ${SCENARIO} (mode=${MODE}, browser=${BROWSER_NAME})`);
console.log(`Report:   ${reportPath}`);
for (const a of report.artifacts) {
  console.log(`  Phone:   ${a.phonePath}`);
  console.log(`  Desktop: ${a.desktopPath}`);
  console.log(`  ARIA:    ${a.ariaPath}`);
}
if (report.standInGaps.length > 0) {
  console.log('Stand-in gaps observed (unverified until real PWA exists):');
  for (const g of report.standInGaps) console.log(`  - ${g}`);
}
if (report.failures.length > 0) {
  console.error('FAILURES:');
  for (const f of report.failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('PASSED.');
