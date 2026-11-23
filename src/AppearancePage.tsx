import { useState } from 'react';
import {
  ACCENTS,
  type AppearanceSettings,
  type CardStyle,
  type EffectiveMotion,
  type FontFamily,
  type MotionSetting,
  type TextSize,
  type ThemeMode,
} from './settings';
import { CheckIcon, SegmentedControl } from './ui';

const THEME_OPTIONS: ReadonlyArray<{ value: ThemeMode; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'black', label: 'True Black' },
];

const CARD_STYLE_OPTIONS: ReadonlyArray<{ value: CardStyle; label: string }> = [
  { value: 'classic', label: 'Classic' },
  { value: 'glass', label: 'Glass' },
  { value: 'paper', label: 'Paper' },
];

const FONT_OPTIONS: ReadonlyArray<{ value: FontFamily; label: string; style: { fontFamily: string } }> = [
  {
    value: 'system',
    label: 'System',
    style: { fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif' },
  },
  {
    value: 'rounded',
    label: 'Rounded',
    style: {
      fontFamily: 'ui-rounded, "SF Pro Rounded", "Nunito", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    },
  },
  {
    value: 'serif',
    label: 'Serif',
    style: { fontFamily: 'ui-serif, "New York", Georgia, "Times New Roman", serif' },
  },
];

const TEXT_SIZE_OPTIONS: ReadonlyArray<{ value: TextSize; label: string }> = [
  { value: 'sm', label: 'S' },
  { value: 'md', label: 'M' },
  { value: 'lg', label: 'L' },
];

const MOTION_OPTIONS: ReadonlyArray<{ value: MotionSetting; label: string }> = [
  { value: 'full', label: 'Full' },
  { value: 'reduced', label: 'Reduced' },
  { value: 'off', label: 'Off' },
];

export function AppearancePage({
  settings,
  effectiveMotion,
  osReducedMotion,
  onChange,
}: {
  settings: AppearanceSettings;
  effectiveMotion: EffectiveMotion;
  osReducedMotion: boolean;
  onChange: (patch: Partial<AppearanceSettings>) => void;
}) {
  const [previewFlipped, setPreviewFlipped] = useState(false);

  return (
    <div className="section-stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1 className="page-title">Appearance</h1>
      </div>

      <section className="group" aria-label="Study">
        <h2 className="group-title">Study</h2>
        <div className="list-row"><span>Desired retention</span>
        <SegmentedControl ariaLabel="Desired retention" value={String(settings.retention)} options={[{value: '0.85',label: '85%'},{value: '0.9',label: '90%'},{value: '0.95',label: '95%'}]} onChange={(value) => onChange({retention: Number(value)})} /></div>
      </section>
      <section aria-label="Live preview" className="group preview-group">
        <div
          className={`card-stage preview-card-stage${previewFlipped ? ' is-flipped' : ''}`}
          role="button"
          tabIndex={0}
          aria-pressed={previewFlipped}
          aria-label={previewFlipped ? 'Show preview question' : 'Flip preview card'}
          onClick={() => setPreviewFlipped((f) => !f)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setPreviewFlipped((f) => !f);
            }
          }}
        >
          <div className="card-flipper">
            <div className="study-card card-face card-face-front preview-card">
              <div className="card-meta">
                <span>Preview</span>
                <span>Tap to flip</span>
              </div>
              <div className="card-question">What does continuity at a point mean?</div>
            </div>
            <div className="study-card card-face card-face-back preview-card">
              <div className="card-meta">
                <span>Answer</span>
                <span>Tap to flip back</span>
              </div>
              <div className="markdown">
                <p>The limit of f(x) as x approaches a equals f(a).</p>
              </div>
            </div>
          </div>
        </div>

        <div className="preview-ratings" aria-hidden="true">
          <span className="rating-btn rating-again preview-rating">Again</span>
          <span className="rating-btn rating-hard preview-rating">Hard</span>
          <span className="rating-btn rating-good preview-rating">Good</span>
          <span className="rating-btn rating-easy preview-rating">Easy</span>
        </div>
      </section>

      <section aria-label="Color and theme">
        <div className="section-head">
          <h2 className="section-title">Color</h2>
        </div>
        <div className="group group-divider">
          <div className="settings-row">
            <span className="settings-label">Accent</span>
            <div className="swatch-row" role="radiogroup" aria-label="Accent color">
              {ACCENTS.map((accent) => {
                const selected = settings.accent === accent.id;
                return (
                  <button
                    key={accent.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={accent.label}
                    className={`swatch-btn${selected ? ' is-selected' : ''}`}
                    onClick={() => onChange({ accent: accent.id })}
                  >
                    <span className="swatch-circle" style={{ background: accent.swatch }}>
                      {selected && <CheckIcon size={15} className="swatch-check" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-row">
            <span className="settings-label">Theme</span>
            <SegmentedControl
              ariaLabel="Theme"
              options={THEME_OPTIONS}
              value={settings.theme}
              onChange={(theme) => onChange({ theme })}
            />
          </div>

          <div className="settings-row">
            <span className="settings-label">Card style</span>
            <SegmentedControl
              ariaLabel="Card style"
              options={CARD_STYLE_OPTIONS}
              value={settings.cardStyle}
              onChange={(cardStyle) => onChange({ cardStyle })}
            />
          </div>
        </div>
      </section>

      <section aria-label="Typography and motion">
        <div className="section-head">
          <h2 className="section-title">Reading & Motion</h2>
        </div>
        <div className="group group-divider">
          <div className="settings-row">
            <span className="settings-label">Font</span>
            <SegmentedControl
              ariaLabel="Font"
              options={FONT_OPTIONS}
              value={settings.font}
              onChange={(font) => onChange({ font })}
            />
          </div>

          <div className="settings-row">
            <span className="settings-label">Text size</span>
            <SegmentedControl
              ariaLabel="Text size"
              options={TEXT_SIZE_OPTIONS}
              value={settings.textSize}
              onChange={(textSize) => onChange({ textSize })}
            />
          </div>

          <div className="settings-row">
            <div className="settings-label-stack">
              <span className="settings-label">Motion</span>
              {osReducedMotion && settings.motion === 'full' && (
                <span className="row-sub">
                  System Reduce Motion active ({effectiveMotion})
                </span>
              )}
            </div>
            <SegmentedControl
              ariaLabel="Motion"
              options={MOTION_OPTIONS}
              value={settings.motion}
              onChange={(motion) => onChange({ motion })}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
