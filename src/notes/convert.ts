import { resolveHeadingId, slugify } from './slug';
import type { NoteHeading } from './types';

export const INCLUDED_COURSES = [
  'Analysis 1',
  'Introduction to Robotics',
  'Physics 1',
  'Programming 1',
  'Program Introduction',
  'Responsible Robotics and AI',
] as const;

/** Hard exclusion rule: only Joseph's own lecture notes, no admin/organisation or task sheets. */
export function shouldIncludeNoteFile(fileName: string): boolean {
  if (!fileName.toLowerCase().endsWith('.md')) return false;
  if (/^0\s+course\s+organisation/i.test(fileName)) return false;
  if (/^5\.1\s+loops\s+\(task\s+sheet\s+3\)\.md$/i.test(fileName)) return false;
  return true;
}

export interface NoteLookupEntry {
  courseSlug: string;
  courseName: string;
  slug: string;
  stem: string;
  title: string;
  headings: NoteHeading[];
}

export interface ConvertContext {
  courseSlug: string;
  courseName: string;
  noteSlug: string;
  lookup: ReadonlyMap<string, NoteLookupEntry[]>;
}

export interface ConvertedNote {
  title: string;
  number: string | null;
  subtitleHtml?: string;
  buildsOnHtml?: string;
  excerpt: string;
  wordCount: number;
  readingMinutes: number;
  headings: NoteHeading[];
  html: string;
}

export const NOTE_ALLOWED_TAGS = [
  'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'div', 'span', 'br', 'hr',
  'ul', 'ol', 'li',
  'blockquote', 'aside', 'details', 'summary',
  'pre', 'code',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'a', 'strong', 'em', 'b', 'i', 'del', 'sub', 'sup',
];

export const NOTE_ALLOWED_ATTR = [
  'id', 'class', 'style', 'href', 'target', 'rel', 'title',
  'open', 'scope', 'colspan', 'rowspan', 'data-lang',
];

export const NOTE_SANITIZE_CONFIG = {
  ALLOWED_TAGS: NOTE_ALLOWED_TAGS,
  ALLOWED_ATTR: NOTE_ALLOWED_ATTR,
  ALLOW_DATA_ATTR: true,
  ALLOWED_URI_REGEXP: /^(?:https?:\/\/|#\/notes\/)/i,
} as const;

export function parseFileNameMeta(fileName: string): { stem: string; number: string | null; title: string; slug: string } {
  const stem = fileName.replace(/\.md$/i, '').trim();
  const match = stem.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  if (match) {
    return {
      stem,
      number: match[1],
      title: match[2].trim(),
      slug: slugify(stem),
    };
  }
  return {
    stem,
    number: null,
    title: stem,
    slug: slugify(stem),
  };
}

export function compareLectures(a: { number: string | null; fileName: string }, b: { number: string | null; fileName: string }): number {
  const na = a.number !== null ? Number.parseFloat(a.number) : Number.POSITIVE_INFINITY;
  const nb = b.number !== null ? Number.parseFloat(b.number) : Number.POSITIVE_INFINITY;
  if (na !== nb) return na - nb;
  return a.fileName.localeCompare(b.fileName, 'en', { numeric: true, sensitivity: 'base' });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripInlineFormatting(text: string): string {
  return text
    .replace(/!\[\[[^\]]+\]\]/g, '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g, (_, target, heading, alias) =>
      (alias ?? (heading ? `${target ? `${target} › ` : ''}${heading}` : target)).trim(),
    )
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\$\$([^$]+)\$\$/g, '$1')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compact math placeholder rendered client-side by KaTeX when the note opens. */
function renderMathPlaceholder(tex: string, displayMode: boolean): string {
  const clean = escapeHtml(tex.trim());
  return displayMode ? `<div class="mb">${clean}</div>` : `<span class="m">${clean}</span>`;
}

/** Remove all image/file embeds `![[...]]` and `![](...)`, dropping embed-only lines entirely. */
export function stripEmbeds(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(?:>\s*)*(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    if (/^\s*(?:>\s*)*(?:!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\))(?:\s*(?:!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\)))*\s*$/.test(line)) {
      continue;
    }
    const cleaned = line
      .replace(/!\[\[[^\]]+\]\]/g, '')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '');
    out.push(cleaned);
  }
  return out.join('\n');
}

