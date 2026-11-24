import { createContext, useContext, useEffect, useState } from 'react';
import { resolveHeadingId, slugify } from './slug';
import type { NoteCourseMeta, NoteDocument, NoteLectureMeta, NotesIndex } from './types';

export interface NoteOpenTarget {
  courseSlug: string;
  noteSlug: string;
  headingId?: string;
}

export const NoteOpenContext = createContext<((target: NoteOpenTarget) => void) | null>(null);

export function useOpenNote() {
  return useContext(NoteOpenContext);
}

let indexCache: NotesIndex | null = null;
let indexPromise: Promise<NotesIndex | null> | null = null;
const noteCache = new Map<string, NoteDocument>();

function baseUrl(): string {
  const raw = import.meta.env.BASE_URL || '/';
  return raw.endsWith('/') ? raw : `${raw}/`;
}

export function fetchNotesIndex(): Promise<NotesIndex | null> {
  if (indexCache) return Promise.resolve(indexCache);
  if (!indexPromise) {
    indexPromise = fetch(`${baseUrl()}notes/index.json`)
      .then((res) => (res.ok ? (res.json() as Promise<NotesIndex>) : null))
      .then((data) => {
        if (data) indexCache = data;
        return data;
      })
      .catch(() => null);
  }
  return indexPromise;
}

export function fetchNoteDocument(courseSlug: string, noteSlug: string): Promise<NoteDocument | null> {
  const key = `${courseSlug}/${noteSlug}`;
  const cached = noteCache.get(key);
  if (cached) return Promise.resolve(cached);
  return fetch(`${baseUrl()}notes/${encodeURIComponent(courseSlug)}/${encodeURIComponent(noteSlug)}.json`)
    .then((res) => (res.ok ? (res.json() as Promise<NoteDocument>) : null))
    .then((doc) => {
      if (doc) noteCache.set(key, doc);
      return doc;
    })
    .catch(() => null);
}

/** React hook that lazily loads the notes index once (only when enabled). */
export function useNotesIndex(enabled = true): NotesIndex | null {
  const [data, setData] = useState<NotesIndex | null>(() => indexCache);
  useEffect(() => {
    if (!enabled || data) return;
    let active = true;
    void fetchNotesIndex().then((loaded) => {
      if (active && loaded) setData(loaded);
    });
    return () => {
      active = false;
    };
  }, [enabled, data]);
  return data;
}

