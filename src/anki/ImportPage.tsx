import { useId, useMemo, useRef, useState } from 'react';
import type { ReviewEvent } from '../reviewLog';
import {
  Button,
  ChevronDown,
  Group,
  NavRow,
  PageHeader,
  Row,
  SectionFooter,
  SectionHeader,
  SubjectIcon,
  Switch,
} from '../ui';
import { parseInWorker } from './parseInWorker';
import { mergeImport, mergeReviews, type ImportedCard, type ImportedData } from './types';

export function ImportPage({
  existing,
  events,
  onCommit,
}: {
  existing: ImportedData | null;
  events: ReviewEvent[];
  onCommit: (data: ImportedData, events: ReviewEvent[]) => Promise<void>;
}) {
  const [preview, setPreview] = useState<ImportedData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [history, setHistory] = useState(false);
  const [filename, setFilename] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const historyLabelId = useId();

  const select = async (file?: File) => {
    if (!file || busy) return;
    setBusy(true);
    setFilename(file.name);
    setError('');
    setPreview(null);
    setDone(false);
    try {
      if (!/\.(apkg|colpkg)$/i.test(file.name)) {
        throw new Error('Choose an .apkg or .colpkg file.');
      }
      setPreview(
        await parseInWorker(new Uint8Array(await file.arrayBuffer()), file.name),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const merged = useMemo(
    () => (preview ? mergeImport(existing, preview, events) : null),
    [existing, preview, events],
  );

  const confirm = async () => {
    if (!merged || !preview || busy) return;
    setBusy(true);
    setError('');
    try {
      await onCommit(
        merged.data,
        history ? mergeReviews(events, preview.revlog) : events,
      );
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const cards = preview?.subjects.reduce((sum, s) => sum + s.total, 0) ?? 0;
  const tags = new Set(
    preview?.subjects.flatMap((s) =>
      s.lectures.flatMap((l) => l.cards.flatMap((c) => (c as ImportedCard).tags)),
    ) ?? [],
  ).size;

  return (
    <div className="section-stack">
      <PageHeader
        title="Import Anki package"
        subtitle="Add decks or update existing cards while keeping your review progress."
      />

      {error && (
        <p className="inline-notice inline-notice-error" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className="inline-notice" role="status">
          {preview ? 'Saving your collection…' : 'Reading package…'}
        </p>
      )}

      {done && preview ? (
        <div className="section-stack">
          <section aria-label="Import complete">
            <SectionHeader
              title="Import complete"
              action={
                <span className="row-sub tabular">
                  {preview.notes.toLocaleString()} notes · {cards.toLocaleString()} cards
                </span>
              }
            />
            <Group inset="icons" ariaLabel="Imported courses">
              {preview.subjects.map((s) => (
                <Row
                  key={s.id}
                  leading={
                    <span className="subject-tile">
                      <SubjectIcon subjectId={s.id} name={s.name} />
                    </span>
                  }
                  title={s.name}
                  subtitle={
                    s.collectionLabel
                      ? `${s.collectionLabel} · ${s.lectures.length} lectures`
                      : `${s.lectures.length} lectures`
                  }
                  value={`${s.total.toLocaleString()} cards`}
                />
              ))}
            </Group>
          </section>

          <Button variant="primary" size="full" href="#/subjects">
            Go to subjects
          </Button>
        </div>
      ) : (
        <>
          <section
            className="group import-drop"
            aria-label="Choose package"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void select(e.dataTransfer.files[0]);
            }}
          >
            <p className="import-drop-title">Drop an Anki package here</p>
            <input
              ref={input}
              hidden
              aria-label="Anki package"
              type="file"
              accept=".apkg,.colpkg"
              disabled={busy}
              onChange={(e) => {
                void select(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              Choose file
            </Button>
            <p className="import-filename" role="status">
              {filename || '.apkg or .colpkg'}
            </p>
          </section>

          {preview && merged && (
            <>
              <section aria-label="Import summary">
                <SectionHeader title={preview.packageName} />
                <Group divider={false} padded>
                  <dl className="import-summary">
                    {(
                      [
                        ['Notes', preview.notes],
                        ['Cards', cards],
                        ['Tags', tags],
                        ['Media', Object.keys(preview.media).length],
                        ['Revlog', preview.revlog.length],
                        ['New', merged.report.new],
                        ['Updated', merged.report.updated],
                        ['Unchanged', merged.report.unchanged],
                      ] as const
                    ).map(([label, count]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{Number(count).toLocaleString()}</dd>
                      </div>
                    ))}
                  </dl>
                </Group>
                {merged.report.missing > 0 && (
                  <SectionFooter>
                    {merged.report.missing} missing notes kept in your collection.
                  </SectionFooter>
                )}
              </section>

              <section aria-label="Courses in package">
                <SectionHeader title="Courses" />
                <Group inset="icons" ariaLabel="Courses in package">
                  {preview.subjects.map((s) => (
                    <details key={s.id} className="import-course">
                      <summary className="group-row group-row-interactive">
                        <span className="subject-tile">
                          <SubjectIcon subjectId={s.id} name={s.name} />
                        </span>
                        <span className="row-main">
                          <span className="row-title">{s.name}</span>
                          <span className="row-sub">
                            {s.collectionLabel ? `${s.collectionLabel} · ` : ''}
                            {s.lectures.length} lectures
                          </span>
                        </span>
                        <span className="row-value">
                          {s.total.toLocaleString()} cards
                        </span>
                        <ChevronDown size={16} className="row-chevron import-course-chevron" />
                      </summary>
                      <ul className="import-lectures">
                        {s.lectures.map((l) => (
                          <li className="group-row" key={l.id}>
                            <span className="row-main">
                              <span className="lesson-title">{l.title}</span>
                            </span>
                            <span className="row-value">{l.cards.length}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </Group>
              </section>

              {preview.warnings.length > 0 && (
                <section aria-label="Import notes">
                  <SectionHeader title="Notes" />
                  <Group ariaLabel="Import warnings">
                    {preview.warnings.map((w) => (
                      <div key={w} className="group-row" role="note">
                        <span className="row-sub">{w}</span>
                      </div>
                    ))}
                  </Group>
                </section>
              )}

              <Group ariaLabel="Review history option">
                <Row
                  title="Import review history"
                  titleId={historyLabelId}
                  subtitle="Merge Anki review log while preserving local reviews"
                  trailing={
                    <Switch
                      checked={history}
                      onChange={setHistory}
                      disabled={busy}
                      labelledBy={historyLabelId}
                    />
                  }
                />
              </Group>

              <Button
                variant="primary"
                size="full"
                disabled={busy}
                onClick={() => void confirm()}
              >
                Confirm import
              </Button>
            </>
          )}

          {!preview && (
            <section aria-label="Create decks">
              <SectionHeader title="Need a deck?" />
              <Group ariaLabel="Create decks with AI">
                <NavRow
                  href="#/ai-guide"
                  title="Make decks with AI"
                  subtitle="Turn Obsidian vaults or lecture notes into Anki packages"
                />
              </Group>
            </section>
          )}
        </>
      )}
    </div>
  );
}
