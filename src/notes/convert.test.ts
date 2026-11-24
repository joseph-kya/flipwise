import { describe, expect, it } from 'vitest';
import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import {
  NOTE_SANITIZE_CONFIG,
  convertNoteMarkdown,
  extractHeadings,
  shouldIncludeNoteFile,
  stripEmbeds,
  type NoteLookupEntry,
} from './convert';
import { resolveHeadingId, slugify } from './slug';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const purify = createDOMPurify(dom.window as unknown as Parameters<typeof createDOMPurify>[0]);
purify.addHook('afterSanitizeAttributes', (node) => {
  for (const attr of Array.from(node.attributes)) {
    if (attr.name.startsWith('data-') && attr.name !== 'data-lang') {
      node.removeAttribute(attr.name);
    }
  }
});
const sanitize = (html: string) =>
  purify.sanitize(html, {
    ...NOTE_SANITIZE_CONFIG,
    ALLOWED_TAGS: [...NOTE_SANITIZE_CONFIG.ALLOWED_TAGS],
    ALLOWED_ATTR: [...NOTE_SANITIZE_CONFIG.ALLOWED_ATTR],
  });

function buildLookup(entries: NoteLookupEntry[]): Map<string, NoteLookupEntry[]> {
  const map = new Map<string, NoteLookupEntry[]>();
  for (const e of entries) {
    for (const k of [e.stem.toLowerCase(), e.slug.toLowerCase()]) {
      const list = map.get(k);
      if (list) list.push(e);
      else map.set(k, [e]);
    }
  }
  return map;
}

describe('lecture note exclusions', () => {
  it('excludes course organisation admin files, task sheet 3, and non-markdown files', () => {
    expect(shouldIncludeNoteFile('0 Course Organisation – Physics 1.md')).toBe(false);
    expect(shouldIncludeNoteFile('0 Course Organisation – Programming 1.md')).toBe(false);
    expect(shouldIncludeNoteFile('5.1 Loops (Task Sheet 3).md')).toBe(false);
    expect(shouldIncludeNoteFile('1_logic.pdf')).toBe(false);
    expect(shouldIncludeNoteFile('notes.apkg')).toBe(false);
  });

  it('includes Joseph’s lecture note markdown files', () => {
    expect(shouldIncludeNoteFile('1 Elements of Logic.md')).toBe(true);
    expect(shouldIncludeNoteFile('6 Sequences.md')).toBe(true);
    expect(shouldIncludeNoteFile('14 Precession, Coriolis Force, Rolling, Stability and Elasticity.md')).toBe(true);
  });
});

describe('embed & source-line stripping', () => {
  it('drops Obsidian image/file embeds and markdown images completely', () => {
    const md = [
      'Before paragraph.',
      '![[slide-diagram.png]]',
      '![[zz Meta/attachments/figure.pdf|300]]',
      '![Diagram](diagram.png)',
      '> ![[inside-callout.png]]',
      'Inline ![[inline.png]] text stays.',
    ].join('\n');

    const stripped = stripEmbeds(md);
    expect(stripped).not.toContain('slide-diagram.png');
    expect(stripped).not.toContain('figure.pdf');
    expect(stripped).not.toContain('diagram.png');
    expect(stripped).not.toContain('inside-callout.png');
    expect(stripped).not.toContain('inline.png');
    expect(stripped).toContain('Before paragraph.');
    expect(stripped).toContain('Inline  text stays.');
  });

  it('drops *Source: slides...* header lines while keeping H1, course/lecturer and Builds on', () => {
    const md = [
      'a# 1 Elements of Logic',
      '',
      '*Analysis 1 for Engineers (311.200), Lecture 1. Lecturer: V. Grushkovska.*',
      '*Sources: slides `1_logic.pdf` · board notes `logic_notes.pdf`.*',
      '*Builds on: [[6 Sequences]] · [[External Prep]]*',
      '',
      '## Propositions',
      'A declarative sentence.',
    ].join('\n');

    const lookup = buildLookup([
      { courseSlug: 'analysis-1', courseName: 'Analysis 1', slug: '6-sequences', stem: '6 Sequences', title: 'Sequences', headings: [] },
    ]);

    const res = convertNoteMarkdown(md, '1 Elements of Logic.md', {
      courseSlug: 'analysis-1',
      courseName: 'Analysis 1',
      noteSlug: '1-elements-of-logic',
      lookup,
    }, sanitize);

    expect(res.number).toBe('1');
    expect(res.title).toBe('Elements of Logic');
    expect(res.subtitleHtml).toContain('V. Grushkovska');
    expect(res.subtitleHtml).not.toContain('1_logic.pdf');
    expect(res.html).not.toContain('1_logic.pdf');
    expect(res.buildsOnHtml).toContain('href="#/notes/analysis-1/6-sequences"');
    expect(res.buildsOnHtml).toContain('External Prep');
    expect(res.buildsOnHtml).not.toContain('href="External');
  });
});

