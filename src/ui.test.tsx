// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Select, Switch, formatSubjectDisplay } from './ui';

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

describe('shared UI controls (Switch, Select, formatSubjectDisplay)', () => {
  it('Switch exposes role="switch", aria-checked, and toggles via click', () => {
    function Harness() {
      const [on, setOn] = useState(false);
      return <Switch checked={on} onChange={setOn} ariaLabel="Show demo decks" />;
    }

    const host = render(<Harness />);
    const sw = host.querySelector<HTMLButtonElement>('[role="switch"]')!;
    expect(sw).toBeTruthy();
    expect(sw.getAttribute('aria-checked')).toBe('false');

    act(() => {
      sw.click();
    });
    expect(sw.getAttribute('aria-checked')).toBe('true');

    act(() => {
      sw.click();
    });
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });

  it('Select opens listbox with keyboard navigation, checkmark, and Escape close', () => {
    const options = [
      { value: 'all', label: 'All subjects' },
      { value: 'analysis-1', label: 'Analysis 1', subtitle: 'Semester 1' },
      { value: 'physics-1', label: 'Physics 1' },
    ] as const;

    function Harness() {
      const [val, setVal] = useState<'all' | 'analysis-1' | 'physics-1'>('all');
      return (
        <Select
          ariaLabel="Subject"
          options={options}
          value={val}
          onChange={setVal}
        />
      );
    }

    const host = render(<Harness />);
    const trigger = host.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.textContent).toContain('All subjects');

    // Open with ArrowDown
    act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    const listbox = host.querySelector<HTMLElement>('[role="listbox"]')!;
    expect(listbox).toBeTruthy();
    const opts = host.querySelectorAll<HTMLButtonElement>('[role="option"]');
    expect(opts.length).toBe(3);
    expect(opts[0].getAttribute('aria-selected')).toBe('true');

    // Select second option
    act(() => {
      opts[1].click();
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.textContent).toContain('Analysis 1');

    // Reopen and close with Escape
    act(() => {
      trigger.click();
    });
    expect(host.querySelector('[role="listbox"]')).toBeTruthy();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host.querySelector('[role="listbox"]')).toBeNull();
  });

  it('decodes encoded Anki subject IDs into subject name and semester subtitle', () => {
    const decoded = formatSubjectDisplay('anki-Sample%20Semester%3A%3AAnalysis%201', []);
    expect(decoded).toEqual({
      name: 'Analysis 1',
      subtitle: 'Sample Semester',
      known: false,
    });
  });
});
