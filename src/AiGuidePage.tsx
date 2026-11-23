import { useEffect, useRef, useState } from 'react';
import { guideUrl, skillZipUrl } from 'virtual:deck-maker-assets';
import {
  Button,
  Group,
  NavRow,
  PageHeader,
  Row,
  SectionFooter,
  SectionHeader,
} from './ui';

const prompts = [
  {
    title: 'Whole vault',
    text: 'Use flipwise-deck-maker to make flashcards from my Obsidian vault at [vault path], named [vault name]. Focus on [subjects or folders]. Propose Root::Subject::Lecture names, then create atomic cards from the relevant notes. Include source links, flat tags and stable explicit IDs. Save cards.json and generate study.apkg. Report coverage and uncertain claims. Leave my notes unchanged.',
  },
  {
    title: 'One lecture',
    text: 'Use flipwise-deck-maker on [lecture note path] in the Obsidian vault [vault name]. Use deck [Root::Subject::Lecture]. Make atomic definition, theorem, method and why cards, grounded in the note, with source links and stable explicit IDs. Save cards.json and generate lecture.apkg. Flag missing assumptions instead of guessing.',
  },
  {
    title: 'Update an existing deck',
    text: 'Use flipwise-deck-maker to update [existing cards.json] using [updated note paths] from vault [vault name]. Preserve every existing explicit id for the same concept, even when correcting a front or changing a source path. Revise the affected cards, add IDs only for new concepts, and report removed concepts without deleting them silently. Regenerate [existing output.apkg] and report new versus changed cards. Keep the normalized manifest for the next update.',
  },
  {
    title: 'Exam-focused deck',
    text: 'Use flipwise-deck-maker on [notes folder] from vault [vault name] for [exam scope or learning outcomes]. Prioritize essential definitions, theorem assumptions, standard method steps and common conceptual mistakes. Use Root::Subject::Lecture structure, core/exam tags only where justified, source links and stable explicit IDs. Avoid large enumerations. Save cards.json, generate exam.apkg and report coverage plus topics that need exercise practice.',
  },
];

export function AiGuidePage() {
  const [copied, setCopied] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selection = useRef<HTMLTextAreaElement>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (manual) {
      selection.current?.focus();
      selection.current?.select();
    }
  }, [manual]);

  const copy = async (text: string, index: number) => {
    setError('');
    setManual('');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
      setManual(text);
      setError('Select and copy the prompt below.');
    }
  };

  return (
    <div className="section-stack ai-guide">
      <PageHeader
        title="Make decks with AI"
        subtitle="Give your AI agent a vault, folder or lecture note. The portable skill writes focused flashcards with source links and builds an Anki package using Python 3 while leaving your notes unchanged."
      />

      <section aria-label="Skill and guide">
        <SectionHeader title="Get started" />
        <Group ariaLabel="Skill resources">
          <NavRow
            href={skillZipUrl}
            download="flipwise-deck-maker.zip"
            title="Download skill (.zip)"
            subtitle="Unzip into your agent’s skills folder or attach its files in chat"
          />
          <NavRow
            href={guideUrl}
            external
            title="Read the full guide"
            subtitle="Setup instructions, deck conventions and examples"
          />
        </Group>
        <SectionFooter>
          Requires Python 3 with no extra packages. Always review generated cards before studying.
        </SectionFooter>
      </section>

      <section aria-label="Prompts" className="ai-prompts-section">
        <div>
          <SectionHeader title="Prompts" />
          <SectionFooter className="ai-prompts-intro">
            Replace the bracketed paths and names with your own.
          </SectionFooter>
        </div>

        <div className="ai-prompt-list">
          {prompts.map((prompt, index) => (
            <Group key={prompt.title} ariaLabel={prompt.title}>
              <Row
                title={prompt.title}
                trailing={
                  <Button
                    variant="plain"
                    ariaLabel={`Copy ${prompt.title.toLowerCase()} prompt`}
                    onClick={() => void copy(prompt.text, index)}
                  >
                    {copied === index ? 'Copied' : 'Copy'}
                  </Button>
                }
              />
              <div className="ai-prompt-body">
                <p>{prompt.text}</p>
              </div>
            </Group>
          ))}
        </div>

        <span className="sr-only" role="status">
          {copied !== null ? 'Prompt copied.' : ''}
        </span>

        {manual && (
          <Group divider={false} padded ariaLabel="Manual prompt copy">
            <p className="inline-notice" role="status">
              {error}
            </p>
            <textarea
              ref={selection}
              className="ai-manual-textarea"
              aria-label="Prompt to copy manually"
              readOnly
              value={manual}
            />
          </Group>
        )}
      </section>

      <section aria-label="Import workflow">
        <SectionHeader title="Next step" />
        <Group ariaLabel="Import deck">
          <NavRow
            href="#/import"
            title="Import Anki package"
            subtitle="Preview notes, courses and review history before saving"
          />
        </Group>
        <SectionFooter>
          Keep your cards.json manifest and reuse each card’s explicit ID when editing; re-importing updates card content while preserving your Flipwise progress.
        </SectionFooter>
      </section>
    </div>
  );
}
