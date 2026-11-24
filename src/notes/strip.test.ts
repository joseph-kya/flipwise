import { describe, expect, it } from 'vitest';
import { cleanSubtitle, stripEmbeds, stripPdfMentions } from './convert';

describe('notes-only stripping', () => {
  it('drops orphan captions under removed images', () => {
    const out = stripEmbeds('Intro\n![[fig.png|640]]\n*Left: the figure caption.*\n\nBody *keeps* italics.');
    expect(out).not.toContain('caption');
    expect(out).not.toContain('fig.png');
    expect(out).toContain('Body *keeps* italics.');
  });
  it('keeps italic lines that do not follow an image', () => {
    expect(stripEmbeds('Text\n*An italic remark.*')).toContain('An italic remark.');
  });
  it('removes PDF file mentions', () => {
    expect(stripPdfMentions('See the slides (`Data I.pdf`, v2) now. From `x.pdf`: ok')).toBe('See the slides now. From the lecture handout: ok');
  });
  it('removes slide/PDF citations from the header', () => {
    expect(cleanSubtitle('Course X, Chapter 5 — M. H. Slides: `Data II.pdf` (version of 21 Oct).')).toBe('Course X, Chapter 5 — M. H.');
  });
});
