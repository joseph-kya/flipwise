import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StarterPack } from '../onboarding/starterPack';
import type { NotesIndex } from './types';
import { parseNotesHash, parseVaultSource, resolveCardSource } from './sourceLink';

const notesIndex: NotesIndex = JSON.parse(
  readFileSync(resolve('public/notes/index.json'), 'utf8'),
);

describe('card source deep-link mapping', () => {
  it('maps a starter slide source to an in-app note and exact heading id', () => {
    const src =
      '<a href="obsidian://open?vault=Vault&file=University%2FRobotics%20and%20AI%2FSemester%201%2FAnalysis%201%2Fslides%2F6%20Sequences">6 Sequences</a> › What is a sequence?';
    const resolved = resolveCardSource(src, notesIndex);
    expect(resolved).toEqual({
      kind: 'note',
      courseSlug: 'analysis-1',
      courseName: 'Analysis 1',
      noteSlug: '6-sequences',
      noteTitle: 'Sequences',
      headingId: 'what-is-a-sequence',
      headingLabel: 'What is a sequence?',
    });
  });

  it('renders exercise sources and excluded slide notes as plain text with no obsidian:// link', () => {
    const exerciseSrc =
      '<a href="obsidian://open?vault=Vault&file=University%2FRobotics%20and%20AI%2FSemester%201%2FAnalysis%201%2Fexercises%2FExercise%20Sheet%201%20%E2%80%93%20Solutions">Exercise Sheet 1 – Solutions</a> › Task 2';
    expect(resolveCardSource(exerciseSrc, notesIndex)).toEqual({
      kind: 'plain',
      text: 'Exercise Sheet 1 – Solutions › Task 2',
    });

    const taskSheetSrc =
      '<a href="obsidian://open?vault=Vault&file=University%2FRobotics%20and%20AI%2FSemester%201%2FProgramming%201%2Fslides%2F5.1%20Loops%20(Task%20Sheet%203)">5.1 Loops (Task Sheet 3)</a> › While loops';
    expect(resolveCardSource(taskSheetSrc, notesIndex)).toEqual({
      kind: 'plain',
      text: '5.1 Loops (Task Sheet 3) › While loops',
    });
  });

  it('returns null for non-Semester-1 external or custom vault sources', () => {
    expect(resolveCardSource('obsidian://open?vault=Uni', notesIndex)).toBeNull();
    expect(resolveCardSource('https://example.com/ref', notesIndex)).toBeNull();
    expect(parseVaultSource('Plain text source').isSemesterVault).toBe(false);
  });

  it('parses #/notes/<course>/<note>#<heading> hash routes cleanly', () => {
    expect(parseNotesHash('#/notes')).toEqual({ courseSlug: undefined, noteSlug: undefined, headingId: undefined });
    expect(parseNotesHash('#/notes/analysis-1')).toEqual({ courseSlug: 'analysis-1', noteSlug: undefined, headingId: undefined });
    expect(parseNotesHash('#/notes/analysis-1/6-sequences#what-is-a-sequence')).toEqual({
      courseSlug: 'analysis-1',
      noteSlug: '6-sequences',
      headingId: 'what-is-a-sequence',
    });
  });

  it('maps every single card in public/starter/ai-robotics.json with high heading accuracy and zero obsidian:// fallthrough', () => {
    const pack: StarterPack = JSON.parse(
      readFileSync(resolve('public/starter/ai-robotics.json'), 'utf8'),
    );

    let total = 0;
    let mappedToNote = 0;
    let matchedHeading = 0;
    let plainText = 0;
    let fallthrough = 0;

    for (const s of pack.subjects) {
      for (const l of s.lectures) {
        for (const c of l.cards) {
          total++;
          const res = resolveCardSource(c.source, notesIndex);
          if (!res) {
            fallthrough++;
          } else if (res.kind === 'note') {
            mappedToNote++;
            if (res.headingId) matchedHeading++;
          } else {
            plainText++;
          }
        }
      }
    }

    expect(total).toBe(2568);
    expect(fallthrough).toBe(0);
    // 147 exercise cards + 9 excluded Task Sheet 3 cards = 156 plain text
    expect(plainText).toBe(156);
    expect(mappedToNote).toBe(2412);
    // Heading match rate across all mapped slide cards should be >= 90%
    expect(matchedHeading / mappedToNote).toBeGreaterThanOrEqual(0.9);
  });
});
