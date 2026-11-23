import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { mergeImport, type ImportedData } from './anki/types';
import type { Subject } from './demoSubjects';
import type { ReviewEvent } from './reviewLog';
import { DEFAULT_LIMITS, queue, replay, retrievability, STUDY_CONFIG, type QueueCard } from './scheduler';
import { DEFAULT_SETTINGS } from './settings';
import {
  DEFAULT_GLOBAL, applyDemoStudy, applyPreset, applyPresetToAll, courseDefaultNew, editLimits, effectiveCap,
  loadDemoStudy, presetLimits, queueLimits, resetLimits, resolveCourse, resolveLecture, saveDemoStudy, setExamDate,
  solveExam, type GlobalStudy,
} from './studyOptions';
import { MemoryCloud } from './sync/memoryCloud';
import { card, deck, makeDevice } from './sync/testkit';

const today = new Date(2026, 10, 23, 12);
const subject = (id: string, name: string, lectures = ['L1', 'L2'], extra: Partial<Subject> = {}): Subject =>
  ({ id, name, total: 0, lectures: lectures.map((l) => ({ id: l, title: l, cards: [] })), ...extra });
const cardsFor = (subjectId: string, lessons: string[], perLesson: number): QueueCard[] =>
  lessons.flatMap((lessonId, li) => Array.from({ length: perLesson }, (_, i) => ({ cardId: `${subjectId}/${lessonId}/${i}`, subjectId, lessonId, queuePosition: li * 1000 + i })));

describe('migration of the old hardcoded caps', () => {
  it('keeps 40 combined and 18/11/6/5 per course as the inherited defaults', () => {
    expect(DEFAULT_SETTINGS.newPerDay).toBe(40);
    expect(DEFAULT_SETTINGS.reviewsPerDay).toBeNull();
    expect(DEFAULT_GLOBAL.newPerDay).toBe(STUDY_CONFIG.globalNew);
    expect(courseDefaultNew(subject('anki-x', 'Physics 1'))).toBe(18);
    expect(courseDefaultNew(subject('anki-y', 'Introduction to Robotics'))).toBe(11);
    expect(courseDefaultNew(subject('analysis-1', 'Analysis 1'))).toBe(6);
    expect(courseDefaultNew(subject('anki-z', 'Programming 1'))).toBe(5);
    expect(courseDefaultNew(subject('anki-q', 'Linear Algebra'))).toBe(20);
    expect(courseDefaultNew(subject('anki-q', 'Linear Algebra', [], { dailyNew: 9 }))).toBe(9); // import-time value wins
  });
  it('gives the same queue as before when nothing has been customised', () => {
    const subjects = [subject('physics-1', 'Physics 1', ['a']), subject('robotics', 'Robotics', ['a'])];
    const cards = [...cardsFor('physics-1', ['a'], 30), ...cardsFor('robotics', ['a'], 30)];
    const limits = queueLimits(subjects, DEFAULT_GLOBAL, new Map([['physics-1', 30], ['robotics', 30]]), today);
    expect(queue(cards, [], today, limits).map((c) => c.cardId)).toEqual(queue(cards, [], today, DEFAULT_LIMITS).map((c) => c.cardId));
  });
});

describe('inheritance: global -> course -> lecture', () => {
  const global: GlobalStudy = { newPerDay: 40, reviewsPerDay: 150, pace: 'custom' };
  it('resolves course values from override, exam, default and global, with their source', () => {
    const plain = resolveCourse(subject('p', 'Physics 1'), global, 500, today);
    expect(plain.newPerDay).toEqual({ value: 18, source: 'default' });
    expect(plain.reviewsPerDay).toEqual({ value: 150, source: 'global' });
    const custom = resolveCourse(subject('p', 'Physics 1', [], { study: { newPerDay: 25, preset: 'custom' } }), { ...global, reviewsPerDay: null }, 500, today);
    expect(custom.newPerDay).toEqual({ value: 25, source: 'course' });
    expect(custom.reviewsPerDay).toEqual({ value: null, source: 'none' });
  });
  it('lectures inherit the course unless overridden, and reset returns to inherited', () => {
    const course = resolveCourse(subject('p', 'Physics 1', [], { study: { newPerDay: 25, reviewsPerDay: 200 } }), global, 500, today);
    expect(resolveLecture({ id: 'L', title: 'L', cards: [] }, course)).toEqual({ newPerDay: { value: 25, source: 'course' }, reviewsPerDay: { value: 200, source: 'course' } });
    const overridden = { id: 'L', title: 'L', cards: [], study: { newPerDay: 4 } };
    expect(resolveLecture(overridden, course).newPerDay).toEqual({ value: 4, source: 'lecture' });
    expect(resetLimits(overridden.study, 'newPerDay')).toBeUndefined();
    expect(resetLimits({ newPerDay: 4, reviewsPerDay: 9 }, 'newPerDay')).toEqual({ reviewsPerDay: 9 });
  });
});

