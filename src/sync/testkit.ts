/** Shared fixtures for sync tests (not imported by the app). */
import type { ImportedCard, ImportedData } from '../anki/types';
import type { Rating, ReviewEvent } from '../reviewLog';
import { openReviewStorage } from '../reviewStorage';
import { DEFAULT_SETTINGS, type AppearanceSettings } from '../settings';
import { isSyncableReview } from './demo';
import { SyncEngine, type CloudAdapter } from './engine';

export const SUBJECT = 'anki-course';

export function card(n: number, front = `Q${n}`, lesson = 'L1'): ImportedCard {
  return {
    id: `anki:g${n}:0`, stableId: `anki:g${n}:0`, guid: `g${n}`, ord: 0, template: 'Card 1',
    queuePosition: n, format: 'anki', tags: [], extra: {}, fields: { Front: front, Back: 'A' },
    deckPath: `Course::${lesson}`, front, back: 'A',
  };
}

export function deck(cards: ImportedCard[]): ImportedData {
  const lessons = [...new Set(cards.map((c) => c.deckPath.split('::')[1]))];
  return {
    subjects: [{
      id: SUBJECT, name: 'Course', total: cards.length,
      lectures: lessons.map((l) => ({ id: l, title: `Lecture ${l}`, cards: cards.filter((c) => c.deckPath.endsWith(`::${l}`)) })),
    }],
    media: {}, packageName: 'course.apkg', notes: cards.length, revlog: [], warnings: [],
  };
}

export function review(id: string, n: number, at: string, rating: Rating = 'good', extra: Partial<ReviewEvent> = {}): ReviewEvent {
  return { id, cardId: `anki:g${n}:0`, subjectId: SUBJECT, lessonId: 'L1', rating, at, durationMs: 1000, isNew: false, ...extra };
}

export const cardIds = (data: ImportedData | null) =>
  (data?.subjects ?? []).flatMap((s) => s.lectures.flatMap((l) => l.cards.map((c) => (c as ImportedCard).stableId))).sort();

export const frontOf = (data: ImportedData | null, n: number) =>
  (data?.subjects ?? []).flatMap((s) => s.lectures.flatMap((l) => l.cards)).find((c) => c.id === `anki:g${n}:0`)?.front;

let seq = 0;

/** One "app client": its own IndexedDB, settings store and clock, sharing a cloud. */
export async function makeDevice(label: string, startClock = 10_000) {
  let settings: AppearanceSettings = { ...DEFAULT_SETTINGS };
  const clock = { now: startClock };
  const { storage } = await openReviewStorage({
    name: `flipwise-test-${label}-${++seq}`,
    settings: { load: () => settings, save: (s) => { settings = s; } },
    now: () => clock.now,
  });
  const local = storage.sync!;
  return {
    storage,
    local,
    clock,
    get settings() { return settings; },
    setSettings(next: Partial<AppearanceSettings>) { settings = { ...settings, ...next }; return storage.noteSettings(settings); },
    /** Sign in as uid against `cloud` and return an engine; mirrors the app's sign-in path. */
    async signIn(uid: string, cloud: CloudAdapter) {
      const prep = await local.prepareAccount(uid);
      const engine = new SyncEngine({ local, cloud, uid, isSyncable: isSyncableReview, now: () => clock.now, timeoutMs: 0 });
      return { prep, engine };
    },
    async state() {
      const s = await local.load();
      return { data: s.data, events: s.events, meta: s.meta, settings: s.settings };
    },
  };
}
