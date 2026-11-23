import { useMemo, useRef, useState } from 'react';
import { parseInWorker } from './parseInWorker';
import { mergeImport, mergeReviews, type ImportedCard, type ImportedData } from './types';
import type { ReviewEvent } from '../reviewLog';
import { SubjectIcon } from '../ui';

export function ImportPage({existing, events, onCommit}: {
  existing: ImportedData | null; events: ReviewEvent[];
  onCommit: (data: ImportedData, events: ReviewEvent[]) => Promise<void>;
}) {
  const [preview, setPreview] = useState<ImportedData | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [done, setDone] = useState(false), [history, setHistory] = useState(false);
  const [filename, setFilename] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const select = async (file?: File) => {
    if (!file || busy) return;
    setBusy(true); setFilename(file.name); setError(''); setPreview(null); setDone(false);
    try {
      if (!/\.(apkg|colpkg)$/i.test(file.name)) throw new Error('Choose an .apkg or .colpkg file.');
      setPreview(await parseInWorker(new Uint8Array(await file.arrayBuffer()), file.name));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const merged = useMemo(() => preview ? mergeImport(existing, preview, events) : null, [existing, preview, events]);
  const confirm = async () => {
    if (!merged || !preview || busy) return;
    setBusy(true); setError('');
    try { await onCommit(merged.data, history ? mergeReviews(events, preview.revlog) : events); setDone(true); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const cards = preview?.subjects.reduce((sum,s)=>sum+s.total,0) ?? 0;
  const tags = new Set(preview?.subjects.flatMap(s=>s.lectures.flatMap(l=>l.cards.flatMap(c=>(c as ImportedCard).tags))) ?? []).size;
  return <div className="section-stack">
    <div className="page-head"><h1 className="page-title">Import Anki package</h1><a className="btn btn-plain" href="#/ai-guide">Make decks with AI</a></div>
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">{preview ? 'Saving your collection…' : 'Reading package…'}</p>}
    {done && preview ? <section className="group" aria-label="Import result">
      <div className="import-panel"><h2>Import complete</h2><p>{preview.notes.toLocaleString()} notes · {cards.toLocaleString()} cards</p></div>
      {preview.subjects.map(s=><div className="group-row" key={s.id}><span className="subject-tile"><SubjectIcon subjectId={s.id} name={s.name}/></span><span className="row-main"><span className="row-title">{s.name}</span><span className="row-sub">{s.lectures.length} lectures</span></span><span className="row-value">{s.total.toLocaleString()} cards</span></div>)}
      <div className="import-panel"><a className="btn btn-primary import-confirm" href="#/subjects">Go to subjects</a></div>
    </section> : <>
      <section className="group import-panel import-drop" aria-label="Choose package" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void select(e.dataTransfer.files[0]);}}>
        <p>Drop an Anki package here</p>
        <input ref={input} hidden aria-label="Anki package" type="file" accept=".apkg,.colpkg" disabled={busy} onChange={e=>{void select(e.target.files?.[0]);e.target.value='';}}/>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>input.current?.click()}>Choose file</button>
        <p className="import-filename" role="status">{filename || '.apkg or .colpkg'}</p>
      </section>
      {preview && merged && <>
        <section className="group import-panel" aria-label="Import preview"><h2>{preview.packageName}</h2>
          <dl className="import-summary">{[['Notes',preview.notes],['Cards',cards],['Tags',tags],['Media',Object.keys(preview.media).length],['Revlog',preview.revlog.length],['New',merged.report.new],['Updated',merged.report.updated],['Unchanged',merged.report.unchanged]].map(([label,count])=><div key={label}><dt>{label}</dt><dd>{Number(count).toLocaleString()}</dd></div>)}</dl>
          {merged.report.missing>0 && <p>{merged.report.missing} missing notes kept in your collection.</p>}
        </section>
        <section className="group import-courses" aria-label="Courses in package">{preview.subjects.map(s=><details key={s.id} className="import-course"><summary className="group-row"><span className="subject-tile"><SubjectIcon subjectId={s.id} name={s.name}/></span><span className="row-main"><span className="row-title">{s.name}</span><span className="row-sub">{s.collectionLabel ? `${s.collectionLabel} · ` : ''}{s.lectures.length} lectures</span></span><span className="row-value">{s.total.toLocaleString()} cards</span><span className="import-chevron" aria-hidden="true">⌄</span></summary><ul className="import-lectures">{s.lectures.map(l=><li className="group-row" key={l.id}><span className="row-main">{l.title}</span><span className="row-value">{l.cards.length}</span></li>)}</ul></details>)}</section>
        {preview.warnings.map(w=><p key={w} role="note">{w}</p>)}
        <section className="group"><button type="button" className="group-row import-history" role="switch" aria-checked={history} disabled={busy} onClick={()=>setHistory(!history)}><span className="row-main"><span className="row-title">Import review history</span><span className="row-sub">Merge history while preserving local reviews</span></span><span className={`import-switch${history?' is-on':''}`} aria-hidden="true"><span/></span></button></section>
        <button type="button" className="btn btn-primary import-confirm" disabled={busy} onClick={()=>void confirm()}>Confirm import</button>
      </>}
    </>}
  </div>;
}
