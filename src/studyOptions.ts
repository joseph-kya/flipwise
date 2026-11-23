/**
 * Study pace: limits per course (Subject.study) and per lecture (Lecture.study), global caps in
 * settings, presets and the exam solver. Pure; see docs/study-pace.md.
 */
import type { Lecture, Subject } from './demoSubjects';
import { STUDY_CONFIG, type QueueLimits } from './scheduler';

export type PresetId = 'slow' | 'medium' | 'aggressive' | 'exam' | 'custom';
export const PRESETS: readonly PresetId[] = ['slow', 'medium', 'aggressive', 'exam', 'custom'];
export const PRESET_LABEL: Record<PresetId, string> = { slow: 'Slow', medium: 'Medium', aggressive: 'Aggressive', exam: 'Exam date', custom: 'Custom' };

export interface StudyLimits {
  newPerDay?: number;
  reviewsPerDay?: number;
  targetDate?: string; // YYYY-MM-DD
  preset?: PresetId;
}

export interface GlobalStudy {
  newPerDay: number;
  reviewsPerDay: number | null;
  pace: PresetId;
}

export const DEFAULT_GLOBAL: GlobalStudy = { newPerDay: STUDY_CONFIG.globalNew, reviewsPerDay: null, pace: 'custom' };
export const MAX_NEW = 200;
export const MAX_REVIEWS = 1000;
export const REALISTIC_NEW = 60;

const COURSE_DEFAULTS: Record<string, number> = {
  'analysis 1': STUDY_CONFIG.courseNew['analysis-1'],
  'introduction to robotics': STUDY_CONFIG.courseNew.robotics,
  robotics: STUDY_CONFIG.courseNew.robotics,
  'physics 1': STUDY_CONFIG.courseNew['physics-1'],
  'programming 1': STUDY_CONFIG.courseNew['programming-1'],
};

/** The course's built-in default (the old hardcoded caps): import-time dailyNew, demo id, name, 20. */
export function courseDefaultNew(subject: Pick<Subject, 'id' | 'name' | 'dailyNew'>): number {
  return subject.dailyNew
    ?? STUDY_CONFIG.courseNew[subject.id as keyof typeof STUDY_CONFIG.courseNew]
    ?? COURSE_DEFAULTS[subject.name.trim().toLowerCase()]
    ?? STUDY_CONFIG.defaultNew;
}

// ---------------------------------------------------------------------------
// Dates (local calendar days, matching the study-day rollover)

export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function parseDay(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(+d) ? null : d;
}
/** Whole calendar days from `from` (its study day) to `to`. */
export function daysBetween(from: Date, to: Date): number {
  const a = new Date(from); if (a.getHours() < STUDY_CONFIG.rolloverHour) a.setDate(a.getDate() - 1);
  const s = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const e = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((+e - +s) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Presets and the exam solver

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** New and review limits for a preset, relative to the course's unseen cards U. */
export function presetLimits(preset: 'slow' | 'medium' | 'aggressive', unseen: number): { newPerDay: number; reviewsPerDay: number } {
  const spec = { slow: [90, 5, 10, 300], medium: [45, 15, 20, 400], aggressive: [21, 30, 40, 500] }[preset];
  const [horizon, lo, hi, ceiling] = spec;
  const n = Math.min(Math.max(0, unseen), clamp(Math.ceil(unseen / horizon), lo, hi));
  return { newPerDay: n, reviewsPerDay: preset === 'aggressive' ? ceiling : Math.min(ceiling, Math.max(10, 10 * n)) };
}

export interface ExamSolution {
  days: number;         // calendar days before the exam day
  buffer: number;       // last days kept for review only
  newPerDay: number;    // needed pace (0 if nothing left to learn)
  realistic: boolean;
  reason?: 'past' | 'too-close' | 'too-many';
}

/** New cards per day so every unseen card is introduced `buffer` days before the exam. */
export function solveExam(unseen: number, today: Date, target: Date): ExamSolution {
  const days = daysBetween(today, target);
  const buffer = clamp(Math.round(days * 0.15), 2, 7);
  if (days <= 0) return { days, buffer, newPerDay: 0, realistic: false, reason: 'past' };
  if (unseen <= 0) return { days, buffer, newPerDay: 0, realistic: true };
  const learnDays = days - buffer;
  if (learnDays <= 0) return { days, buffer, newPerDay: unseen, realistic: false, reason: 'too-close' };
  const need = Math.ceil(unseen / learnDays);
  return need > REALISTIC_NEW
    ? { days, buffer, newPerDay: need, realistic: false, reason: 'too-many' }
    : { days, buffer, newPerDay: need, realistic: true };
}

/** What a preset writes onto a course. Exam keeps the date; the number is re-solved daily. */
export function applyPreset(current: StudyLimits | undefined, preset: Exclude<PresetId, 'custom'>, unseen: number, today: Date): StudyLimits {
  if (preset === 'exam') {
    const target = current?.targetDate && parseDay(current.targetDate) ? current.targetDate : dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 42));
    const sol = solveExam(unseen, today, parseDay(target)!);
    return { preset: 'exam', targetDate: target, newPerDay: sol.newPerDay, reviewsPerDay: Math.min(500, Math.max(10, 10 * sol.newPerDay)) };
  }
  return { preset, ...presetLimits(preset, unseen), ...(current?.targetDate ? { targetDate: current.targetDate } : {}) };
}