interface SplitHeaderResult {
  h1: string | null;
  subtitleLines: string[];
  buildsOnLines: string[];
  bodyLines: string[];
}

/** Extract H1 and top italic header block, dropping `*Source:` / `*Sources:` slide PDF lines. */
function splitHeader(markdown: string): SplitHeaderResult {
  const rawLines = markdown.split('\n');
  if (rawLines.length > 0 && /^[a-z]#\s+/.test(rawLines[0])) {
    rawLines[0] = rawLines[0].slice(1);
  }

  let idx = 0;
  while (idx < rawLines.length && !rawLines[idx].trim()) idx++;

  let h1: string | null = null;
  if (idx < rawLines.length && /^#\s+/.test(rawLines[idx])) {
    h1 = rawLines[idx].replace(/^#\s+/, '').trim();
    idx++;
  }

  while (idx < rawLines.length && !rawLines[idx].trim()) idx++;

  const subtitleLines: string[] = [];
  const buildsOnLines: string[] = [];

  while (idx < rawLines.length) {
    const trimmed = rawLines[idx].trim();
    if (!trimmed) {
      idx++;
      break;
    }
    if (trimmed.startsWith('*') && trimmed.endsWith('*') && !trimmed.startsWith('**') && trimmed.length > 2) {
      const inner = trimmed.slice(1, -1).trim();
      if (/^sources?:/i.test(inner)) {
        idx++;
        continue;
      }
      if (/^builds\s+on:/i.test(inner)) {
        buildsOnLines.push(inner);
      } else {
        subtitleLines.push(inner);
      }
      idx++;
      continue;
    }
    break;
  }

  return {
    h1,
    subtitleLines,
    buildsOnLines,
    bodyLines: rawLines.slice(idx),
  };
}

/** Pass 1 helper: extract headings quickly & deterministically for cross-note wikilink resolution. */
export function extractHeadings(markdown: string): NoteHeading[] {
  const cleaned = stripEmbeds(markdown);
  const { bodyLines } = splitHeader(cleaned);
  const headings: NoteHeading[] = [];
  const usedIds = new Map<string, number>();
  let inFence = false;
  let inMath = false;

  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (/^(?:```|~~~)/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (trimmed === '$$') {
      inMath = !inMath;
      continue;
    }
    if (inMath) continue;

    const match = line.match(/^(#{2,6})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const level = match[1].length;
    const text = stripInlineFormatting(match[2]);
    if (!text) continue;
    const base = slugify(text);
    const count = usedIds.get(base) ?? 0;
    usedIds.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count + 1}`;
    headings.push({ id, text, level });
  }

  return headings;
}

type CalloutTone =
  | 'abstract'
  | 'note'
  | 'info'
  | 'tip'
  | 'warning'
  | 'example'
  | 'question'
  | 'important'
  | 'check'
  | 'failure'
  | 'quote';

function normalizeCalloutTone(raw: string): CalloutTone {
  const t = raw.toLowerCase();
  if (t === 'abstract' || t === 'summary' || t === 'tldr') return 'abstract';
  if (t === 'tip' || t === 'hint') return 'tip';
  if (t === 'warning' || t === 'caution' || t === 'attention') return 'warning';
  if (t === 'example') return 'example';
  if (t === 'question' || t === 'faq' || t === 'help') return 'question';
  if (t === 'important') return 'important';
  if (t === 'check' || t === 'success' || t === 'done') return 'check';
  if (t === 'failure' || t === 'fail' || t === 'missing' || t === 'danger' || t === 'bug') return 'failure';
  if (t === 'quote' || t === 'cite') return 'quote';
  if (t === 'info') return 'info';
  return 'note';
}

interface RenderState {
  ctx: ConvertContext;
  headings: NoteHeading[];
  usedIds: Map<string, number>;
  insideBlockquote: boolean;
}

function resolveWikilink(rawInner: string, ctx: ConvertContext): { href?: string; display: string } {
  const pipeIdx = rawInner.indexOf('|');
  const targetPart = (pipeIdx >= 0 ? rawInner.slice(0, pipeIdx) : rawInner).trim();
  const alias = pipeIdx >= 0 ? rawInner.slice(pipeIdx + 1).trim() : undefined;

  const hashIdx = targetPart.indexOf('#');
  const noteName = (hashIdx >= 0 ? targetPart.slice(0, hashIdx) : targetPart).trim();
  const headingPart = hashIdx >= 0 ? targetPart.slice(hashIdx + 1).trim() : undefined;

  const display = alias || (headingPart ? (noteName ? `${noteName} › ${headingPart}` : headingPart) : noteName);

  if (!noteName && headingPart) {
    const entries = ctx.lookup.get(ctx.noteSlug) ?? [];
    const current = entries.find((e) => e.courseSlug === ctx.courseSlug && e.slug === ctx.noteSlug);
    const headingId = current ? resolveHeadingId(current.headings, headingPart) : slugify(headingPart);
    return {
      href: `#/notes/${ctx.courseSlug}/${ctx.noteSlug}${headingId ? `#${headingId}` : ''}`,
      display,
    };
  }

  const key = noteName.toLowerCase();
  const candidates = ctx.lookup.get(key) ?? ctx.lookup.get(slugify(noteName));
  if (!candidates || candidates.length === 0) {
    return { display };
  }

  const match = candidates.find((c) => c.courseSlug === ctx.courseSlug) ?? candidates[0];
  const headingId = headingPart ? resolveHeadingId(match.headings, headingPart) : undefined;
  return {
    href: `#/notes/${match.courseSlug}/${match.slug}${headingId ? `#${headingId}` : ''}`,
    display,
  };
}

function findClosing(text: string, start: number, delim: string): number {
  let i = start;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text.startsWith(delim, i)) return i;
    i++;
  }
  return -1;
}

