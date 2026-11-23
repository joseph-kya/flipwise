import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { State, type Card } from 'ts-fsrs';
import { stableCardId } from '../anki/types';
import type { Lecture, Subject } from '../demoSubjects';
import { plural } from '../plural';
import {
  MAX_NEW,
  MAX_REVIEWS,
  PRESETS,
  PRESET_LABEL,
  REALISTIC_NEW,
  applyPreset,
  dayKey,
  editLimits,
  effectiveCap,
  parseDay,
  resetLimits,
  resolveCourse,
  resolveLecture,
  setExamDate,
  sourceLabel,
  type GlobalStudy,
  type PresetId,
  type StudyLimits,
} from '../studyOptions';
import { Button, DatePicker, Group, Sheet, Slider, SubjectTile, Switch, subjectColor } from '../ui';
import { ForecastPanel } from './ForecastPanel';
import { useForecast } from './useForecast';

function formatFullDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function StudyOptionsSheet({
  open,
  onClose,
  subject,
  lecture,
  global,
  retention,
  states,
  logSignature,
  secPerAnswer,
  today,
  onSaveCourse,
  onSaveLecture,
}: {
  open: boolean;
  onClose: () => void;
  subject: Subject;
  lecture?: Lecture;
  global: GlobalStudy;
  retention: number;
  states: ReadonlyMap<string, Card>;
  logSignature: string;
  secPerAnswer: number;
  today: Date;
  onSaveCourse: (subjectId: string, next: StudyLimits | undefined) => void;
  onSaveLecture: (subjectId: string, lectureId: string, next: StudyLimits | undefined) => void;
}) {
  const isLecture = Boolean(lecture);
  const initialStudy = lecture ? lecture.study : subject.study;
  const [draft, setDraft] = useState<StudyLimits | undefined>(initialStudy);
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Sync draft whenever the sheet opens or switches target.
  useEffect(() => {
    if (!open) return;
    setDraft(lecture ? lecture.study : subject.study);
    setCalendarOpen(!lecture && subject.study?.preset === 'exam');
  }, [open, subject.id, lecture?.id]);

  // Keep draft in sync if external state changes (e.g. sync pull) while open.
  const externalKey = JSON.stringify(initialStudy ?? null);
  useEffect(() => {
    if (open) setDraft(initialStudy);
  }, [externalKey]);

  const color = subjectColor(subject.id, subject.name);

  // Scoped card states and unseen counts.
  const { scopeStates, scopeUnseen, scopeTotal, courseUnseen } = useMemo(() => {
    const courseStates = new Map<string, Card>();
    const lecStates = new Map<string, Card>();
    let cUnseen = 0;
    let lUnseen = 0;
    let lTotal = 0;
    for (const l of subject.lectures) {
      const inLec = lecture && l.id === lecture.id;
      for (const c of l.cards) {
        const id = stableCardId(subject.id, l.id, c);
        const st = states.get(id);
        const isUnseen = !st || st.state === State.New;
        if (isUnseen) cUnseen++;
        else courseStates.set(id, st);
        if (inLec) {
          lTotal++;
          if (isUnseen) lUnseen++;
          else lecStates.set(id, st);
        }
      }
    }
    return {
      scopeStates: isLecture ? lecStates : courseStates,
      scopeUnseen: isLecture ? lUnseen : cUnseen,
      scopeTotal: isLecture ? lTotal : subject.total,
      courseUnseen: cUnseen,
    };
  }, [subject, lecture, states, isLecture]);

  const draftSubject: Subject = useMemo(
    () => (isLecture ? subject : { ...subject, study: draft }),
    [subject, draft, isLecture],
  );
  const draftLecture: Lecture | undefined = useMemo(
    () => (lecture ? { ...lecture, study: draft } : undefined),
    [lecture, draft],
  );

  const courseResolved = useMemo(
    () => resolveCourse(draftSubject, global, courseUnseen, today),
    [draftSubject, global, courseUnseen, today],
  );
  const lectureResolved = useMemo(
    () => (draftLecture ? resolveLecture(draftLecture, courseResolved) : null),
    [draftLecture, courseResolved],
  );

  const effectiveNew = isLecture
    ? (lectureResolved!.newPerDay.value ?? 0)
    : (courseResolved.newPerDay.value ?? 0);
  const effectiveReviews = isLecture
    ? lectureResolved!.reviewsPerDay.value
    : courseResolved.reviewsPerDay.value;

  // For the forecast, compose with parent caps (lecture <= course <= global).
  const forecastNew = isLecture
    ? Math.min(effectiveNew, courseResolved.newPerDay.value ?? Infinity)
    : effectiveNew;
  const forecastReviews = isLecture
    ? effectiveCap(lectureResolved!.reviewsPerDay.value, courseResolved.reviewsPerDay.value, global.reviewsPerDay)
    : effectiveCap(courseResolved.reviewsPerDay.value, global.reviewsPerDay);

  const todayStr = dayKey(today);
  const forecastKey = [
    isLecture ? `lec:${subject.id}/${lecture!.id}` : `course:${subject.id}`,
    logSignature,
    scopeUnseen,
    forecastNew,
    global.newPerDay,
    forecastReviews ?? 'inf',
    retention,
    Math.round(secPerAnswer * 10),
    todayStr,
  ].join('|');

  const forecast = useForecast(forecastKey, () => ({
    states: scopeStates,
    courses: [{ id: subject.id, unseen: scopeUnseen, newPerDay: forecastNew }],
    globalNew: global.newPerDay,
    reviewsPerDay: forecastReviews,
    retention,
    secondsPerAnswer: secPerAnswer,
    today,
  }));

  const commit = (next: StudyLimits | undefined) => {
    setDraft(next);
    if (lecture) onSaveLecture(subject.id, lecture.id, next);
    else onSaveCourse(subject.id, next);
  };

  const parsedExamDate = !isLecture && courseResolved.targetDate ? parseDay(courseResolved.targetDate) ?? undefined : undefined;
  const examSol = !isLecture ? courseResolved.exam : undefined;
  const isExamMode = !isLecture && courseResolved.preset === 'exam';
  const examUnrealistic = isExamMode && Boolean((examSol && !examSol.realistic) || forecast.heavy);

  const applyClosestSensiblePace = () => {
    // Pick the highest realistic new/day that stays under the realistic cap (and <= 60 min/day).
    const capNew = Math.min(REALISTIC_NEW, Math.max(10, courseUnseen));
    const sensible = examSol && examSol.newPerDay > 0 ? Math.min(capNew, examSol.newPerDay) : Math.min(35, capNew);
    const trimmed = forecast.heavy && forecast.busiestWeekMinutes > 0
      ? Math.max(5, Math.floor((sensible * 52) / forecast.busiestWeekMinutes))
      : sensible;
    commit(editLimits(draft, { newPerDay: trimmed, reviewsPerDay: Math.min(500, Math.max(50, trimmed * 10)) }));
  };

  const handlePreset = (preset: PresetId) => {
    if (preset === 'custom') {
      commit(editLimits(draft, {}));
      return;
    }
    const next = applyPreset(draft, preset, courseUnseen, today);
    commit(next);
    if (preset === 'exam') setCalendarOpen(true);
    else setCalendarOpen(false);
  };

  const handleResetNew = () => {
    if (isLecture) {
      commit(resetLimits(draft, 'newPerDay'));
      return;
    }
    const base: StudyLimits = { ...draft };
    delete base.newPerDay;
    if (base.preset === 'exam' || base.preset === 'slow' || base.preset === 'medium' || base.preset === 'aggressive') {
      delete base.preset;
    }
    const hasRest = base.reviewsPerDay !== undefined || base.targetDate !== undefined;
    commit(hasRest ? base : undefined);
  };

  const handleResetReviews = () => {
    if (isLecture) {
      commit(resetLimits(draft, 'reviewsPerDay'));
      return;
    }
    const next = resetLimits(draft, 'reviewsPerDay');
    if (next && next.preset && next.preset !== 'custom' && next.preset !== 'exam') {
      commit({ ...next, preset: 'custom' });
    } else {
      commit(next);
    }
  };

  const newSource = isLecture ? lectureResolved!.newPerDay.source : courseResolved.newPerDay.source;
  const revSource = isLecture ? lectureResolved!.reviewsPerDay.source : courseResolved.reviewsPerDay.source;
  const newOverridden = isLecture ? draft?.newPerDay !== undefined : (draft?.newPerDay !== undefined || isExamMode);
  const revOverridden = draft?.reviewsPerDay !== undefined;
  const hasAnyOverride = Boolean(draft && (draft.newPerDay !== undefined || draft.reviewsPerDay !== undefined || draft.targetDate !== undefined));

  const newSliderMax = Math.max(80, Math.min(MAX_NEW, effectiveNew + 20));
  const revSliderMax = Math.max(500, Math.min(MAX_REVIEWS, (effectiveReviews ?? 200) + 100));

  const tomorrow = useMemo(() => new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1), [todayStr]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      wide
      title={isLecture ? lecture!.title : subject.name}
      subtitle={
        isLecture
          ? `Lecture options · ${subject.name} · ${plural(scopeUnseen, 'unseen card')} of ${scopeTotal}`
          : `Study options · ${plural(scopeUnseen, 'unseen card')} of ${scopeTotal}`
      }
      leading={<SubjectTile subjectId={subject.id} name={subject.name} size="md" />}
    >
      <div className="pace-sheet-grid" style={{ '--subject': color } as CSSProperties}>
        <div className="pace-controls">
          {!isLecture && (
            <Group ariaLabel="Pace preset">
              <div className="pace-block">
                <div className="pace-block-head">
                  <span className="row-title">Pace</span>
                </div>
                <div className="pace-pills" role="radiogroup" aria-label="Course pace preset">
                  {PRESETS.map((id) => {
                    const active = courseResolved.preset === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={`pace-pill${active ? ' is-active' : ''}`}
                        onClick={() => handlePreset(id)}
                      >
                        {PRESET_LABEL[id]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Group>
          )}

          {!isLecture && (
            <Group ariaLabel="Exam date">
              <div className="pace-block">
                <div className="pace-block-head">
                  <div className="pace-head-text">
                    <span className="row-title">Target exam date</span>
                    {parsedExamDate && examSol && (
                      <div className="row-sub">
                        {formatFullDate(parsedExamDate)} · {examSol.days > 0 ? `${plural(examSol.days, 'day')} left · ${examSol.buffer}-day buffer` : 'Date has passed'}
                      </div>
                    )}
                  </div>
                  <div className="pace-inline-actions">
                    {parsedExamDate && (
                      <button
                        type="button"
                        className="pace-link"
                        onClick={() => {
                          setCalendarOpen(false);
                          commit(resetLimits(draft, 'targetDate'));
                        }}
                      >
                        Clear
                      </button>
                    )}
                    <button
                      type="button"
                      className="pace-link pace-link-accent"
                      onClick={() => setCalendarOpen((v) => !v)}
                    >
                      {calendarOpen ? 'Hide' : parsedExamDate ? 'Change' : 'Set date'}
                    </button>
                  </div>
                </div>

                {examSol && isExamMode && (
                  <div className={`exam-callout${examUnrealistic ? ' is-warn' : ''}`} role="status">
                    {examUnrealistic ? (
                      <>
                        <p className="exam-callout-text">
                          {examSol.reason === 'past'
                            ? 'That exam date has already passed.'
                            : examSol.reason === 'too-close'
                              ? `Only ${plural(examSol.days, 'day')} left — not enough room for a ${examSol.buffer}-day review buffer.`
                              : examSol.reason === 'too-many'
                                ? `Finishing ${examSol.buffer} days before the exam needs ${examSol.newPerDay} new/day (above the ${REALISTIC_NEW}/day realistic ceiling).`
                                : `This exam pace peaks around ${Math.round(forecast.busiestWeekMinutes)} min/day — hard to sustain.`}
                        </p>
                        <Button variant="secondary" className="btn-compact" onClick={applyClosestSensiblePace}>
                          Use closest sensible pace
                        </Button>
                      </>
                    ) : (
                      <p className="exam-callout-text">
                        {courseUnseen === 0
                          ? 'Every card is already introduced — keep up with your reviews until exam day.'
                          : `Introducing ${examSol.newPerDay} new/day finishes all ${courseUnseen.toLocaleString()} unseen cards ${examSol.buffer} days before your exam.`}
                      </p>
                    )}
                  </div>
                )}

                {calendarOpen && (
                  <div className="pace-calendar-wrap">
                    <DatePicker
                      value={courseResolved.targetDate}
                      min={tomorrow}
                      ariaLabel="Choose exam date"
                      onChange={(day) => commit(setExamDate(draft, day, courseUnseen, today))}
                    />
                  </div>
                )}
              </div>
            </Group>
          )}

          {isLecture && (
            <p className="pace-inherit-note">
              Unset values inherit from <strong>{subject.name}</strong> ({courseResolved.newPerDay.value} new/day
              {courseResolved.reviewsPerDay.value !== null ? `, ${courseResolved.reviewsPerDay.value} max reviews` : ', no review limit'}).
            </p>
          )}

          <Group ariaLabel="Daily limits">
            <div className="pace-block">
              <div className="pace-block-head">
                <span className="row-title">New cards / day</span>
                <span className="pace-value tabular">{effectiveNew} / day</span>
              </div>
              <div className="pace-meta-row">
                <span className={`source-badge${newOverridden ? ' is-override' : ''}`}>
                  {newOverridden ? sourceLabel(newSource) : `Inherited · ${sourceLabel(newSource)}`}
                </span>
                {newOverridden && (
                  <button type="button" className="pace-link" onClick={handleResetNew}>
                    Reset to inherited
                  </button>
                )}
              </div>
              <Slider
                ariaLabel="New cards per day"
                value={effectiveNew}
                min={0}
                max={newSliderMax}
                step={1}
                color={color}
                valueText={`${effectiveNew} new cards per day`}
                onChange={(v) => setDraft(isLecture ? { ...draft, newPerDay: v } : editLimits(draft, { newPerDay: v }))}
                onCommit={(v) => commit(isLecture ? { ...draft, newPerDay: v } : editLimits(draft, { newPerDay: v }))}
              />
              {!isLecture && effectiveNew > global.newPerDay && (
                <p className="pace-hint">
                  Global limit is {global.newPerDay}/day across all courses, so this course will receive at most {global.newPerDay}/day.
                </p>
              )}
              {isLecture && courseResolved.newPerDay.value !== null && effectiveNew > courseResolved.newPerDay.value && (
                <p className="pace-hint">
                  Capped by {subject.name}’s limit of {courseResolved.newPerDay.value}/day.
                </p>
              )}
            </div>

            <div className="pace-block">
              <div className="pace-block-head">
                <span className="row-title">Max reviews / day</span>
                <span className="pace-value tabular">
                  {effectiveReviews === null ? 'No limit' : `${effectiveReviews} / day`}
                </span>
              </div>
              <div className="pace-meta-row">
                <span className={`source-badge${revOverridden ? ' is-override' : ''}`}>
                  {revOverridden ? sourceLabel(revSource) : `Inherited · ${sourceLabel(revSource)}`}
                </span>
                {revOverridden && (
                  <button type="button" className="pace-link" onClick={handleResetReviews}>
                    Reset to inherited
                  </button>
                )}
              </div>

              {effectiveReviews === null ? (
                <div className="pace-switch-row">
                  <span className="row-sub">Limit daily reviews</span>
                  <Switch
                    checked={false}
                    ariaLabel="Limit daily reviews"
                    onChange={(on) => {
                      if (!on) return;
                      const seed = Math.min(500, Math.max(50, effectiveNew * 10));
                      commit(isLecture ? { ...draft, reviewsPerDay: seed } : editLimits(draft, { reviewsPerDay: seed }));
                    }}
                  />
                </div>
              ) : (
                <>
                  <Slider
                    ariaLabel="Max reviews per day"
                    value={effectiveReviews}
                    min={10}
                    max={revSliderMax}
                    step={10}
                    color={color}
                    valueText={`${effectiveReviews} max reviews per day`}
                    onChange={(v) => setDraft(isLecture ? { ...draft, reviewsPerDay: v } : editLimits(draft, { reviewsPerDay: v }))}
                    onCommit={(v) => commit(isLecture ? { ...draft, reviewsPerDay: v } : editLimits(draft, { reviewsPerDay: v }))}
                  />
                  {!revOverridden && global.reviewsPerDay !== null && (
                    <p className="pace-hint">
                      Inherited from your global cap ({global.reviewsPerDay}/day). Drag to set a stricter cap here.
                    </p>
                  )}
                </>
              )}
            </div>
          </Group>

          {hasAnyOverride && (
            <div className="pace-reset-all">
              <Button variant="plain" className="btn-compact" onClick={() => { setCalendarOpen(false); commit(undefined); }}>
                Reset all to inherited
              </Button>
            </div>
          )}
        </div>

        <div className="pace-forecast-col">
          <ForecastPanel
            forecast={forecast}
            name={isLecture ? lecture!.title : subject.name}
            color={color}
            totalCards={scopeTotal}
            examDate={parsedExamDate}
            examBuffer={examSol?.buffer}
            secPerAnswer={secPerAnswer}
            today={today}
          />
        </div>
      </div>
    </Sheet>
  );
}