describe('markdown, math placeholders, callouts, wikilinks and heading slugs', () => {
  it('renders Obsidian callouts (including foldable [!question]-), lightweight math placeholders, code, tables and nested lists', () => {
    const md = [
      '# 6 Sequences',
      '',
      '> [!abstract] The big picture',
      '> A sequence $(a_n)$ maps $\\mathbb{N} \\to \\mathbb{R}$.',
      '',
      '> [!question]- Why does $\\varepsilon$ come first?',
      '> Because $N$ depends on $\\varepsilon$:',
      '> $$',
      '> |a_n - L| < \\varepsilon',
      '> $$',
      '',
      '## What is a sequence?',
      '',
      'See [[1 Elements of Logic#Implication|implication]], [[Missing Note]], and [Wiki](https://en.wikipedia.org/wiki/Sequence_(math)).',
      '',
      '```python',
      'for n in range(5):',
      '    print(1 / (n + 1))',
      '```',
      '',
      '| Expr | Value |',
      '| --- | ---: |',
      '| $|x|$ | $\\ge 0$ |',
      '',
      '- Outer item',
      '  - Nested child with `snake_case_var`',
      '  - Another child',
      '',
      '## What is a sequence?',
      'Duplicate heading gets a deterministic suffix.',
    ].join('\n');

    const logicHeadings = extractHeadings('## Implication\nText.');
    const lookup = buildLookup([
      {
        courseSlug: 'analysis-1',
        courseName: 'Analysis 1',
        slug: '1-elements-of-logic',
        stem: '1 Elements of Logic',
        title: 'Elements of Logic',
        headings: logicHeadings,
      },
    ]);

    const res = convertNoteMarkdown(md, '6 Sequences.md', {
      courseSlug: 'analysis-1',
      courseName: 'Analysis 1',
      noteSlug: '6-sequences',
      lookup,
    }, sanitize);

    // Callouts
    expect(res.html).toContain('<aside class="nc nc-abstract">');
    expect(res.html).toContain('<details class="nc nc-question">');
    expect(res.html).toContain('<summary class="nc-t">');
    expect(res.excerpt).toContain('A sequence');

    // Lightweight math placeholders (rendered client-side by KaTeX)
    expect(res.html).toContain('<span class="m">(a_n)</span>');
    expect(res.html).toContain('<span class="m">\\mathbb{N} \\to \\mathbb{R}</span>');
    expect(res.html).toContain('<div class="mb">|a_n - L| &lt; \\varepsilon</div>');

    // Wikilinks (resolved vs plain text) & balanced-paren external link
    expect(res.html).toContain('href="#/notes/analysis-1/1-elements-of-logic#implication"');
    expect(res.html).toContain('>implication</a>');
    expect(res.html).toContain('Missing Note');
    expect(res.html).not.toContain('href="Missing');
    expect(res.html).toContain('href="https://en.wikipedia.org/wiki/Sequence_(math)"');

    // Code block & snake_case preserved
    expect(res.html).toContain('data-lang="python"');
    expect(res.html).toContain('print(1 / (n + 1))');
    expect(res.html).toContain('<code>snake_case_var</code>');

    // Math-aware table cell splitting (does not split on |x|)
    expect(res.html).toContain('<div class="ts"><table>');
    expect(res.html).toContain('text-align:right');
    expect(res.html).toContain('<span class="m">|x|</span>');

    // Nested list
    expect(res.html).toContain('<ul><li><p>Outer item</p>');
    expect(res.html).toContain('<ul><li>Nested child');

    // Deterministic unique heading slugs
    expect(res.headings.map((h) => h.id)).toEqual(['what-is-a-sequence', 'what-is-a-sequence-2']);
  });

  it('escapes raw HTML and strips unsafe links when sanitized', () => {
    const md = '# 1 Safe\n\n## Test\n<script>alert(1)</script> [bad](javascript:alert(1)) [ok](https://example.com)';
    const res = convertNoteMarkdown(md, '1 Safe.md', {
      courseSlug: 'test',
      courseName: 'Test',
      noteSlug: '1-safe',
      lookup: new Map(),
    }, sanitize);

    expect(res.html).not.toContain('<script');
    expect(res.html).not.toContain('javascript:');
    expect(res.html).toContain(' bad ');
    expect(res.html).toContain('https://example.com');

    // Also verify sanitizer strips raw scripts/data-* directly
    const dirty = sanitize('<script>alert(1)</script><span data-evil="1">ok</span><a href="obsidian://open">x</a>');
    expect(dirty).not.toContain('<script');
    expect(dirty).not.toContain('data-evil');
    expect(dirty).not.toContain('obsidian://');
  });
});

describe('heading slug and fuzzy matching', () => {
  it('matches exact, prefix, and fuzzy headings and falls back cleanly', () => {
    const headings = [
      { id: 'what-is-a-sequence', text: 'What is a sequence?', level: 2 },
      { id: 'bounded-and-monotone-sequences', text: 'Bounded and monotone sequences', level: 2 },
      { id: 'dot-product-scalar-product', text: 'Dot product (scalar product)', level: 3 },
    ];

    expect(slugify('Implication: A implies B?')).toBe('implication-a-implies-b');
    expect(resolveHeadingId(headings, 'What is a sequence?')).toBe('what-is-a-sequence');
    expect(resolveHeadingId(headings, 'WHAT IS A SEQUENCE')).toBe('what-is-a-sequence');
    expect(resolveHeadingId(headings, 'Dot product')).toBe('dot-product-scalar-product');
    expect(resolveHeadingId(headings, 'Bounded monotone sequences')).toBe('bounded-and-monotone-sequences');
    expect(resolveHeadingId(headings, 'Completely unrelated heading xyz')).toBeUndefined();
  });
});