/** Find matching closing parenthesis `)` with balanced nesting (handles Wikipedia URLs). */
function findBalancedParen(text: string, start: number): number {
  let depth = 1;
  let i = start;
  while (i < text.length) {
    if (text[i] === '\\') { i += 2; continue; }
    if (text[i] === '(') depth++;
    else if (text[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/** Left-to-right inline markdown + compact math placeholders + wikilink renderer. */
export function renderInline(text: string, ctx: ConvertContext): string {
  let out = '';
  let i = 0;
  const len = text.length;

  while (i < len) {
    const ch = text[i];

    if (ch === '\\' && i + 1 < len && /[\\`*_{}[\]()#+\-.!|$~]/.test(text[i + 1])) {
      out += escapeHtml(text[i + 1]);
      i += 2;
      continue;
    }

    if (ch === '`') {
      let ticks = 1;
      while (i + ticks < len && text[i + ticks] === '`') ticks++;
      const delim = '`'.repeat(ticks);
      const end = text.indexOf(delim, i + ticks);
      if (end !== -1) {
        let code = text.slice(i + ticks, end);
        if (code.length >= 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim().length > 0) {
          code = code.slice(1, -1);
        }
        out += `<code>${escapeHtml(code)}</code>`;
        i = end + ticks;
        continue;
      }
    }

    if (ch === '$' && text[i + 1] === '$') {
      const end = findClosing(text, i + 2, '$$');
      if (end !== -1 && end > i + 2) {
        out += renderMathPlaceholder(text.slice(i + 2, end), false);
        i = end + 2;
        continue;
      }
    }

    if (ch === '$' && text[i + 1] !== '$' && i + 1 < len && !/\s/.test(text[i + 1])) {
      let end = i + 1;
      let found = -1;
      while (end < len) {
        if (text[end] === '\\') { end += 2; continue; }
        if (text[end] === '$' && !/\s/.test(text[end - 1]) && text[end + 1] !== '$') {
          found = end;
          break;
        }
        end++;
      }
      if (found !== -1) {
        out += renderMathPlaceholder(text.slice(i + 1, found), false);
        i = found + 1;
        continue;
      }
    }

    if (ch === '[' && text[i + 1] === '[') {
      const end = text.indexOf(']]', i + 2);
      if (end !== -1) {
        const inner = text.slice(i + 2, end);
        const resolved = resolveWikilink(inner, ctx);
        const labelHtml = renderInline(resolved.display, ctx);
        if (resolved.href) {
          out += `<a class="wl" href="${escapeHtml(resolved.href)}">${labelHtml}</a>`;
        } else {
          out += labelHtml;
        }
        i = end + 2;
        continue;
      }
    }

    if (ch === '[') {
      const closeBracket = findClosing(text, i + 1, ']');
      if (closeBracket !== -1 && text[closeBracket + 1] === '(') {
        const closeParen = findBalancedParen(text, closeBracket + 2);
        if (closeParen !== -1) {
          const label = text.slice(i + 1, closeBracket);
          const url = text.slice(closeBracket + 2, closeParen).trim();
          const labelHtml = renderInline(label, ctx);
          if (/^https?:\/\//i.test(url)) {
            out += `<a class="xl" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${labelHtml}</a>`;
          } else {
            out += labelHtml;
          }
          i = closeParen + 1;
          continue;
        }
      }
    }

    if (ch === '<') {
      const autoMatch = text.slice(i).match(/^<(https?:\/\/[^\s<>]+)>/i);
      if (autoMatch) {
        const url = autoMatch[1];
        out += `<a class="xl" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
        i += autoMatch[0].length;
        continue;
      }
      const brMatch = text.slice(i).match(/^<br\s*\/?>/i);
      if (brMatch) {
        out += '<br />';
        i += brMatch[0].length;
        continue;
      }
      const subSupMatch = text.slice(i).match(/^<(sub|sup)>([\s\S]*?)<\/\1>/i);
      if (subSupMatch) {
        const tag = subSupMatch[1].toLowerCase();
        out += `<${tag}>${renderInline(subSupMatch[2], ctx)}</${tag}>`;
        i += subSupMatch[0].length;
        continue;
      }
    }

    if (text.startsWith('***', i) && i + 3 < len && !/\s/.test(text[i + 3])) {
      const end = findClosing(text, i + 3, '***');
      if (end !== -1 && end > i + 3) {
        out += `<strong><em>${renderInline(text.slice(i + 3, end), ctx)}</em></strong>`;
        i = end + 3;
        continue;
      }
    }

    if (text.startsWith('**', i) && i + 2 < len && !/\s/.test(text[i + 2])) {
      const end = findClosing(text, i + 2, '**');
      if (end !== -1 && end > i + 2) {
        out += `<strong>${renderInline(text.slice(i + 2, end), ctx)}</strong>`;
        i = end + 2;
        continue;
      }
    }

    if (text.startsWith('__', i) && i + 2 < len && !/\s/.test(text[i + 2]) && (i === 0 || !/[a-zA-Z0-9]/.test(text[i - 1]))) {
      const end = findClosing(text, i + 2, '__');
      if (end !== -1 && end > i + 2 && (end + 2 >= len || !/[a-zA-Z0-9]/.test(text[end + 2]))) {
        out += `<strong>${renderInline(text.slice(i + 2, end), ctx)}</strong>`;
        i = end + 2;
        continue;
      }
    }

    if (text.startsWith('~~', i) && i + 2 < len && !/\s/.test(text[i + 2])) {
      const end = findClosing(text, i + 2, '~~');
      if (end !== -1 && end > i + 2) {
        out += `<del>${renderInline(text.slice(i + 2, end), ctx)}</del>`;
        i = end + 2;
        continue;
      }
    }

    if (ch === '*' && text[i + 1] !== '*' && i + 1 < len && !/\s/.test(text[i + 1])) {
      let end = i + 1;
      let found = -1;
      while (end < len) {
        if (text[end] === '\\') { end += 2; continue; }
        if (text[end] === '`') {
          const close = text.indexOf('`', end + 1);
          end = close === -1 ? end + 1 : close + 1;
          continue;
        }
        if (text[end] === '$') {
          const close = findClosing(text, end + 1, '$');
          end = close === -1 ? end + 1 : close + 1;
          continue;
        }
        if (text[end] === '*' && text[end + 1] !== '*' && text[end - 1] !== '*' && !/\s/.test(text[end - 1])) {
          found = end;
          break;
        }
        end++;
      }
      if (found !== -1) {
        out += `<em>${renderInline(text.slice(i + 1, found), ctx)}</em>`;
        i = found + 1;
        continue;
      }
    }

    if (ch === '_' && text[i + 1] !== '_' && i + 1 < len && !/\s/.test(text[i + 1]) && (i === 0 || !/[a-zA-Z0-9]/.test(text[i - 1]))) {
      let end = i + 1;
      let found = -1;
      while (end < len) {
        if (text[end] === '\\') { end += 2; continue; }
        if (text[end] === '_' && text[end + 1] !== '_' && !/\s/.test(text[end - 1]) && (end + 1 >= len || !/[a-zA-Z0-9]/.test(text[end + 1]))) {
          found = end;
          break;
        }
        end++;
      }
      if (found !== -1) {
        out += `<em>${renderInline(text.slice(i + 1, found), ctx)}</em>`;
        i = found + 1;
        continue;
      }
    }

    out += escapeHtml(ch);
    i++;
  }

  return out;
}

function splitTableCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);

  const cells: string[] = [];
  let cur = '';
  let inCode = false;
  let inMath = false;
  let wikiDepth = 0;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length) {
      cur += s[i + 1] === '|' ? '|' : ch + s[i + 1];
      i++;
      continue;
    }
    if (ch === '`') { inCode = !inCode; cur += ch; continue; }
    if (!inCode && ch === '$') { inMath = !inMath; cur += ch; continue; }
    if (!inCode && !inMath && ch === '[' && s[i + 1] === '[') { wikiDepth++; cur += '[['; i++; continue; }
    if (!inCode && !inMath && wikiDepth > 0 && ch === ']' && s[i + 1] === ']') { wikiDepth--; cur += ']]'; i++; continue; }
    if (ch === '|' && !inCode && !inMath && wikiDepth === 0) {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function isTableSeparator(line: string): boolean {
  if (!line.includes('|') && !line.includes('-')) return false;
  const cells = splitTableCells(line);
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function parseAlignments(line: string): Array<'left' | 'center' | 'right' | undefined> {
  return splitTableCells(line).map((c) => {
    if (c.startsWith(':') && c.endsWith(':')) return 'center';
    if (c.endsWith(':')) return 'right';
    if (c.startsWith(':')) return 'left';
    return undefined;
  });
}

function listIndent(line: string): number {
  let count = 0;
  for (const ch of line) {
    if (ch === ' ') count++;
    else if (ch === '\t') count += 2;
    else break;
  }
  return count;
}

function matchListMarker(line: string): { indent: number; ordered: boolean; content: string } | null {
  const ul = line.match(/^([ \t]*)[-*+]\s+(.*)$/);
  if (ul) return { indent: listIndent(ul[1]), ordered: false, content: ul[2] };
  const ol = line.match(/^([ \t]*)\d+[.)]\s+(.*)$/);
  if (ol) return { indent: listIndent(ol[1]), ordered: true, content: ol[2] };
  return null;
}

function isBlockStart(lines: readonly string[], idx: number): boolean {
  const line = lines[idx];
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^(?:```|~~~)/.test(trimmed)) return true;
  if (/^\$\$/.test(trimmed)) return true;
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  if (/^(?:---+|\*\*\*+|___+)$/.test(trimmed)) return true;
  if (/^>\s?/.test(trimmed)) return true;
  if (matchListMarker(line)) return true;
  if (trimmed.includes('|') && idx + 1 < lines.length && isTableSeparator(lines[idx + 1])) return true;
  return false;
}

function renderList(lines: readonly string[], startIdx: number, state: RenderState): { html: string; nextIdx: number } {
  const first = matchListMarker(lines[startIdx])!;
  const baseIndent = first.indent;
  const tag = first.ordered ? 'ol' : 'ul';
  const items: string[] = [];
  let i = startIdx;

  while (i < lines.length) {
    const marker = matchListMarker(lines[i]);
    if (!marker || marker.indent !== baseIndent || marker.ordered !== first.ordered) break;

    const itemLines: string[] = [marker.content];
    i++;

    while (i < lines.length) {
      const next = lines[i];
      if (!next.trim()) {
        let j = i + 1;
        while (j < lines.length && !lines[j].trim()) j++;
        if (j < lines.length && listIndent(lines[j]) > baseIndent) {
          itemLines.push('');
          i++;
          continue;
        }
        break;
      }
      const nextMarker = matchListMarker(next);
      if (nextMarker && nextMarker.indent <= baseIndent) break;
      const ind = listIndent(next);
      if (ind > baseIndent) {
        const strip = Math.min(ind, baseIndent + 2);
        let stripped = next;
        let removed = 0;
        while (removed < strip && stripped.length > 0) {
          if (stripped[0] === '\t') { removed += 2; stripped = stripped.slice(1); }
          else if (stripped[0] === ' ') { removed += 1; stripped = stripped.slice(1); }
          else break;
        }
        itemLines.push(stripped);
        i++;
      } else if (!isBlockStart(lines, i)) {
        itemLines.push(next.trim());
        i++;
      } else {
        break;
      }
    }

    const hasNestedBlocks = itemLines.some((l, idx) =>
      idx > 0 && (l === '' || Boolean(matchListMarker(l)) || /^(?:```|~~~|\$\$|>)/.test(l.trim())),
    );

    if (hasNestedBlocks) {
      items.push(`<li>${renderBlocks(itemLines, state)}</li>`);
    } else {
      items.push(`<li>${renderInline(itemLines.join(' '), state.ctx)}</li>`);
    }
  }

  return { html: `<${tag}>${items.join('')}</${tag}>`, nextIdx: i };
}

