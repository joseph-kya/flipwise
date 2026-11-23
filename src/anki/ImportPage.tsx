import { useState } from "react";
import { parseInWorker } from "./parseInWorker";
import { mergeImport, mergeReviews, type ImportedData } from "./types";
import type { ReviewEvent } from "../reviewLog";
export function ImportPage({
  existing,
  events,
  onCommit,
}: {
  existing: ImportedData | null;
  events: ReviewEvent[];
  onCommit: (data: ImportedData, events: ReviewEvent[]) => Promise<void>;
}) {
  const [preview, setPreview] = useState<ImportedData | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false),
    [history, setHistory] = useState(false);
  const select = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    setPreview(null);
    setDone(false);
    try {
      if (!/\.(apkg|colpkg)$/i.test(file.name))
        throw new Error("Choose an .apkg or .colpkg file.");
      await new Promise((r) => setTimeout(r, 30));
      setPreview(
        await parseInWorker(
          new Uint8Array(await file.arrayBuffer()),
          file.name,
        ),
      );
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };
  const merged = preview ? mergeImport(existing, preview, events) : null;
  const confirm = async () => {
    if (!merged || !preview || busy) return;
    setBusy(true);
    setError("");
    try {
      await onCommit(
        merged.data,
        history ? mergeReviews(events, preview.revlog) : events,
      );
      setDone(true);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="section-stack">
      <div className="page-head">
        <h1 className="page-title">Import Anki package</h1>
        <a className="btn btn-plain" href="#/ai-guide">Make decks with AI</a>
      </div>
      {error && <p role="alert">{error}</p>}
      {busy && (
        <p role="status">
          {preview ? "Saving your collection…" : "Reading package…"}
        </p>
      )}
      {done ? (
        <section className="group import-panel">
          <h2>Import complete</h2>
          <p>
            {preview?.notes} notes ·{" "}
            {preview?.subjects.reduce((n, s) => n + s.total, 0)} cards
          </p>
          <a className="btn btn-primary" href="#/subjects">
            Go to subjects
          </a>
        </section>
      ) : (
        <>
          <section
            className="group import-panel import-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!busy) void select(e.dataTransfer.files[0]);
            }}
          >
            <p>Drop an Anki package here</p>
            <label className="btn btn-secondary">
              Choose file
              <input
                aria-label="Anki package"
                type="file"
                accept=".apkg,.colpkg"
                disabled={busy}
                onChange={(e) => void select(e.target.files?.[0])}
              />
            </label>
          </section>
          {preview && merged && (
            <section className="group import-panel" aria-label="Import preview">
              <h2>{preview.packageName}</h2>
              <p>
                {preview.notes} notes ·{" "}
                {preview.subjects.reduce((n, s) => n + s.total, 0)} cards ·{" "}
                {
                  new Set(
                    preview.subjects.flatMap((s) =>
                      s.lectures.flatMap((l) =>
                        l.cards.flatMap((c) => (c as any).tags),
                      ),
                    ),
                  ).size
                }{" "}
                tags · {Object.keys(preview.media).length} media ·{" "}
                {preview.revlog.length} revlog
              </p>
              <p>
                {merged.report.new} new · {merged.report.updated} updated ·{" "}
                {merged.report.unchanged} unchanged · {merged.report.missing}{" "}
                missing (kept)
              </p>
              {preview.subjects.map((s) => (
                <div key={s.id}>
                  <h3>
                    {s.collectionLabel ? `${s.collectionLabel} › ` : ""}
                    {s.name} · {s.total} cards
                  </h3>
                  <ul>
                    {s.lectures.map((l) => (
                      <li key={l.id}>
                        {l.title} · {l.cards.length}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {preview.warnings.map((w) => (
                <p key={w}>{w}</p>
              ))}
              <label className="list-row">
                <input
                  type="checkbox"
                  checked={history}
                  onChange={(e) => setHistory(e.target.checked)}
                />{" "}
                Import review history (preserve local progress)
              </label>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void confirm()}
              >
                Confirm import
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
