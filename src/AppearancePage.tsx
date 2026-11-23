import { useState } from 'react';
import type { Card } from 'ts-fsrs';
import { guideUrl } from 'virtual:deck-maker-assets';
import { DataSettings } from './anki/DataSettings';
import { AccountSection } from './sync/AccountSection';
import { InstallRow } from './pwa/InstallApp';
import type { AccountController, AccountSnapshot } from './sync/account';
import type { ImportedData } from './anki/types';
import { useSubjects } from './contentCatalog';
import { StudySettingsSection } from './study/StudySettingsSection';
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
import {
  Group,
  NavRow,
  PageHeader,
  Row,
  SectionHeader,
  Segmented,
  SwatchPicker,
} from './ui';

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

const FONT_OPTIONS: ReadonlyArray<{
  value: FontFamily;
  label: string;
  style: { fontFamily: string };
}> = [
  {
    value: 'system',
    label: 'System',
    style: {
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif',
    },
  },
  {
    value: 'rounded',
    label: 'Rounded',
    style: {
      fontFamily:
        'ui-rounded, "SF Pro Rounded", "Nunito", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
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
  data,
  showDemo = true,
  onShowDemo,
  demoReviewCount = 0,
  onClearDemoHistory,
  account,
  onShowWelcome,
  states,
  unseenBySubject,
  logSignature = '',
  secPerAnswer = 8,
  today,
  onApplyPresetAll,
  onOpenCourseOptions,
}: {
  settings: AppearanceSettings;
  effectiveMotion: EffectiveMotion;
  osReducedMotion: boolean;
  onChange: (patch: Partial<AppearanceSettings>) => void;
  data?: ImportedData;
  showDemo?: boolean;
  onShowDemo?: (show: boolean) => void;
  demoReviewCount?: number;
  onClearDemoHistory?: () => void;
  account?: { controller: AccountController; snapshot: AccountSnapshot };
  onShowWelcome?: () => void;
  states?: ReadonlyMap<string, Card>;
  unseenBySubject?: ReadonlyMap<string, number>;
  logSignature?: string;
  secPerAnswer?: number;
  today?: Date;
  onApplyPresetAll?: (preset: 'slow' | 'medium' | 'aggressive') => void;
  onOpenCourseOptions?: (subjectId: string) => void;
}) {
  const [previewFlipped, setPreviewFlipped] = useState(false);
  const subjects = useSubjects();

  return (
    <div className="section-stack">
      <PageHeader title="Settings" />

      {/* 0. Account (hidden without Firebase config) */}
      {account && <AccountSection account={account.controller} snapshot={account.snapshot} />}

      {/* 1. Appearance */}
      <section aria-label="Appearance" className="settings-section">
        <SectionHeader title="Appearance" />
        <div className="settings-group-stack">
          <Group
            divider={false}
            overflowVisible
            ariaLabel="Live card preview"
            className="preview-group"
          >
            <div
              className={`card-stage preview-card-stage${previewFlipped ? ' is-flipped' : ''}`}
              role="button"
              tabIndex={0}
              aria-pressed={previewFlipped}
              aria-label={
                previewFlipped ? 'Show preview question' : 'Flip preview card'
              }
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
                  <div className="card-question">
                    What does continuity at a point mean?
                  </div>
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
          </Group>

          <Group ariaLabel="Color and surface">
            <Row
              title="Accent"
              stacked
              trailing={
                <SwatchPicker
                  ariaLabel="Accent color"
                  options={ACCENTS}
                  value={settings.accent}
                  onChange={(accent) => onChange({ accent })}
                />
              }
            />
            <Row
              title="Theme"
              stacked
              trailing={
                <Segmented
                  ariaLabel="Theme"
                  options={THEME_OPTIONS}
                  value={settings.theme}
                  onChange={(theme) => onChange({ theme })}
                />
              }
            />
            <Row
              title="Card style"
              stacked
              trailing={
                <Segmented
                  ariaLabel="Card style"
                  options={CARD_STYLE_OPTIONS}
                  value={settings.cardStyle}
                  onChange={(cardStyle) => onChange({ cardStyle })}
                />
              }
            />
          </Group>

          <Group ariaLabel="Reading and motion">
            <Row
              title="Font"
              stacked
              trailing={
                <Segmented
                  ariaLabel="Font"
                  options={FONT_OPTIONS}
                  value={settings.font}
                  onChange={(font) => onChange({ font })}
                />
              }
            />
            <Row
              title="Text size"
              stacked
              trailing={
                <Segmented
                  ariaLabel="Text size"
                  options={TEXT_SIZE_OPTIONS}
                  value={settings.textSize}
                  onChange={(textSize) => onChange({ textSize })}
                />
              }
            />
            <Row
              title="Motion"
              subtitle={
                osReducedMotion && settings.motion === 'full'
                  ? `System Reduce Motion active (${effectiveMotion})`
                  : undefined
              }
              stacked
              trailing={
                <Segmented
                  ariaLabel="Motion"
                  options={MOTION_OPTIONS}
                  value={settings.motion}
                  onChange={(motion) => onChange({ motion })}
                />
              }
            />
          </Group>
        </div>
      </section>

      {/* 2. Study */}
      <StudySettingsSection
        settings={settings}
        subjects={subjects}
        states={states ?? new Map()}
        unseenBySubject={unseenBySubject ?? new Map()}
        logSignature={logSignature}
        secPerAnswer={secPerAnswer}
        today={today ?? new Date()}
        onChangeSettings={onChange}
        onApplyPresetAll={onApplyPresetAll ?? (() => undefined)}
        onOpenCourse={onOpenCourseOptions ?? (() => undefined)}
      />

      {/* 3. Data */}
      {data && onShowDemo && (
        <DataSettings
          data={data}
          showDemo={showDemo}
          onShowDemo={onShowDemo}
          demoReviewCount={demoReviewCount}
          onClearDemoHistory={onClearDemoHistory}
        />
      )}

      {/* 4. About */}
      <section aria-label="About" className="settings-section">
        <SectionHeader title="About" />
        <Group ariaLabel="App information">
          <InstallRow />
          <NavRow href="#/how-it-works" title="How Flipwise works" subtitle="Spaced repetition, ratings and the daily habit" />
          {onShowWelcome && <Row title="Show welcome again" tone="accent" onClick={onShowWelcome} />}
          <Row title="Version" value="0.1.0" />
          <Row title="Storage" value={account?.snapshot.phase === 'signedIn' ? 'On this device + synced' : 'Saved on this device'} />
          <NavRow
            href={guideUrl}
            title="Deck maker guide"
            subtitle="Documentation for creating decks from notes"
            external
          />
        </Group>
      </section>
    </div>
  );
}

export { AppearancePage as SettingsPage };