describe('presets', () => {
  it('scales with the unseen cards and stays inside each band', () => {
    expect(presetLimits('slow', 904)).toEqual({ newPerDay: 10, reviewsPerDay: 100 });
    expect(presetLimits('medium', 904)).toEqual({ newPerDay: 20, reviewsPerDay: 200 });
    expect(presetLimits('aggressive', 904)).toEqual({ newPerDay: 40, reviewsPerDay: 500 });
    expect(presetLimits('slow', 212)).toEqual({ newPerDay: 5, reviewsPerDay: 50 });
    expect(presetLimits('medium', 212)).toEqual({ newPerDay: 15, reviewsPerDay: 150 });
    expect(presetLimits('aggressive', 212)).toEqual({ newPerDay: 30, reviewsPerDay: 500 });
    expect(presetLimits('medium', 4).newPerDay).toBe(4); // never more than what's left
    expect(presetLimits('slow', 0).newPerDay).toBe(0);
  });
  it('records the preset, and any hand edit switches the course to Custom', () => {
    const medium = applyPreset(undefined, 'medium', 904, today);
    expect(medium).toEqual({ preset: 'medium', newPerDay: 20, reviewsPerDay: 200 });
    expect(editLimits(medium, { newPerDay: 22 })).toEqual({ preset: 'custom', newPerDay: 22, reviewsPerDay: 200 });
  });
  it('applies a preset to all courses and scales the combined global cap', () => {
    const list = [subject('r', 'Robotics'), subject('p', 'Physics 1'), subject('a', 'Analysis 1'), subject('pr', 'Programming 1')];
    const unseen = new Map([['r', 904], ['p', 756], ['a', 696], ['pr', 212]]);
    const slow = applyPresetToAll(list, 'slow', unseen, today);
    expect(slow.pace).toBe('slow');
    expect(slow.bySubject.get('r')).toEqual({ preset: 'slow', newPerDay: 10, reviewsPerDay: 100 });
    expect(slow.globalNew).toBe(10 + 9 + 8 + 5);
    const agg = applyPresetToAll(list, 'aggressive', unseen, today);
    expect(agg.pace).toBe('aggressive');
    expect(agg.globalNew).toBe(40 + 36 + 34 + 30);
  });
});

describe('exam solver', () => {
  it('spreads unseen cards over the days before the buffer', () => {
    const s = solveExam(904, today, new Date(2027, 0, 22)); // 60 days ahead
    expect(s.days).toBe(60);
    expect(s.buffer).toBe(7);
    expect(s.newPerDay).toBe(Math.ceil(904 / 53));
    expect(s.realistic).toBe(true);
    expect(applyPreset({ targetDate: '2027-01-22' }, 'exam', 904, today)).toMatchObject({ preset: 'exam', targetDate: '2027-01-22', newPerDay: 18 });
    expect(setExamDate(undefined, '2027-01-22', 904, today)).toMatchObject({ preset: 'exam', targetDate: '2027-01-22', newPerDay: 18, reviewsPerDay: 180 });
  });
  it('flags past, too-close and too-heavy targets', () => {
    expect(solveExam(100, today, new Date(2026, 10, 20))).toMatchObject({ realistic: false, reason: 'past' });
    expect(solveExam(100, today, new Date(2026, 10, 23))).toMatchObject({ realistic: false, reason: 'past' });
    expect(solveExam(100, today, new Date(2026, 10, 25))).toMatchObject({ realistic: false, reason: 'too-close' });
    expect(solveExam(2568, today, new Date(2026, 11, 10))).toMatchObject({ realistic: false, reason: 'too-many' });
    expect(solveExam(0, today, new Date(2026, 11, 10))).toMatchObject({ realistic: true, newPerDay: 0 });
  });
  it('re-solves daily: the exam preset resolves to the current need', () => {
    const s = subject('p', 'Physics 1', [], { study: { preset: 'exam', targetDate: '2027-01-22' } });
    expect(resolveCourse(s, DEFAULT_GLOBAL, 904, today).newPerDay).toEqual({ value: 18, source: 'exam' });
    expect(resolveCourse(s, DEFAULT_GLOBAL, 100, today).newPerDay.value).toBe(2);
    // Custom pace with a reference exam date still exposes exam info for deadline warnings
    const customWithDate = subject('p', 'Physics 1', [], { study: { preset: 'custom', newPerDay: 5, targetDate: '2027-01-22' } });
    const resolved = resolveCourse(customWithDate, DEFAULT_GLOBAL, 904, today);
    expect(resolved.newPerDay).toEqual({ value: 5, source: 'course' });
    expect(resolved.exam?.buffer).toBe(7);
  });
});