/** A hand edit: the course becomes Custom (keeping any exam date as a reference). */
export function editLimits(current: StudyLimits | undefined, patch: Partial<Pick<StudyLimits, 'newPerDay' | 'reviewsPerDay' | 'targetDate'>>): StudyLimits {
  const next: StudyLimits = { ...current, ...patch, preset: 'custom' };
  for (const k of Object.keys(next) as (keyof StudyLimits)[]) if (next[k] === undefined) delete next[k];
  return next;
}

/** Reset one field (or everything) back to inherited. */
export function resetLimits(current: StudyLimits | undefined, field?: 'newPerDay' | 'reviewsPerDay' | 'targetDate'): StudyLimits | undefined {
  if (!current || !field) return undefined;
  const next: StudyLimits = { ...current };
  delete next[field];
  if (field === 'targetDate' && next.preset === 'exam') delete next.preset;
  const meaningful = next.newPerDay !== undefined || next.reviewsPerDay !== undefined || next.targetDate !== undefined;
  return meaningful ? next : undefined;
}

// ---------------------------------------------------------------------------
// Resolution (global -> course -> lecture)

export type Source = 'lecture' | 'course' | 'exam' | 'default' | 'global' | 'none';
export interface Resolved { value: number | null; source: Source }

export interface CourseResolved {
  newPerDay: Resolved;     // value always a number at course level
  reviewsPerDay: Resolved; // null = no limit
  preset: PresetId;
  targetDate?: string;
  exam?: ExamSolution;
  unseen: number;
}

export function resolveCourse(subject: Subject, global: GlobalStudy, unseen: number, today: Date): CourseResolved {
  const s = subject.study;
  let exam: ExamSolution | undefined;
  let newPerDay: Resolved;
  if (s?.preset === 'exam' && s.targetDate && parseDay(s.targetDate)) {
    exam = solveExam(unseen, today, parseDay(s.targetDate)!);
    newPerDay = { value: Math.min(MAX_NEW, exam.newPerDay), source: 'exam' };
  } else if (s?.newPerDay !== undefined) newPerDay = { value: s.newPerDay, source: 'course' };
  else newPerDay = { value: courseDefaultNew(subject), source: 'default' };
  const reviewsPerDay: Resolved = s?.reviewsPerDay !== undefined
    ? { value: s.reviewsPerDay, source: 'course' }
    : { value: global.reviewsPerDay, source: global.reviewsPerDay === null ? 'none' : 'global' };
  return { newPerDay, reviewsPerDay, preset: s?.preset ?? 'custom', targetDate: s?.targetDate, exam, unseen };
}

export interface LectureResolved { newPerDay: Resolved; reviewsPerDay: Resolved }

export function resolveLecture(lecture: Lecture, course: CourseResolved): LectureResolved {
  const s = lecture.study;
  return {
    newPerDay: s?.newPerDay !== undefined ? { value: s.newPerDay, source: 'lecture' } : { value: course.newPerDay.value, source: 'course' },
    reviewsPerDay: s?.reviewsPerDay !== undefined ? { value: s.reviewsPerDay, source: 'lecture' } : { value: course.reviewsPerDay.value, source: 'course' },
  };
}

/** Limits for the scheduler: course and lecture caps compose with the global ones in queue(). */
export function queueLimits(subjects: readonly Subject[], global: GlobalStudy, unseenBySubject: ReadonlyMap<string, number>, today: Date): QueueLimits {
  const courses = new Map<string, CourseResolved>();
  const lectures = new Map<string, { newPerDay: number | null; reviewsPerDay: number | null }>();
  for (const s of subjects) {
    const c = resolveCourse(s, global, unseenBySubject.get(s.id) ?? 0, today);
    courses.set(s.id, c);
    for (const l of s.lectures)
      if (l.study) lectures.set(`${s.id}/${l.id}`, { newPerDay: l.study.newPerDay ?? null, reviewsPerDay: l.study.reviewsPerDay ?? null });
  }
  return {
    globalNew: global.newPerDay,
    globalReviews: global.reviewsPerDay,
    course: (id) => {
      const c = courses.get(id);
      return c ? { newPerDay: c.newPerDay.value ?? STUDY_CONFIG.defaultNew, reviewsPerDay: c.reviewsPerDay.value } : undefined;
    },
    lecture: (subjectId, lessonId) => lectures.get(`${subjectId}/${lessonId}`),
  };
}

export function sourceLabel(source: Source): string {
  return { lecture: 'Set for this lecture', course: 'Set for this course', exam: 'From exam date', default: 'Course default', global: 'All courses', none: 'No limit' }[source];
}