function renderBlocks(lines: readonly string[], state: RenderState): string {
  const parts: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i++; continue; }

    // 1. Fenced code block
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})([a-zA-Z0-9_-]*)/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const lang = fenceMatch[2].toLowerCase();
      const closeRe = new RegExp(`^${fence[0]}{${fence.length},}\\s*$`);
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !closeRe.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
      parts.push(`<pre class="nc-code"${langAttr}><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // 2. Display math $$...$$
    if (trimmed.startsWith('$$')) {
      if (trimmed.length > 4 && trimmed.endsWith('$$')) {
        parts.push(renderMathPlaceholder(trimmed.slice(2, -2), true));
        i++;
        continue;
      }
      const mathLines: string[] = [];
      const afterOpen = trimmed.slice(2).trim();
      if (afterOpen) mathLines.push(afterOpen);
      i++;
      while (i < lines.length) {
        const cur = lines[i].trim();
        if (cur.endsWith('$$')) {
          const beforeClose = cur.slice(0, -2).trim();
          if (beforeClose) mathLines.push(beforeClose);
          i++;
          break;
        }
        mathLines.push(lines[i]);
        i++;
      }
      parts.push(renderMathPlaceholder(mathLines.join('\n'), true));
      continue;
    }

    // 3. Headings (H2–H6)
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      const level = Math.max(2, Math.min(6, headingMatch[1].length));
      const rawTitle = headingMatch[2].trim();
      const plainText = stripInlineFormatting(rawTitle);
      const base = slugify(plainText);
      const count = state.usedIds.get(base) ?? 0;
      state.usedIds.set(base, count + 1);
      const id = count === 0 ? base : `${base}-${count + 1}`;
      if (!state.insideBlockquote && plainText) {
        state.headings.push({ id, text: plainText, level });
      }
      parts.push(`<h${level} id="${id}">${renderInline(rawTitle, state.ctx)}</h${level}>`);
      i++;
      continue;
    }

    // 4. Horizontal rule
    if (/^(?:---+|\*\*\*+|___+)$/.test(trimmed)) {
      parts.push('<hr />');
      i++;
      continue;
    }

    // 5. Blockquotes & Obsidian callouts
    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      const calloutMatch = quoteLines[0]?.match(/^\[!([a-zA-Z0-9_-]+)\]([+-])?(?:\s+(.*))?$/);
      if (calloutMatch) {
        const rawType = calloutMatch[1];
        const fold = calloutMatch[2];
        const tone = normalizeCalloutTone(rawType);
        const rawTitle = calloutMatch[3]?.trim() || (rawType[0].toUpperCase() + rawType.slice(1).toLowerCase());
        const titleHtml = renderInline(rawTitle, state.ctx);
        const bodyHtml = renderBlocks(quoteLines.slice(1), { ...state, insideBlockquote: true });
        if (fold === '-' || fold === '+') {
          const openAttr = fold === '+' ? ' open' : '';
          parts.push(`<details class="nc nc-${tone}"${openAttr}><summary class="nc-t">${titleHtml}</summary><div class="nc-b">${bodyHtml}</div></details>`);
        } else {
          parts.push(`<aside class="nc nc-${tone}"><div class="nc-t">${titleHtml}</div><div class="nc-b">${bodyHtml}</div></aside>`);
        }
      } else {
        const bodyHtml = renderBlocks(quoteLines, { ...state, insideBlockquote: true });
        parts.push(`<blockquote>${bodyHtml}</blockquote>`);
      }
      continue;
    }

    // 6. GFM Table
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headerCells = splitTableCells(lines[i]);
      const aligns = parseAlignments(lines[i + 1]);
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        bodyRows.push(splitTableCells(lines[i]));
        i++;
      }
      const thead = `<thead><tr>${headerCells
        .map((cell, col) => `<th scope="col"${aligns[col] ? ` style="text-align:${aligns[col]}"` : ''}>${renderInline(cell, state.ctx)}</th>`)
        .join('')}</tr></thead>`;
      const tbody = `<tbody>${bodyRows
        .map(
          (row) =>
            `<tr>${headerCells
              .map((_, col) => `<td${aligns[col] ? ` style="text-align:${aligns[col]}"` : ''}>${renderInline(row[col] ?? '', state.ctx)}</td>`)
              .join('')}</tr>`,
        )
        .join('')}</tbody>`;
      parts.push(`<div class="ts"><table>${thead}${tbody}</table></div>`);
      continue;
    }

    // 7. Lists
    if (matchListMarker(line)) {
      const { html, nextIdx } = renderList(lines, i, state);
      parts.push(html);
      i = nextIdx;
      continue;
    }

    // 8. Paragraph
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim()) {
      if (paraLines.length > 0 && isBlockStart(lines, i)) break;
      paraLines.push(lines[i]);
      i++;
    }
    const joined = paraLines
      .map((l, idx) => (idx < paraLines.length - 1 && /  $/.test(l) ? `${l.trimEnd()}<br />` : l.trim()))
      .join(' ');
    parts.push(`<p>${renderInline(joined, state.ctx)}</p>`);
  }

  return parts.join('\n');
}

function extractExcerpt(bodyLines: readonly string[]): string {
  let i = 0;
  while (i < bodyLines.length) {
    if (/^>\s*\[!abstract\]/i.test(bodyLines[i].trim())) {
      const textLines: string[] = [];
      i++;
      while (i < bodyLines.length && /^>\s?/.test(bodyLines[i].trim())) {
        const stripped = bodyLines[i].trim().replace(/^>\s?/, '').trim();
        if (stripped) textLines.push(stripped);
        i++;
      }
      const plain = stripInlineFormatting(textLines.join(' '));
      if (plain) return truncateExcerpt(plain, 165);
    }
    i++;
  }

  for (const line of bodyLines) {
    const t = line.trim();
    if (!t || /^(?:#|>|```|~~~|\$\$|[-*+]\s|\d+\.\s|\||---)/.test(t)) continue;
    const plain = stripInlineFormatting(t);
    if (plain.length >= 24) return truncateExcerpt(plain, 165);
  }
  return '';
}

