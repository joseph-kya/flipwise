// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Subject } from '../demoSubjects';
import { DEFAULT_SETTINGS } from '../settings';
import type { StudyLimits } from '../studyOptions';
import { StudyOptionsSheet } from './StudyOptionsSheet';
import { StudySettingsSection } from './StudySettingsSection';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

function render(node: React.ReactElement) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
  return container;
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

const today = new Date(2026, 10, 23, 12);

const makeSubject = (study?: StudyLimits, lecStudy?: StudyLimits): Subject => ({
  id: 'robotics',
  name: 'Robotics',
  total: 904,
  ...(study ? { study } : {}),
  lectures: [
    {
      id: 'l1',
      title: 'Kinematics',
      cards: Array.from({ length: 40 }, (_, i) => ({ id: `c${i}`, front: 'Q', back: 'A' })),
      ...(lecStudy ? { study: lecStudy } : {}),
    },
    {
      id: 'l2',
      title: 'Dynamics',
      cards: Array.from({ length: 864 }, (_, i) => ({ id: `d${i}`, front: 'Q', back: 'A' })),
    },
  ],
});

describe('StudyOptionsSheet & StudySettingsSection', () => {
  it('applies presets, switches to Exam mode with calendar and resets to inherited', () => {
    function Harness() {
      const [study, setStudy] = useState<StudyLimits | undefined>(undefined);
      return (
        <StudyOptionsSheet
          open
          onClose={() => undefined}
          subject={makeSubject(study)}
          global={DEFAULT_SETTINGS}
          retention={0.9}
          states={new Map()}
          logSignature="0:"
          secPerAnswer={8}
          today={today}
          onSaveCourse={(_id, next) => setStudy(next)}
          onSaveLecture={() => undefined}
        />
      );
    }

    render(<Harness />);
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog).toBeTruthy();
    expect(dialog.textContent).toContain('Inherited · Course default');
    expect(dialog.textContent).toContain('11 / day');
    expect(dialog.textContent).toContain('You’ll have seen all 904 Robotics cards by');

    // Click Aggressive preset
    const aggBtn = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Aggressive')!;
    act(() => aggBtn.click());
    expect(dialog.textContent).toContain('40 / day');
    expect(dialog.textContent).toContain('500 / day');

    // Click Exam date preset -> opens calendar and solves
    const examBtn = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Exam date')!;
    act(() => examBtn.click());
    expect(dialog.querySelector('.ui-datepicker')).toBeTruthy();
    expect(dialog.textContent).toContain('From exam date');

    // Reset all to inherited
    const resetAll = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Reset all to inherited')!;
    act(() => resetAll.click());
    expect(dialog.textContent).toContain('Inherited · Course default');
    expect(dialog.textContent).toContain('11 / day');
  });

  it('supports lecture-level overrides inheriting from course and resetting', () => {
    function Harness() {
      const [lecStudy, setLecStudy] = useState<StudyLimits | undefined>({ newPerDay: 4 });
      const subj = makeSubject({ preset: 'medium', newPerDay: 20, reviewsPerDay: 200 }, lecStudy);
      return (
        <StudyOptionsSheet
          open
          onClose={() => undefined}
          subject={subj}
          lecture={subj.lectures[0]}
          global={DEFAULT_SETTINGS}
          retention={0.9}
          states={new Map()}
          logSignature="0:"
          secPerAnswer={8}
          today={today}
          onSaveCourse={() => undefined}
          onSaveLecture={(_s, _l, next) => setLecStudy(next)}
        />
      );
    }

    render(<Harness />);
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Kinematics');
    expect(dialog.textContent).toContain('Set for this lecture');
    expect(dialog.textContent).toContain('4 / day');

    const resetBtn = [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Reset to inherited')!;
    act(() => resetBtn.click());
    expect(dialog.textContent).toContain('Inherited · Set for this course');
    expect(dialog.textContent).toContain('20 / day');
  });

  it('renders Settings > Study with global presets, live forecast and course rows', () => {
    const onOpenCourse = vi.fn();
    const onApplyPresetAll = vi.fn();
    const subj = makeSubject();
    const host = render(
      <StudySettingsSection
        settings={DEFAULT_SETTINGS}
        subjects={[subj]}
        states={new Map()}
        unseenBySubject={new Map([['robotics', 904]])}
        logSignature="0:"
        secPerAnswer={8}
        today={today}
        onChangeSettings={() => undefined}
        onApplyPresetAll={onApplyPresetAll}
        onOpenCourse={onOpenCourse}
      />,
    );

    expect(host.textContent).toContain('Desired retention');
    expect(host.textContent).toContain('Pace preset');
    expect(host.textContent).toContain('Forecast');
    expect(host.textContent).toContain('Robotics');

    const slowBtn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Slow')!;
    act(() => slowBtn.click());
    expect(onApplyPresetAll).toHaveBeenCalledWith('slow');

    const courseRow = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Robotics'))!;
    act(() => courseRow.click());
    expect(onOpenCourse).toHaveBeenCalledWith('robotics');
  });
});
