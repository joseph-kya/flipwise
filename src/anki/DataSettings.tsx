import { useId, useMemo, useState } from 'react';
import {
  Button,
  Group,
  NavRow,
  Row,
  SectionFooter,
  SectionHeader,
  Select,
  Switch,
  type SelectOption,
} from '../ui';
import type { ImportedData } from './types';

export function DataSettings({
  data,
  showDemo,
  onShowDemo,
  demoReviewCount = 0,
  onClearDemoHistory,
}: {
  data: ImportedData;
  showDemo: boolean;
  onShowDemo: (show: boolean) => void;
  demoReviewCount?: number;
  onClearDemoHistory?: () => void;
}) {
  const [subject, setSubject] = useState<string>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const demoLabelId = useId();

  const subjectOptions: SelectOption<string>[] = useMemo(
    () => [
      { value: 'all', label: 'All subjects' },
      ...data.subjects.map((s) => ({
        value: s.id,
        label: s.name,
        subtitle: s.collectionLabel,
      })),
    ],
    [data.subjects],
  );

  // Keep selected value valid if subjects list changes
  const activeSubject =
    subject === 'all' || data.subjects.some((s) => s.id === subject)
      ? subject
      : 'all';

  const download = async (format: 'apkg' | 'json') => {
    setBusy(true);
    setError('');
    try {
      const { exportPackage, exportFlipwise } = await import('./package');
      const scopedData: ImportedData =
        activeSubject === 'all'
          ? data
          : {
              ...data,
              subjects: data.subjects.filter((s) => s.id === activeSubject),
            };

      let bytes: Uint8Array;
      let filename: string;

      if (format === 'apkg') {
        bytes = exportPackage(scopedData, await (await import('./sql')).loadSQL());
        filename = 'Flipwise.apkg';
      } else if (activeSubject === 'all') {
        const payload =
          data.subjects.length === 1
            ? exportFlipwise(data, data.subjects[0].id)
            : {
                format: 'flipwise-collection',
                version: 1,
                subjects: data.subjects.map((s) => exportFlipwise(data, s.id)),
              };
        bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
        filename = 'Flipwise.flipwise.json';
      } else {
        bytes = new TextEncoder().encode(
          JSON.stringify(exportFlipwise(data, activeSubject), null, 2),
        );
        filename = 'Flipwise.flipwise.json';
      }

      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], {
          type:
            format === 'apkg' ? 'application/octet-stream' : 'application/json',
        }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const canExport = !busy && data.subjects.length > 0;

  return (
    <section aria-label="Data" className="settings-section">
      <SectionHeader title="Data" />

      <div className="settings-group-stack">
        <Group ariaLabel="Import">
          <NavRow
            href="#/import"
            title="Import Anki package"
            subtitle="Add or update decks from .apkg or .colpkg"
          />
        </Group>

        <Group ariaLabel="Export" overflowVisible>
          <Row
            title="Subject"
            trailing={
              <Select
                ariaLabel="Export subject"
                options={subjectOptions}
                value={activeSubject}
                onChange={setSubject}
                disabled={data.subjects.length === 0}
              />
            }
          />
          <Row
            title="Export Anki package (.apkg)"
            tone="accent"
            disabled={!canExport}
            onClick={() => void download('apkg')}
          />
          <Row
            title="Export Flipwise JSON"
            tone="accent"
            disabled={!canExport}
            onClick={() => void download('json')}
          />
        </Group>

        <Group ariaLabel="Demo data and AI tools">
          <Row
            title="Show demo decks"
            titleId={demoLabelId}
            subtitle="Include built-in sample courses in your library"
            trailing={
              <Switch
                checked={showDemo}
                onChange={onShowDemo}
                labelledBy={demoLabelId}
              />
            }
          />

          {demoReviewCount > 0 && onClearDemoHistory ? (
            confirmClear ? (
              <Row
                title={`Clear ${demoReviewCount.toLocaleString()} demo reviews?`}
                subtitle="Your real review history is kept."
                trailing={
                  <div className="row-confirm-actions">
                    <Button
                      variant="plain"
                      onClick={() => setConfirmClear(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setConfirmClear(false);
                        onClearDemoHistory();
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                }
              />
            ) : (
              <Row
                title="Clear demo history"
                subtitle={`${demoReviewCount.toLocaleString()} demo reviews · real reviews kept`}
                tone="destructive"
                onClick={() => setConfirmClear(true)}
              />
            )
          ) : (
            <Row
              title="Clear demo history"
              subtitle="No demo reviews stored"
              value="Cleared"
            />
          )}

          <NavRow
            href="#/ai-guide"
            title="Make decks with AI"
            subtitle="Prompts and skill for Obsidian & notes"
          />
        </Group>
      </div>

      {busy && (
        <SectionFooter>
          <span role="status">Preparing export…</span>
        </SectionFooter>
      )}
      {error && (
        <SectionFooter className="section-footer-error">
          <span role="alert">{error}</span>
        </SectionFooter>
      )}
    </section>
  );
}