describe('demo study persistence (local only) and effectiveCap', () => {
  it('round-trips demo course and lecture overrides and applies them cleanly', () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
    const saved = { courses: { robotics: { preset: 'medium' as const, newPerDay: 20, reviewsPerDay: 200 } }, lectures: { 'robotics/L1': { newPerDay: 4 } } };
    saveDemoStudy(saved, storage);
    const loaded = loadDemoStudy(storage);
    expect(loaded).toEqual(saved);
    const base = [subject('robotics', 'Robotics', ['L1', 'L2'])];
    const applied = applyDemoStudy(base, loaded);
    expect(applied[0].study).toEqual(saved.courses.robotics);
    expect(applied[0].lectures[0].study).toEqual({ newPerDay: 4 });
    expect(applied[0].lectures[1].study).toBeUndefined();
    expect(base[0].study).toBeUndefined(); // does not mutate input
    expect(effectiveCap(null, undefined, 200, 120)).toBe(120);
    expect(effectiveCap(null, undefined)).toBeNull();
  });
});

describe('queue respects new and review caps at all three levels', () => {
  const ev = (cardId: string, subjectId: string, lessonId: string, rating: ReviewEvent['rating'], at: Date): ReviewEvent =>
    ({ id: `${cardId}@${+at}`, cardId, subjectId, lessonId, rating, at: at.toISOString(), durationMs: 1000, isNew: false, retention: 0.9, fuzz: false });
  const global = (over: Partial<GlobalStudy> = {}): GlobalStudy => ({ ...DEFAULT_GLOBAL, ...over });

  it('new cards: lecture caps compose with course and global caps', () => {
    const subjects = [subject('A', 'A', ['l1', 'l2'], { study: { newPerDay: 12 } }), subject('B', 'B', ['l1'], { study: { newPerDay: 30 } })];
    subjects[0].lectures[0].study = { newPerDay: 3 };
    const cards = [...cardsFor('A', ['l1', 'l2'], 20), ...cardsFor('B', ['l1'], 40)];
    let q = queue(cards, [], today, queueLimits(subjects, global({ newPerDay: 100 }), new Map(), today));
    const count = (s: string, l?: string) => q.filter((c) => c.subjectId === s && (!l || c.lessonId === l)).length;
    expect(count('A', 'l1')).toBe(3);   // lecture cap
    expect(count('A')).toBe(12);        // course cap (3 + 9 from l2)
    expect(count('B')).toBe(30);        // course cap
    // Global cap: admitted in queue-position order across courses (A/l2 sits at positions 1000+).
    q = queue(cards, [], today, queueLimits(subjects, global({ newPerDay: 25 }), new Map(), today));
    expect(q.length).toBe(25);
    expect(count('A', 'l1')).toBe(3);
    expect(count('B')).toBe(22);
  });

  it('reviews: global, course and lecture caps bind, deferring the best-remembered cards', () => {
    // 30 review cards in A/l1, A/l2, B/l1, reviewed long ago at different times -> different retrievability.
    const subjects = [subject('A', 'A', ['l1', 'l2']), subject('B', 'B', ['l1'])];
    const cards = [...cardsFor('A', ['l1', 'l2'], 10), ...cardsFor('B', ['l1'], 10)];
    const events = cards.flatMap((c, i) => {
      const first = new Date(2026, 8, 1 + (i % 20), 9);
      return [ev(c.cardId, c.subjectId, c.lessonId, 'good', first), ev(c.cardId, c.subjectId, c.lessonId, 'good', new Date(+first + 600_000))];
    });
    const due = queue(cards, events, today).length;
    expect(due).toBe(30);
    // Global review cap.
    expect(queue(cards, events, today, queueLimits(subjects, global({ reviewsPerDay: 7 }), new Map(), today))).toHaveLength(7);
    // Course cap on A, lecture cap on B/l1.
    subjects[0].study = { reviewsPerDay: 5 };
    subjects[1].lectures[0].study = { reviewsPerDay: 2 };
    const capped = queue(cards, events, today, queueLimits(subjects, global(), new Map(), today));
    expect(capped.filter((c) => c.subjectId === 'A')).toHaveLength(5);
    expect(capped.filter((c) => c.subjectId === 'B')).toHaveLength(2);
    // The admitted ones are the least retrievable (most at risk).
    const states = replay(events);
    const rA = cards.filter((c) => c.subjectId === 'A').map((c) => retrievability(states.get(c.cardId)!, today)).sort((a, b) => a - b);
    const admitted = capped.filter((c) => c.subjectId === 'A').map((c) => retrievability(states.get(c.cardId)!, today)).sort((a, b) => a - b);
    expect(admitted).toEqual(rA.slice(0, 5));
  });

  it('counts reviews already done today against the cap, and never caps learning steps', () => {
    const subjects = [subject('A', 'A', ['l1'])];
    const cards = cardsFor('A', ['l1'], 6);
    const old = new Date(2026, 8, 1, 9);
    const events = cards.flatMap((c) => [ev(c.cardId, 'A', 'l1', 'good', old), ev(c.cardId, 'A', 'l1', 'good', new Date(+old + 600_000))]);
    const doneToday = [...events, ev(cards[0].cardId, 'A', 'l1', 'good', new Date(2026, 10, 23, 9)), ev(cards[1].cardId, 'A', 'l1', 'again', new Date(2026, 10, 23, 9, 1))];
    const limits = queueLimits(subjects, global({ reviewsPerDay: 3 }), new Map(), today);
    const q = queue(cards, doneToday, today, limits);
    // 2 reviews used today -> 1 more review allowed; card 1 is relearning (lapsed) and not capped.
    expect(q.filter((c) => c.cardId === cards[1].cardId)).toHaveLength(1);
    expect(q.filter((c) => c.cardId !== cards[1].cardId)).toHaveLength(1);
  });
});

