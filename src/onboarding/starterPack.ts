/**
 * The "AI & Robotics starter set": Joseph's decks as static JSON in public/starter/, fetched only
 * when chosen (never part of the main bundle). It goes through the normal import path, so it is
 * real (non-demo) data: stable Anki GUID ids, upsert on re-add, and it syncs.
 */
import type { ImportedData } from '../anki/types';
import type { Subject } from '../demoSubjects';

export const STARTER_FORMAT = 'flipwise-starter';
export const STARTER_VERSION = 1;
export const STARTER_PATH = 'starter/ai-robotics.json';

export interface StarterPack {
  format: typeof STARTER_FORMAT;
  version: typeof STARTER_VERSION;
  title: string;
  description: string;
  source: string;
  subjects: Subject[];
}

export function isStarterPack(value: unknown): value is StarterPack {
  const v = value as Partial<StarterPack> | null;
  return !!v && v.format === STARTER_FORMAT && v.version === STARTER_VERSION && Array.isArray(v.subjects);
}

let cached: Promise<StarterPack> | null = null;

export function loadStarterPack(fetchImpl: typeof fetch = fetch, base = import.meta.env?.BASE_URL ?? '/'): Promise<StarterPack> {
  cached ??= fetchImpl(`${base}${STARTER_PATH}`)
    .then((r) => {
      if (!r.ok) throw new Error('Couldn’t download the starter set. Check your connection and try again.');
      return r.json();
    })
    .then((json) => {
      if (!isStarterPack(json)) throw new Error('The starter set file is not valid.');
      return json;
    });
  cached.catch(() => { cached = null; });
  return cached;
}

/** The pack (or chosen subjects) as an import package. Never carries reviews or media. */
export function starterImport(pack: StarterPack, subjectIds?: readonly string[]): ImportedData {
  const pick = subjectIds ? new Set(subjectIds) : null;
  const subjects = pack.subjects.filter((s) => !pick || pick.has(s.id));
  return {
    subjects,
    media: {},
    packageName: pack.title,
    notes: new Set(subjects.flatMap((s) => s.lectures.flatMap((l) => l.cards.map((c) => (c as { guid?: string }).guid ?? c.id)))).size,
    revlog: [],
    warnings: [],
  };
}
