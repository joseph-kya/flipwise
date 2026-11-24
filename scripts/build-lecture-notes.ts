/**
 * Build Joseph's lecture notes from his Obsidian vault (READ-ONLY) into lightweight,
 * sanitized JSON files under public/notes/ (math emitted as data-tex placeholders
 * rendered client-side with KaTeX so the PWA cache stays compact).
 *
 *   npm run build:notes
 *   npm run build:notes -- "/path/to/Vault"
 *
 * Hard rule: ONLY Joseph's own markdown lecture notes in Semester 1/<Course>/slides/*.md.
 * Excludes admin ("0 Course Organisation*"), task sheets ("5.1 Loops (Task Sheet 3).md"),
 * exercises/, materials/, readings/, attachments/embeds, and "*Source: slides..." lines.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import {
  INCLUDED_COURSES,
  NOTE_SANITIZE_CONFIG,
  compareLectures,
  convertNoteMarkdown,
  extractHeadings,
  parseFileNameMeta,
  shouldIncludeNoteFile,
  type NoteLookupEntry,
} from '../src/notes/convert';
import { slugify } from '../src/notes/slug';
import type { NoteCourseMeta, NoteDocument, NoteLectureMeta, NotesIndex } from '../src/notes/types';

const DEFAULT_VAULT = '/Users/josephkyamakya/Library/Mobile Documents/iCloud~md~obsidian/Documents/Vault';
const vaultArg = process.argv.slice(2).find((a) => a !== '--');
const vaultRoot = resolve(vaultArg ?? DEFAULT_VAULT);
const semesterRoot = join(vaultRoot, 'University', 'Robotics and AI', 'Semester 1');
const outRoot = resolve('public/notes');

if (!existsSync(semesterRoot)) {
  throw new Error(`Semester 1 directory not found at: ${semesterRoot}`);
}

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const purify = createDOMPurify(dom.window as unknown as Parameters<typeof createDOMPurify>[0]);
purify.addHook('afterSanitizeAttributes', (node) => {
  if (node.nodeName === 'A') {
    const href = node.getAttribute('href') ?? '';
    if (!href.startsWith('#/notes/') && !/^https?:\/\//i.test(href)) {
      node.removeAttribute('href');
    } else if (/^https?:\/\//i.test(href)) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  }
  // Keep only data-lang on code blocks
  for (const attr of Array.from(node.attributes)) {
    if (attr.name.startsWith('data-') && attr.name !== 'data-lang') {
      node.removeAttribute(attr.name);
    }
  }
});

const sanitize = (html: string): string =>
  purify.sanitize(html, {
    ...NOTE_SANITIZE_CONFIG,
    ALLOWED_TAGS: [...NOTE_SANITIZE_CONFIG.ALLOWED_TAGS],
    ALLOWED_ATTR: [...NOTE_SANITIZE_CONFIG.ALLOWED_ATTR],
  });

interface RawNoteFile {
  courseName: string;
  courseSlug: string;
  fileName: string;
  stem: string;
  number: string | null;
  slug: string;
  markdown: string;
}

const rawByCourse = new Map<string, RawNoteFile[]>();
const lookup = new Map<string, NoteLookupEntry[]>();
const excludedFiles: string[] = [];

const addLookup = (key: string, entry: NoteLookupEntry) => {
  const k = key.toLowerCase();
  const list = lookup.get(k);
  if (list) list.push(entry);
  else lookup.set(k, [entry]);
};

for (const courseName of INCLUDED_COURSES) {
  const courseSlug = slugify(courseName);
  const slidesDir = join(semesterRoot, courseName, 'slides');
  if (!existsSync(slidesDir)) {
    throw new Error(`Expected slides directory not found: ${slidesDir}`);
  }
  const files = readdirSync(slidesDir).sort((a, b) => a.localeCompare(b, 'en'));
  const included: RawNoteFile[] = [];

  for (const fileName of files) {
    if (fileName.startsWith('.')) continue;
    if (!shouldIncludeNoteFile(fileName)) {
      excludedFiles.push(`${courseName}/slides/${fileName}`);
      continue;
    }
    const markdown = readFileSync(join(slidesDir, fileName), 'utf8');
    const meta = parseFileNameMeta(fileName);
    const headings = extractHeadings(markdown);

    included.push({
      courseName,
      courseSlug,
      fileName,
      stem: meta.stem,
      number: meta.number,
      slug: meta.slug,
      markdown,
    });

    const entry: NoteLookupEntry = {
      courseSlug,
      courseName,
      slug: meta.slug,
      stem: meta.stem,
      title: meta.title,
      headings,
    };
    addLookup(meta.stem, entry);
    addLookup(meta.slug, entry);
  }

  included.sort(compareLectures);
  rawByCourse.set(courseName, included);
}

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

const courses: NoteCourseMeta[] = [];
let totalNotes = 0;
let totalBytes = 0;
let totalGzip = 0;

for (const courseName of INCLUDED_COURSES) {
  const courseSlug = slugify(courseName);
  const rawNotes = rawByCourse.get(courseName) ?? [];
  const courseDir = join(outRoot, courseSlug);
  mkdirSync(courseDir, { recursive: true });

  const converted = rawNotes.map((raw) => ({
    raw,
    result: convertNoteMarkdown(
      raw.markdown,
      raw.fileName,
      {
        courseSlug: raw.courseSlug,
        courseName: raw.courseName,
        noteSlug: raw.slug,
        lookup,
      },
      sanitize,
    ),
  }));

  const lectureMetas: NoteLectureMeta[] = [];
  let courseWords = 0;
  let courseMinutes = 0;

  for (let idx = 0; idx < converted.length; idx++) {
    const { raw, result } = converted[idx];
    const prev = idx > 0
      ? { slug: converted[idx - 1].raw.slug, title: converted[idx - 1].result.title, number: converted[idx - 1].result.number }
      : undefined;
    const next = idx < converted.length - 1
      ? { slug: converted[idx + 1].raw.slug, title: converted[idx + 1].result.title, number: converted[idx + 1].result.number }
      : undefined;

    const doc: NoteDocument = {
      version: 1,
      courseSlug,
      courseName,
      slug: raw.slug,
      fileName: raw.fileName,
      number: result.number,
      title: result.title,
      ...(result.subtitleHtml ? { subtitleHtml: result.subtitleHtml } : {}),
      ...(result.buildsOnHtml ? { buildsOnHtml: result.buildsOnHtml } : {}),
      wordCount: result.wordCount,
      readingMinutes: result.readingMinutes,
      headings: result.headings,
      html: result.html,
      ...(prev ? { prev } : {}),
      ...(next ? { next } : {}),
    };

    const json = JSON.stringify(doc);
    writeFileSync(join(courseDir, `${raw.slug}.json`), json);
    totalNotes++;
    totalBytes += Buffer.byteLength(json);
    totalGzip += gzipSync(json).length;

    courseWords += result.wordCount;
    courseMinutes += result.readingMinutes;

    lectureMetas.push({
      slug: raw.slug,
      courseSlug,
      fileName: raw.fileName,
      number: result.number,
      title: result.title,
      excerpt: result.excerpt,
      wordCount: result.wordCount,
      readingMinutes: result.readingMinutes,
      headings: result.headings,
    });
  }

  courses.push({
    slug: courseSlug,
    name: courseName,
    lectureCount: lectureMetas.length,
    totalWordCount: courseWords,
    totalReadingMinutes: courseMinutes,
    lectures: lectureMetas,
  });
}

const index: NotesIndex = {
  version: 1,
  courses,
};
const indexJson = JSON.stringify(index);
writeFileSync(join(outRoot, 'index.json'), indexJson);

const grandRaw = totalBytes + Buffer.byteLength(indexJson);
const grandGzip = totalGzip + gzipSync(indexJson).length;

console.log(`Wrote ${outRoot}`);
console.log(`  ${courses.length} courses · ${totalNotes} notes`);
for (const c of courses) {
  console.log(`  ${c.name}: ${c.lectureCount} lectures (~${c.totalReadingMinutes} min, ${c.totalWordCount.toLocaleString()} words)`);
}
console.log(`  excluded from slides/: ${excludedFiles.length} (${excludedFiles.join(', ')})`);
console.log(`  index.json: ${(indexJson.length / 1024).toFixed(1)} KiB raw, ${(gzipSync(indexJson).length / 1024).toFixed(1)} KiB gzip`);
console.log(`  notes JSON: ${(totalBytes / 1024).toFixed(0)} KiB raw, ${(totalGzip / 1024).toFixed(0)} KiB gzip`);
console.log(`  total public/notes: ${(grandRaw / 1024).toFixed(0)} KiB raw (${(grandRaw / 1024 / 1024).toFixed(2)} MiB), ${(grandGzip / 1024).toFixed(0)} KiB gzip`);
