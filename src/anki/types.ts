import { STUDY_CONFIG } from '../scheduler';
import type { Subject, DemoCard } from "../demoSubjects";
import type { ReviewEvent } from "../reviewLog";
export interface ImportedCard extends DemoCard {
  stableId: string;
  guid: string;
  ord: number;
  template: string;
  queuePosition: number;
  format: "anki";
  source?: string;
  tags: string[];
  extra: Record<string, string>;
  fields: Record<string, string>;
  deckPath: string;
}
export interface ImportedData {
  subjects: Subject[];
  media: Record<string, Uint8Array>;
  packageName: string;
  notes: number;
  revlog: ReviewEvent[];
  warnings: string[];
}
export interface ImportReport {
  new: number;
  updated: number;
  unchanged: number;
  missing: number;
}
export const stableCardId = (s: string, l: string, c: DemoCard) =>
  c.stableId ?? `${s}/${l}/${c.id}`;
export function courseCap(name: string) {
  const key = ({'analysis 1':'analysis-1','introduction to robotics':'robotics',robotics:'robotics','physics 1':'physics-1','programming 1':'programming-1'} as Record<string, keyof typeof STUDY_CONFIG.courseNew>)[name.trim().toLowerCase()];
  return key ? STUDY_CONFIG.courseNew[key] : STUDY_CONFIG.defaultNew;
}
export function allCards(data: Pick<ImportedData, "subjects">): ImportedCard[] {
  return data.subjects.flatMap((s) =>
    s.lectures.flatMap((l) => l.cards),
  ) as ImportedCard[];
}
/** Notes are upserted by GUID; removed notes are retained and reported. */
export function mergeImport(
  previous: ImportedData | null,
  incoming: ImportedData,
  events: readonly ReviewEvent[],
) {
  const old = allCards(previous ?? { subjects: [] }),
    next = allCards(incoming);
  const oldNotes = new Map<string, string>(),
    newNotes = new Map<string, string>();
  const signature = (c: ImportedCard) =>
    JSON.stringify({ fields: c.fields, tags: c.tags, deckPath: c.deckPath });
  old.forEach((c) => oldNotes.set(c.guid, signature(c)));
  next.forEach((c) => newNotes.set(c.guid, signature(c)));
  const report: ImportReport = { new: 0, updated: 0, unchanged: 0, missing: 0 };
  newNotes.forEach((sig, guid) => {
    report[
      !oldNotes.has(guid)
        ? "new"
        : oldNotes.get(guid) === sig
          ? "unchanged"
          : "updated"
    ]++;
  });
  oldNotes.forEach((_, guid) => {
    if (!newNotes.has(guid)) report.missing++;
  });
  const learned = new Set(events.map((e) => e.cardId));
  const byId = new Map(old.map((c) => [c.stableId, c]));
  const merged = new Map(old.map((c) => [c.stableId, c]));
  for (const c of next)
    merged.set(c.stableId, {
      ...c,
      queuePosition: learned.has(c.stableId)
        ? (byId.get(c.stableId)?.queuePosition ?? c.queuePosition)
        : c.queuePosition,
    });
  const subjects: Subject[] = [];
  for (const subject of [...incoming.subjects, ...(previous?.subjects ?? [])]) {
    let target = subjects.find((s) => s.id === subject.id);
    if (!target) {
      // Study limits are the user's, not the package's: a re-import keeps them.
      const study = previous?.subjects.find((s) => s.id === subject.id)?.study;
      target = { ...subject, lectures: [], total: 0, ...(study ? { study } : {}) };
      subjects.push(target);
    }
    for (const lesson of subject.lectures) {
      let dest = target.lectures.find((l) => l.id === lesson.id);
      if (!dest) {
        const study = previous?.subjects.find((s) => s.id === subject.id)?.lectures.find((l) => l.id === lesson.id)?.study;
        dest = { ...lesson, cards: [], ...(study ? { study } : {}) };
        target.lectures.push(dest);
      }
      for (const card of lesson.cards as ImportedCard[]) {
        const c = merged.get(card.stableId);
        if (!c || c.deckPath !== card.deckPath) continue;
        if (!dest.cards.some((x) => x.stableId === c.stableId))
          dest.cards.push(c);
      }
    }
    target.total = target.lectures.reduce((n, l) => n + l.cards.length, 0);
  }
  return {
    data: {
      ...incoming,
      subjects,
      notes: new Set([...merged.values()].map((c) => c.guid)).size,
      media: { ...previous?.media, ...incoming.media },
    },
    report,
  };
}
export function mergeReviews(
  local: readonly ReviewEvent[],
  incoming: readonly ReviewEvent[],
) {
  const keys = new Set(local.map((e) => `${e.cardId}/${e.at}`));
  return [
    ...local,
    ...incoming.filter((e) => {
      const key = `${e.cardId}/${e.at}`;
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    }),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
