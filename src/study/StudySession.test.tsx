// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Subject } from '../demoSubjects';
import type { ReviewEvent } from '../reviewLog';
import { DEFAULT_LIMITS } from '../scheduler';
import { StudySession, type StudyCard } from './StudySession';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

function mount(node: React.ReactElement) {
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

const SUBJECTS: Subject[] = [
  {
    id: 'analysis-1',
    name: 'Analysis 1',
    total: 2,
    lectures: [
      {
        id: 'lec-1',
        title: 'Limits',
        cards: [
          { id: 'c1', front: 'Define limit', back: 'Epsilon-delta answer' },
          { id: 'c2', front: 'Define continuity', back: 'Limit equals value answer' },
        ],
      },
      {
        id: 'lec-empty',
        title: 'Empty lecture',
        cards: [],
      },
    ],
  },
  {
    id: 'physics-1',
    name: 'Physics 1',
    total: 1,
    lectures: [
      {
        id: 'lec-p1',
        title: 'Kinematics',
        cards: [{ id: 'p1', front: 'Define velocity', back: 'Derivative of position answer' }],
      },
    ],
  },
];

const CATALOG: StudyCard[] = [
  {
    id: 'c1',
    front: 'Define limit',
    back: 'Epsilon-delta answer',
    cardId: 'analysis-1/lec-1/c1',
    subjectId: 'analysis-1',
    lessonId: 'lec-1',
    queuePosition: 0,
  },
  {
    id: 'c2',
    front: 'Define continuity',
    back: 'Limit equals value answer',
    cardId: 'analysis-1/lec-1/c2',
    subjectId: 'analysis-1',
    lessonId: 'lec-1',
    queuePosition: 1,
  },
  {
    id: 'p1',
    front: 'Define velocity',
    back: 'Derivative of position answer',
    cardId: 'physics-1/lec-p1/p1',
    subjectId: 'physics-1',
    lessonId: 'lec-p1',
    queuePosition: 1000,
  },
];

const VISIBLE_IDS = new Set(CATALOG.map((c) => c.cardId));

function baseProps(overrides: Partial<React.ComponentProps<typeof StudySession>> = {}) {
  return {
    storageReady: true,
    globalStudy: false,
    subjectId: 'analysis-1',
    lectureId: 'lec-1',
    subjects: SUBJECTS,
    catalog: CATALOG,
    visibleIds: VISIBLE_IDS,
    cards: CATALOG.slice(0, 2),
    log: [] as ReviewEvent[],
    studyLog: [] as ReviewEvent[],
    states: new Map(),
    limits: DEFAULT_LIMITS,
    previewAt: new Date('2026-11-24T12:00:00Z'),
    now: Date.parse('2026-11-24T12:00:00Z'),
    retention: 0.9,
    media: {},
    effectiveMotion: 'full' as const,
    streakDays: 3,
    noteOverlayOpen: false,
    hasStorage: true,
    onAppendEvent: vi.fn(async (event: ReviewEvent) => [event]),
    onRemoveEvents: vi.fn(async () => []),
    onStorageError: vi.fn(),
    onOpenStudySheet: vi.fn(),
    onCompleteChange: vi.fn(),
    ...overrides,
  };
}

describe('StudySession deck-open transition & state integrity', () => {
  it('renders a stable placeholder before the queue is ready, then only the front card once ready', () => {
    let setReady!: (ready: boolean) => void;

    function Harness() {
      const [ready, _setReady] = useState(false);
      setReady = _setReady;
      return (
        <StudySession
          {...baseProps({
            storageReady: ready,
            cards: ready ? CATALOG.slice(0, 2) : [],
          })}
        />
      );
    }

    const host = mount(<Harness />);

    // Before storageReady: stable placeholder, no empty-state / not-found / card / answer flash
    expect(host.querySelector('[data-study-state="loading"]')).toBeTruthy();
    expect(host.querySelector('.study-card-placeholder')).toBeTruthy();
    expect(host.textContent).not.toContain('All caught up');
    expect(host.textContent).not.toContain('Page not found');
    expect(host.textContent).not.toContain('Session complete');
    expect(host.textContent).not.toContain('Define limit');
    expect(host.textContent).not.toContain('Epsilon-delta answer');
    expect(host.querySelector('.card-shell')).toBeNull();

    // Once queue is ready: mounts front card only, no back face / answer in DOM
    act(() => {
      setReady(true);
    });

    expect(host.querySelector('[data-study-state="loading"]')).toBeNull();
    const shell = host.querySelector('.card-shell');
    expect(shell).toBeTruthy();
    expect(shell!.classList.contains('card-shell-overlap')).toBe(false);
    expect(host.querySelector('.card-stagger')).toBeNull();
    expect(host.querySelector('.card-stage')?.classList.contains('is-flipped')).toBe(false);
    expect(host.querySelector('.card-face-front')?.textContent).toContain('Define limit');
    expect(host.querySelector('.card-face-back')).toBeNull();
    expect(host.textContent).not.toContain('Epsilon-delta answer');
  });

  it('also holds a stable placeholder for global study (#/study/global/all) until ready', () => {
    const host = mount(
      <StudySession
        {...baseProps({
          storageReady: false,
          globalStudy: true,
          subjectId: 'global',
          lectureId: 'all',
          cards: [],
        })}
      />,
    );

    expect(host.querySelector('[data-study-state="loading"]')).toBeTruthy();
    expect(host.textContent).not.toContain('All caught up');
    expect(host.textContent).not.toContain('Page not found');
  });

  it('reveals the answer face on demand without animating stage height', () => {
    const host = mount(<StudySession {...baseProps()} />);
    const stage = host.querySelector<HTMLElement>('.card-stage')!;
    const animateSpy = vi.fn();
    stage.animate = animateSpy;

    expect(host.querySelector('.card-face-back')).toBeNull();

    const showBtn = host.querySelector<HTMLButtonElement>('.card-reveal-wrap button')!;
    act(() => {
      showBtn.click();
    });

    expect(stage.classList.contains('is-flipped')).toBe(true);
    expect(host.querySelector('.card-face-back')?.textContent).toContain('Epsilon-delta answer');
    expect(host.querySelector('.ratings-bar')).toBeTruthy();
    expect(animateSpy).not.toHaveBeenCalled();
  });

  it('resets reveal and session state synchronously when switching to another session', () => {
    let switchScope!: (next: { key: string; subjectId: string; lectureId: string; cards: StudyCard[]; globalStudy?: boolean }) => void;

    function Harness() {
      const [scope, setScope] = useState({
        key: 'analysis-1/lec-1',
        subjectId: 'analysis-1',
        lectureId: 'lec-1',
        cards: CATALOG.slice(0, 2),
        globalStudy: false,
      });
      switchScope = (next) => setScope({ globalStudy: false, ...next });
      return (
        <StudySession
          key={scope.key}
          {...baseProps({
            globalStudy: scope.globalStudy,
            subjectId: scope.subjectId,
            lectureId: scope.lectureId,
            cards: scope.cards,
          })}
        />
      );
    }

    const host = mount(<Harness />);

    // Reveal first card in analysis-1/lec-1
    act(() => {
      host.querySelector<HTMLButtonElement>('.card-reveal-wrap button')!.click();
    });
    expect(host.querySelector('.card-face-back')?.textContent).toContain('Epsilon-delta answer');

    // Switch to physics-1/lec-p1: must immediately mount unrevealed front card, never previous answer
    act(() => {
      switchScope({
        key: 'physics-1/lec-p1',
        subjectId: 'physics-1',
        lectureId: 'lec-p1',
        cards: [CATALOG[2]],
      });
    });

    expect(host.querySelector('.card-stage')?.classList.contains('is-flipped')).toBe(false);
    expect(host.querySelector('.card-face-back')).toBeNull();
    expect(host.querySelector('.ratings-bar')).toBeNull();
    expect(host.querySelector('.card-face-front')?.textContent).toContain('Define velocity');
    expect(host.textContent).not.toContain('Derivative of position answer');
    expect(host.textContent).not.toContain('Epsilon-delta answer');

    // Switch to an empty lecture: must show caught-up, never Session complete
    act(() => {
      switchScope({
        key: 'analysis-1/lec-empty',
        subjectId: 'analysis-1',
        lectureId: 'lec-empty',
        cards: [],
      });
    });
    expect(host.textContent).toContain('All caught up');
    expect(host.textContent).not.toContain('Session complete');
  });

  it('never leaks revealed state if the top card in the queue changes', () => {
    let swapCards!: (cards: StudyCard[]) => void;

    function Harness() {
      const [cards, setCards] = useState(CATALOG.slice(0, 2));
      swapCards = setCards;
      return <StudySession {...baseProps({ cards })} />;
    }

    const host = mount(<Harness />);
    act(() => {
      host.querySelector<HTMLButtonElement>('.card-reveal-wrap button')!.click();
    });
    expect(host.querySelector('.card-face-back')?.textContent).toContain('Epsilon-delta answer');

    // Top card changes to c2 (e.g. from sync or learning step becoming due)
    act(() => {
      swapCards([CATALOG[1]]);
    });
    expect(host.querySelector('.card-stage')?.classList.contains('is-flipped')).toBe(false);
    expect(host.querySelector('.card-face-back')).toBeNull();
    expect(host.querySelector('.card-face-front')?.textContent).toContain('Define continuity');
    expect(host.textContent).not.toContain('Limit equals value answer');
  });

  it('keeps card entrance transform+opacity only, hides unflipped back face, and respects prefers-reduced-motion', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');

    const cardEnterMatch = css.match(/@keyframes\s+card-enter\s*\{[^}]*\}/);
    expect(cardEnterMatch).toBeTruthy();
    const cardEnter = cardEnterMatch![0];
    expect(cardEnter).toContain('opacity');
    expect(cardEnter).toContain('transform');
    expect(cardEnter).not.toMatch(/\b(height|width|margin|padding|top|left)\s*:/);

    expect(css).toMatch(/\.card-face-back\s*\{[^}]*visibility:\s*hidden/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.card-shell[\s\S]*?fade-in/);
    expect(css).toContain(':root[data-motion="reduced"] .card-shell');
  });
});
