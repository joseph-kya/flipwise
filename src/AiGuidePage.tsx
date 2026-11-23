import { useRef, useState, useEffect } from 'react';
import { skillZipUrl, guideUrl } from 'virtual:deck-maker-assets';

const prompts = [
  {title: 'Whole vault', text: 'Use flipwise-deck-maker to make flashcards from my Obsidian vault at [vault path], named [vault name]. Focus on [subjects or folders]. Propose Root::Subject::Lecture names, then create atomic cards from the relevant notes. Include source links, flat tags and stable explicit IDs. Save cards.json and generate study.apkg. Report coverage and uncertain claims. Leave my notes unchanged.'},
  {title: 'One lecture', text: 'Use flipwise-deck-maker on [lecture note path] in the Obsidian vault [vault name]. Use deck [Root::Subject::Lecture]. Make atomic definition, theorem, method and why cards, grounded in the note, with source links and stable explicit IDs. Save cards.json and generate lecture.apkg. Flag missing assumptions instead of guessing.'},
  {title: 'Update an existing deck', text: 'Use flipwise-deck-maker to update [existing cards.json] using [updated note paths] from vault [vault name]. Preserve every existing explicit id for the same concept, even when correcting a front or changing a source path. Revise the affected cards, add IDs only for new concepts, and report removed concepts without deleting them silently. Regenerate [existing output.apkg] and report new versus changed cards. Keep the normalized manifest for the next update.'},
  {title: 'Exam-focused deck', text: 'Use flipwise-deck-maker on [notes folder] from vault [vault name] for [exam scope or learning outcomes]. Prioritize essential definitions, theorem assumptions, standard method steps and common conceptual mistakes. Use Root::Subject::Lecture structure, core/exam tags only where justified, source links and stable explicit IDs. Avoid large enumerations. Save cards.json, generate exam.apkg and report coverage plus topics that need exercise practice.'},
];

export function AiGuidePage() {
  const [copied, setCopied] = useState<number | null>(null);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selection = useRef<HTMLTextAreaElement>(null);
  const [manual, setManual] = useState('');
  useEffect(() => () => { if(timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if(manual) { selection.current?.focus(); selection.current?.select(); } }, [manual]);
  const copy = async (text: string, index: number) => {
    setError(''); setManual('');
    try { await navigator.clipboard.writeText(text); setCopied(index); if(timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(null), 2000); }
    catch { setCopied(null); setManual(text); setError('Select and copy the prompt below.'); }
  };
  return <div className="section-stack ai-guide">
    <div className="page-head"><h1 className="page-title">Make decks with AI</h1><p className="page-eyebrow">From your notes to daily recall</p></div>
    <section className="group import-panel" aria-label="Get the skill">
      <h2>Your notes, ready to study</h2>
      <p>Give your AI agent a vault, folder or lecture note. The portable skill helps it write focused flashcards with source links, then builds an Anki package using Python 3. Your notes stay unchanged.</p>
      <p><a className="btn btn-primary" href={skillZipUrl} download="flipwise-deck-maker.zip">Download skill (.zip)</a></p>
      <p>Unzip the folder into your agent’s skills directory, or attach its files to a chat. Python 3 needs no extra packages. Review the cards before studying.</p>
      <a className="btn btn-plain" href={guideUrl} target="_blank" rel="noopener noreferrer">Read the full guide</a>
    </section>
    <div><h2 className="section-title">Start with a prompt</h2><p className="study-hint">Replace the bracketed paths and names with your own.</p></div>
    {prompts.map((prompt,index)=><section className="group import-panel" key={prompt.title} aria-label={prompt.title}><div className="ai-prompt-heading"><h2>{prompt.title}</h2><button className="btn btn-secondary" aria-label={`Copy ${prompt.title.toLowerCase()} prompt`} onClick={()=>void copy(prompt.text,index)}>{copied===index?'Copied':'Copy'}</button></div><p>{prompt.text}</p></section>)}
    <span className="sr-only" role="status">{copied!==null?'Prompt copied.':''}</span>
    {manual&&<section className="group import-panel"><p role="status">{error}</p><textarea ref={selection} aria-label="Prompt to copy manually" readOnly value={manual}/></section>}
    <section className="group import-panel"><h2>Import, then keep improving</h2><p>Ask the agent for cards.json and an .apkg file. Open Import, check the preview and confirm. Keep the JSON manifest and reuse each card’s ID when editing; re-import updates the content while preserving your Flipwise progress.</p><a className="btn btn-secondary" href="#/import">Import a deck</a></section>
  </div>;
}
