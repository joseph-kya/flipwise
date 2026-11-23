import { useEffect, useMemo, useState } from 'react';
import type { Card } from 'ts-fsrs';
import type { Subject } from '../demoSubjects';
import { plural } from '../plural';
import type { AppearanceSettings } from '../settings';
import {
  PRESET_LABEL,
  dayKey,
  parseDay,
  resolveCourse,
} from '../studyOptions';
import { ChevronRight, Group, Row, SectionFooter, SectionHeader, Segmented, Slider, SubjectTile, Switch } from '../ui';
import { ForecastPanel } from './ForecastPanel';
import { useForecast } from './useForecast';

const RETENTION_OPTIONS = [
  { value: '0.85', label: '85%' },
  { value: '0.9', label: '90%' },
  { value: '0.95', label: '95%' },
] as const;

const GLOBAL_PRESETS: readonly ('slow' | 'medium' | 'aggressive')[] = ['slow', 'medium', 'aggressive'];

export function StudySettingsSection({
  settings,
  subjects,
  states,
  unseenBySubject,
  logSignature,
  secPerAnswer,
  today,
  onChangeSettings,
  onApplyPresetAll,
  onOpenCourse,
}: {
  settings: AppearanceSettings;
  subjects: readonly Subject[];
  states: ReadonlyMap<string, Card>;
  unseenBySubject: ReadonlyMap<string, number>;
  logSignature: string;
  secPerAnswer: number;
  today: Date;
  onChangeSettings: (patch: Partial<AppearanceSettings>) => void;
  onApplyPresetAll: (preset: 'slow' | 'medium' | 'aggressive') => void;
  onOpenCourse: (subjectId: string) => void;
}) {
  const [draftNew, setDraftNew] = useState(settings.newPerDay);
  const [draftReviews, setDraftReviews] = useState<number | null>(settings.reviewsPerDay);

  useEffect(() => { setDraftNew(settings.newPerDay); }, [settings.newPerDay]);
  useEffect(() => { setDraftReviews(settings.reviewsPerDay); }, [settings.reviewsPerDay]);

  const draftGlobal = useMemo(
    () => ({ newPerDay: draftNew, reviewsPerDay: draftReviews, pace: settings.pace }),
    [draftNew, draftReviews, settings.pace],
  );

  const resolvedCourses = useMemo(
    () =>
      subjects.map((s) => ({
        subject: s,
        resolved: resolveCourse(s, draftGlobal, unseenBySubject.get(s.id) ?? 0, today),
        lectureOverrides: s.lectures.filter((l) => l.study && (l.study.newPerDay !== undefined || l.study.reviewsPerDay !== undefined)).length,
      })),
    [subjects, draftGlobal, unseenBySubject, today],
  );

  const totalCards = useMemo(() => subjects.reduce((n, s) => n + s.total, 0), [subjects]);
  const todayStr = dayKey(today);

  const forecastCourses = useMemo(
    () => resolvedCourses.map(({ subject, resolved }) => ({ id: subject.id, unseen: resolved.unseen, newPerDay: resolved.newPerDay.value ?? 0 })),
    [resolvedCourses],
  );

  const forecastKey = [
    'global',
    logSignature,
    forecastCourses.map((c) => `${c.id}:${c.unseen}:${c.newPerDay}`).join(','),
    draftNew,
    draftReviews ?? 'inf',
    settings.retention,
    Math.round(secPerAnswer * 10),
    todayStr,
  ].join('|');

  const forecast = useForecast(forecastKey, () => ({
    states,
    courses: forecastCourses,
    globalNew: draftNew,
    reviewsPerDay: draftReviews,
    retention: settings.retention,
    secondsPerAnswer: secPerAnswer,
    today,
  }));

  const newSliderMax = Math.max(200, draftNew);
  const revSliderMax = Math.max(1000, draftReviews ?? 200);

  const courseSubtitle = (item: (typeof resolvedCourses)[number]) => {
    const parts: string[] = [];
    const { resolved, lectureOverrides } = item;
    if (resolved.preset === 'exam' && resolved.targetDate) {
      const d = parseDay(resolved.targetDate);
      parts.push(d ? `Exam ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'Exam');
    } else if (resolved.preset !== 'custom') {
      parts.push(PRESET_LABEL[resolved.preset]);
    } else if (resolved.newPerDay.source === 'default') {
      parts.push('Default');
    } else {
      parts.push('Custom');
    }
    if (resolved.reviewsPerDay.source === 'course' && resolved.reviewsPerDay.value !== null) {
      parts.push(`${resolved.reviewsPerDay.value} max rev`);
    }
    if (lectureOverrides > 0) {
      parts.push(`${plural(lectureOverrides, 'lecture override')}`);
    }
    parts.push(`${resolved.unseen.toLocaleString()} unseen`);
    return parts.join(' · ');
  };

  return (
    <section aria-label="Study" className="settings-section">
      <SectionHeader title="Study" />
      <div className="settings-group-stack">
        <div className="study-settings-split">
          <div className="settings-group-stack">
            <Group ariaLabel="Scheduling preferences">
              <Row
                title="Desired retention"
                subtitle="FSRS recall target used for scheduling & forecast"
                stacked
                trailing={
                  <Segmented
                    ariaLabel="Desired retention"
                    value={String(settings.retention)}
                    options={RETENTION_OPTIONS}
                    onChange={(value) => onChangeSettings({ retention: Number(value) })}
                  />
                }
              />
              <div className="pace-block">
                <div className="pace-block-head">
                  <div>
                    <span className="row-title">Pace preset</span>
                    <div className="row-sub">Apply to all {plural(subjects.length, 'course')}</div>
                  </div>
                </div>
                <div className="pace-pills" role="group" aria-label="Apply pace preset to all courses">
                  {GLOBAL_PRESETS.map((id) => {
                    const active = settings.pace === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={active}
                        className={`pace-pill${active ? ' is-active' : ''}`}
                        onClick={() => onApplyPresetAll(id)}
                      >
                        {PRESET_LABEL[id]}
                      </button>
                    );
                  })}
                  <span className={`pace-pill pace-pill-status${settings.pace === 'custom' ? ' is-active' : ''}`} aria-current={settings.pace === 'custom' ? 'true' : undefined}>
                    Custom
                  </span>
                </div>
              </div>
            </Group>

            <Group ariaLabel="Global daily limits">
              <div className="pace-block">
                <div className="pace-block-head">
                  <div>
                    <span className="row-title">New cards / day</span>
                    <div className="row-sub">All courses combined</div>
                  </div>
                  <span className="pace-value tabular">{draftNew} / day</span>
                </div>
                <Slider
                  ariaLabel="Combined new cards per day"
                  value={draftNew}
                  min={0}
                  max={newSliderMax}
                  step={1}
                  valueText={`${draftNew} new cards per day across all courses`}
                  onChange={setDraftNew}
                  onCommit={(v) => onChangeSettings({ newPerDay: v, pace: 'custom' })}
                />
              </div>

              <div className="pace-block">
                <div className="pace-block-head">
                  <div>
                    <span className="row-title">Max reviews / day</span>
                    <div className="row-sub">All courses combined</div>
                  </div>
                  <span className="pace-value tabular">
                    {draftReviews === null ? 'No limit' : `${draftReviews} / day`}
                  </span>
                </div>
                <div className="pace-switch-row">
                  <span className="row-sub">Cap daily reviews</span>
                  <Switch
                    checked={draftReviews !== null}
                    ariaLabel="Cap combined daily reviews"
                    onChange={(on) => {
                      const next = on ? Math.min(1000, Math.max(100, draftNew * 5)) : null;
                      setDraftReviews(next);
                      onChangeSettings({ reviewsPerDay: next, pace: 'custom' });
                    }}
                  />
                </div>
                {draftReviews !== null && (
                  <Slider
                    ariaLabel="Combined max reviews per day"
                    value={draftReviews}
                    min={20}
                    max={revSliderMax}
                    step={10}
                    valueText={`${draftReviews} max reviews per day`}
                    onChange={setDraftReviews}
                    onCommit={(v) => onChangeSettings({ reviewsPerDay: v, pace: 'custom' })}
                  />
                )}
              </div>
            </Group>
          </div>

          <div className="study-settings-forecast">
            <ForecastPanel
              forecast={forecast}
              name="all"
              color="var(--accent)"
              totalCards={totalCards}
              secPerAnswer={secPerAnswer}
              today={today}
            />
          </div>
        </div>

        <div>
          <Group ariaLabel="Course study limits" inset="icons">
            {resolvedCourses.map((item) => (
              <Row
                key={item.subject.id}
                leading={<SubjectTile subjectId={item.subject.id} name={item.subject.name} size="sm" />}
                title={item.subject.name}
                subtitle={courseSubtitle(item)}
                value={`${item.resolved.newPerDay.value} / day`}
                trailing={<ChevronRight size={15} className="row-chevron" />}
                onClick={() => onOpenCourse(item.subject.id)}
              />
            ))}
          </Group>
          <SectionFooter>
            Tap a course to set its preset, exam date, or daily limits. Combined cap: {settings.newPerDay} new/day
            {settings.reviewsPerDay !== null ? `, ${settings.reviewsPerDay} reviews/day` : ''}.
          </SectionFooter>
        </div>
      </div>
    </section>
  );
}