describe('re-import and sync of study options', () => {
  it('keeps course and lecture options when the same deck is imported again', () => {
    const first = deck([card(1), card(2)]);
    first.subjects[0].study = { preset: 'medium', newPerDay: 20, reviewsPerDay: 200 };
    first.subjects[0].lectures[0].study = { newPerDay: 3 };
    const again = mergeImport(first, deck([card(1), card(2), card(3)]), []).data as ImportedData;
    expect(again.subjects[0].study).toEqual({ preset: 'medium', newPerDay: 20, reviewsPerDay: 200 });
    expect(again.subjects[0].lectures[0].study).toEqual({ newPerDay: 3 });
  });

  it('syncs per course with last-writer-wins, and global caps with the settings record', async () => {
    const cloud = new MemoryCloud();
    const mac = await makeDevice('pace-mac', 10_000), phone = await makeDevice('pace-phone', 10_000);
    const two = { ...deck([card(1), card(2, 'q', 'L2')]) };
    two.subjects = [two.subjects[0], { ...two.subjects[0], id: 'anki-other', name: 'Other', lectures: two.subjects[0].lectures.map((l) => ({ ...l, cards: [] })) }];
    await mac.storage.importDecks(two, []);
    const m = await mac.signIn('uid-pace', cloud.as('uid-pace')), p = await phone.signIn('uid-pace', cloud.as('uid-pace'));
    for (let i = 0; i < 2; i++) { await m.engine.sync(); await p.engine.sync(); }

    const edit = async (dev: typeof mac, subjectId: string, study: Subject['study'], at: number) => {
      dev.clock.now = at;
      const data = (await dev.storage.readDecks())!;
      const next = { ...data, subjects: data.subjects.map((s) => (s.id === subjectId ? { ...s, study } : s)) };
      await dev.storage.importDecks(next, await dev.storage.read());
    };
    // Different courses on different devices: both survive.
    await edit(mac, 'anki-course', { preset: 'aggressive', newPerDay: 40, reviewsPerDay: 500 }, 20_000);
    await edit(phone, 'anki-other', { preset: 'slow', newPerDay: 5, reviewsPerDay: 50 }, 21_000);
    // Same course on both: the later edit wins everywhere.
    await edit(mac, 'anki-other', { preset: 'custom', newPerDay: 7 }, 25_000);
    await mac.setSettings({ newPerDay: 30, reviewsPerDay: 250, pace: 'medium' });
    for (let i = 0; i < 3; i++) { await m.engine.sync(); await p.engine.sync(); }
    for (const dev of [mac, phone]) {
      const data = (await dev.storage.readDecks())!;
      expect(data.subjects.find((s) => s.id === 'anki-course')!.study).toEqual({ preset: 'aggressive', newPerDay: 40, reviewsPerDay: 500 });
      expect(data.subjects.find((s) => s.id === 'anki-other')!.study).toEqual({ preset: 'custom', newPerDay: 7 });
    }
    expect(phone.settings).toMatchObject({ newPerDay: 30, reviewsPerDay: 250, pace: 'medium' });
  });
});