function truncateExcerpt(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const sentEnd = text.search(/[.!?]\s+/);
  if (sentEnd >= 45 && sentEnd + 1 <= maxLen) {
    return text.slice(0, sentEnd + 1);
  }
  const cut = text.slice(0, maxLen).replace(/\s+\S*$/, '').replace(/[,;:\s]+$/, '');
  return `${cut}…`;
}

function countWords(markdown: string): number {
  const plain = stripInlineFormatting(markdown)
    .replace(/^#+\s*/gm, '')
    .replace(/```[\s\S]*?```/g, ' ');
  return plain.trim().split(/\s+/).filter(Boolean).length;
}

/** Convert one Obsidian markdown lecture note into structured metadata + compact sanitized HTML. */
export function convertNoteMarkdown(
  markdown: string,
  fileName: string,
  ctx: ConvertContext,
  sanitize?: (html: string) => string,
): ConvertedNote {
  const cleaned = stripEmbeds(markdown);
  const { h1, subtitleLines, buildsOnLines, bodyLines } = splitHeader(cleaned);
  const fileMeta = parseFileNameMeta(fileName);

  let title = fileMeta.title;
  let number = fileMeta.number;
  if (h1) {
    const h1Match = h1.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
    if (h1Match) {
      number = h1Match[1];
      title = h1Match[2].trim();
    } else {
      title = h1;
    }
  }

  const state: RenderState = {
    ctx,
    headings: [],
    usedIds: new Map(),
    insideBlockquote: false,
  };

  let html = renderBlocks(bodyLines, state);
  let subtitleHtml = subtitleLines.length > 0
    ? subtitleLines.map((l) => renderInline(l, ctx)).join('<br />')
    : undefined;
  let buildsOnHtml = buildsOnLines.length > 0
    ? buildsOnLines.map((l) => renderInline(l.replace(/^builds\s+on:\s*/i, ''), ctx)).join(' · ')
    : undefined;

  if (sanitize) {
    html = sanitize(html);
    if (subtitleHtml) subtitleHtml = sanitize(subtitleHtml);
    if (buildsOnHtml) buildsOnHtml = sanitize(buildsOnHtml);
  }

  const wordCount = countWords(bodyLines.join('\n'));
  const readingMinutes = Math.max(1, Math.round(wordCount / 200));
  const excerpt = extractExcerpt(bodyLines);

  return {
    title,
    number,
    subtitleHtml,
    buildsOnHtml,
    excerpt,
    wordCount,
    readingMinutes,
    headings: state.headings,
    html,
  };
}
