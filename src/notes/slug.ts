import type { NoteHeading } from './types';

/** Deterministic URL/anchor-safe kebab-case slug. */
export function slugify(input: string): string {
  const normalized = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'section';
}

/** Normalized alphanumeric key used to match flashcard source headings against note headings. */
export function normalizeHeadingKey(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\$+/g, '')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function tokenizeHeading(input: string): string[] {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\$+/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/**
 * Resolve a heading label (e.g. from a flashcard's `› Heading` suffix or a wikilink `#Heading`)
 * against a note's extracted headings:
 * 1. Exact normalized match
 * 2. Prefix match (preferring closest length)
 * 3. Best substring / token-overlap fuzzy match
 * 4. Undefined (caller falls back to top of note)
 */
export function resolveHeadingId(
  headings: readonly NoteHeading[],
  target: string | undefined,
): string | undefined {
  if (!target || headings.length === 0) return undefined;
  const targetKey = normalizeHeadingKey(target);
  if (!targetKey) return undefined;

  const entries = headings.map((h) => ({
    heading: h,
    key: normalizeHeadingKey(h.text),
    tokens: tokenizeHeading(h.text),
  }));

  // 1. Exact normalized match
  const exact = entries.find((e) => e.key === targetKey);
  if (exact) return exact.heading.id;

  // 2. Prefix match (either direction), preferring closest length
  const prefixMatches = entries
    .filter((e) => e.key.length > 0 && (e.key.startsWith(targetKey) || targetKey.startsWith(e.key)))
    .sort((a, b) => Math.abs(a.key.length - targetKey.length) - Math.abs(b.key.length - targetKey.length));
  if (prefixMatches.length > 0) return prefixMatches[0].heading.id;

  // 3. Substring or token Jaccard fuzzy match
  const targetTokens = tokenizeHeading(target);
  let bestId: string | undefined;
  let bestScore = 0;

  for (const e of entries) {
    if (!e.key) continue;
    let score = 0;
    if (e.key.includes(targetKey) || targetKey.includes(e.key)) {
      const ratio = Math.min(e.key.length, targetKey.length) / Math.max(e.key.length, targetKey.length);
      score = Math.max(score, 0.55 + ratio * 0.4);
    }
    if (targetTokens.length > 0 && e.tokens.length > 0) {
      const a = new Set(targetTokens);
      const b = new Set(e.tokens);
      let inter = 0;
      for (const tok of a) if (b.has(tok)) inter++;
      if (inter > 0) {
        const jaccard = inter / (a.size + b.size - inter);
        const containment = inter / Math.min(a.size, b.size);
        score = Math.max(score, jaccard * 0.65 + containment * 0.35);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestId = e.heading.id;
    }
  }

  return bestScore >= 0.5 ? bestId : undefined;
}