export interface ParsedVaultSource {
  isSemesterVault: boolean;
  courseName?: string;
  folder?: string;
  noteStem?: string;
  headingText?: string;
  displayText: string;
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse a flashcard `source` field such as:
 * `<a href="obsidian://open?vault=Vault&file=University%2FRobotics%20and%20AI%2FSemester%201%2FAnalysis%201%2Fslides%2F6%20Sequences">6 Sequences</a> › What is a sequence?`
 */
export function parseVaultSource(source: string): ParsedVaultSource {
  const displayText = stripTags(source);
  const hrefMatch = source.match(/href=["'](obsidian:\/\/open\?[^"']+)["']/i);
  const rawUrl = hrefMatch ? hrefMatch[1].replace(/&amp;/g, '&') : (/^obsidian:\/\/open\?/i.test(source.trim()) ? source.trim() : undefined);

  if (!rawUrl) {
    return { isSemesterVault: false, displayText };
  }

  let fileParam: string | null = null;
  try {
    const u = new URL(rawUrl);
    fileParam = u.searchParams.get('file');
  } catch {
    const fm = rawUrl.match(/[?&]file=([^&]+)/i);
    if (fm) {
      try { fileParam = decodeURIComponent(fm[1]); } catch { fileParam = fm[1]; }
    }
  }

  if (!fileParam) {
    return { isSemesterVault: false, displayText };
  }

  const normalized = fileParam.replace(/\\/g, '/').replace(/\.md$/i, '');
  const semMatch = normalized.match(/(?:^|\/)University\/Robotics and AI\/Semester 1\/([^/]+)\/([^/]+)\/(.+)$/i);
  if (!semMatch) {
    return { isSemesterVault: false, displayText };
  }

  const [, courseName, folder, noteStem] = semMatch;
  const chevronIdx = displayText.indexOf('›');
  const headingText = chevronIdx >= 0 ? displayText.slice(chevronIdx + 1).trim() : undefined;

  return {
    isSemesterVault: true,
    courseName,
    folder: folder.toLowerCase(),
    noteStem,
    headingText: headingText || undefined,
    displayText,
  };
}

export interface ResolvedCardSourceNote {
  kind: 'note';
  courseSlug: string;
  courseName: string;
  noteSlug: string;
  noteTitle: string;
  headingId?: string;
  headingLabel: string;
}

export interface ResolvedCardSourcePlain {
  kind: 'plain';
  text: string;
}

export type ResolvedCardSource = ResolvedCardSourceNote | ResolvedCardSourcePlain | null;

/**
 * Resolve a card's `source` against the loaded NotesIndex.
 * - Included Semester 1 slide note -> `{ kind: 'note', ... }` (never an obsidian:// link)
 * - Semester 1 exercise / excluded note / unresolved Semester 1 path -> `{ kind: 'plain', text }`
 * - Non-Semester-1 source (e.g. external https:// or unrelated custom deck) -> `null`
 */
export function resolveCardSource(
  source: string | undefined,
  index: NotesIndex | null,
): ResolvedCardSource {
  if (!source) return null;
  const parsed = parseVaultSource(source);
  if (!parsed.isSemesterVault) return null;

  if (parsed.folder !== 'slides' || !parsed.courseName || !parsed.noteStem) {
    return { kind: 'plain', text: parsed.displayText };
  }

  if (!index) {
    // Never flash an obsidian:// link while index.json is still loading
    return { kind: 'plain', text: parsed.displayText };
  }

  const courseSlug = slugify(parsed.courseName);
  const course: NoteCourseMeta | undefined =
    index.courses.find((c) => c.slug === courseSlug) ??
    index.courses.find((c) => c.name.toLowerCase() === parsed.courseName!.toLowerCase());

  if (!course) {
    return { kind: 'plain', text: parsed.displayText };
  }

  const noteSlug = slugify(parsed.noteStem);
  const lecture: NoteLectureMeta | undefined =
    course.lectures.find((l) => l.slug === noteSlug) ??
    course.lectures.find((l) => l.fileName.replace(/\.md$/i, '').toLowerCase() === parsed.noteStem!.toLowerCase());

  if (!lecture) {
    // Excluded slide note (e.g. 5.1 Loops Task Sheet 3 or 0 Course Organisation)
    return { kind: 'plain', text: parsed.displayText };
  }

  const headingId = resolveHeadingId(lecture.headings, parsed.headingText);
  return {
    kind: 'note',
    courseSlug: course.slug,
    courseName: course.name,
    noteSlug: lecture.slug,
    noteTitle: lecture.title,
    headingId,
    headingLabel: parsed.headingText || lecture.title,
  };
}

/** Parse `#/notes/<course>/<note>#<heading>` route segments. */
export function parseNotesHash(hash: string): {
  courseSlug?: string;
  noteSlug?: string;
  headingId?: string;
} {
  const withoutPrefix = hash.replace(/^#\/?/, '');
  const hashIdx = withoutPrefix.indexOf('#');
  const routePath = hashIdx >= 0 ? withoutPrefix.slice(0, hashIdx) : withoutPrefix;
  const headingId = hashIdx >= 0 ? decodeURIComponent(withoutPrefix.slice(hashIdx + 1)) || undefined : undefined;
  const segs = routePath.split('/').filter(Boolean);
  if (segs[0] !== 'notes') return {};
  return {
    courseSlug: segs[1] ? decodeURIComponent(segs[1]) : undefined,
    noteSlug: segs[2] ? decodeURIComponent(segs[2]) : undefined,
    headingId,
  };
}
