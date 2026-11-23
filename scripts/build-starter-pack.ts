/**
 * Build the "AI & Robotics starter set" from Joseph's Anki export.
 *
 *   npm run build:starter -- "artifacts/anki/Semester 1.apkg"
 *
 * Reads the .apkg READ-ONLY with the app's own parser (src/anki/package.ts), so card ids,
 * subject ids and lecture ids are exactly what importing that .apkg would produce: adding the
 * starter set and later importing the real deck upserts instead of duplicating. All review
 * history, scheduling and media are dropped. Output: public/starter/ai-robotics.json
 * (copied verbatim to dist/, fetched only when the user picks the starter set).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, basename, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import initSqlJs from 'sql.js';
import { parsePackage } from '../src/anki/package';
import type { ImportedCard } from '../src/anki/types';
import { STARTER_FORMAT, STARTER_VERSION, type StarterPack } from '../src/onboarding/starterPack';

const input = resolve(process.argv.slice(2).find((a) => a !== '--') ?? 'artifacts/anki/Semester 1.apkg');
const output = resolve('public/starter/ai-robotics.json');

const SQL = await initSqlJs();
const parsed = parsePackage(new Uint8Array(readFileSync(input)), SQL, basename(input));

const subjects = parsed.subjects.map((s) => ({
  ...s,
  lectures: s.lectures.map((l) => ({
    ...l,
    cards: (l.cards as ImportedCard[]).map((c) => {
      if (!c.guid || !c.stableId) throw new Error(`Card without a stable GUID in ${s.name} › ${l.title}`);
      // ImportedCard carries no scheduling (due/ivl/ease live in Anki's cards table and are not
      // read); queuePosition is only the new-card order. Keep the card exactly as an import would.
      return c;
    }),
  })),
}));

const pack: StarterPack = {
  format: STARTER_FORMAT,
  version: STARTER_VERSION,
  title: 'AI & Robotics starter set',
  description: 'Decks by Joseph, derived from the lecture slides of the AI & Robotics programme.',
  source: basename(input),
  subjects,
};

const json = JSON.stringify(pack);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, json);

const cards = subjects.reduce((n, s) => n + s.total, 0);
console.log(`Wrote ${output}`);
console.log(`  ${subjects.length} subjects · ${cards} cards · ${parsed.notes} notes`);
console.log(`  dropped: ${parsed.revlog.length} reviews, ${Object.keys(parsed.media).length} media files`);
for (const s of subjects) console.log(`  ${s.name}: ${s.lectures.length} lectures, ${s.total} cards (new/day ${s.dailyNew})`);
for (const w of parsed.warnings) console.log(`  warning: ${w}`);
console.log(`  size: ${(json.length / 1024).toFixed(0)} KiB raw, ${(gzipSync(json).length / 1024).toFixed(0)} KiB gzip`);
