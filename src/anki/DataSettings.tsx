import { useState } from "react";
import type { ImportedData } from "./types";
import { exportPackage, exportFlipwise } from "./package";
import { loadSQL } from "./sql";
export function DataSettings({
  data,
  showDemo,
  onShowDemo,
}: {
  data: ImportedData;
  showDemo: boolean;
  onShowDemo: (show: boolean) => void;
}) {
  const [subject, setSubject] = useState(data.subjects[0]?.id ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const download = async (format: "apkg" | "json") => {
    setBusy(true);
    setError("");
    try {
      const bytes =
        format === "apkg"
          ? exportPackage(data, await loadSQL())
          : new TextEncoder().encode(
              JSON.stringify(exportFlipwise(data, subject), null, 2),
            );
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], {
          type:
            format === "apkg" ? "application/octet-stream" : "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download =
        format === "apkg" ? "Flipwise.apkg" : "Flipwise.flipwise.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="group import-panel" aria-label="Data">
      <h2>Data</h2>
      <p><a className="btn btn-secondary" href="#/ai-guide">Make decks with AI</a></p>
      <div className="list-row">
        <label>
          <input
            type="checkbox"
            checked={showDemo}
            onChange={(e) => onShowDemo(e.target.checked)}
          />{" "}
          Show demo decks
        </label>
      </div>
      <p>
        <a className="btn btn-secondary" href="#/import">
          Import Anki package
        </a>
      </p>
      <p>
        <button
          className="btn btn-secondary"
          disabled={busy || !data.subjects.length}
          onClick={() => void download("apkg")}
        >
          Export Anki package
        </button>
      </p>
      <label>
        Subject{" "}
        <select value={subject} onChange={(e) => setSubject(e.target.value)}>
          {data.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        <button
          className="btn btn-secondary"
          disabled={busy || !subject}
          onClick={() => void download("json")}
        >
          Export Flipwise JSON
        </button>
      </p>
      {busy && <p role="status">Preparing export…</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
