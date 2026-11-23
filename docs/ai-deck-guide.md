# Make decks with AI

Use the portable **flipwise-deck-maker** skill to turn selected notes into atomic Basic flashcards, then generate an Anki package locally. It works with an Obsidian vault, a lecture folder or a single note. You control which files the agent reads; the skill leaves those notes unchanged. Python 3 is the only generator requirement.

## Install

In Flipwise, open Settings → Data → Make decks with AI (also linked from Import), then choose **Download skill (.zip)**. Unzip it; the archive contains one `flipwise-deck-maker` folder. Copy that entire folder into the skill location used by your agent:

- Claude Code: `~/.claude/skills/flipwise-deck-maker/`
- Codex: `~/.codex/skills/flipwise-deck-maker/`
- Agents supporting the shared convention: `~/.agents/skills/flipwise-deck-maker/`
- Cursor: `~/.cursor/skills/flipwise-deck-maker/`
- Gemini CLI: `~/.gemini/skills/flipwise-deck-maker/` (or install the extracted folder with the CLI's skill installer, where supported).

See [Gemini CLI skill discovery](https://geminicli.com/docs/cli/using-agent-skills/) for its shared-directory alias.

These are alternative locations; choose the one your client uses, then reload its skill discovery if needed. For an agent with no skill loader, paste `SKILL.md` into the chat and attach the referenced files plus `scripts/make_apkg.py`; an environment that cannot execute Python can still emit JSON for you to generate locally. Pasting the entrypoint alone does not transfer its supporting files.

## Copy-paste prompts

Replace bracketed paths and names before using these prompts. Ask the agent to use the installed `flipwise-deck-maker` skill, or attach the folder.

### Whole vault

Use flipwise-deck-maker to make flashcards from my Obsidian vault at [vault path], named [vault name]. Focus on [subjects or folders]. Propose Root::Subject::Lecture names, then create atomic cards from the relevant notes. Include source links, flat tags and stable explicit IDs. Save cards.json and generate study.apkg. Report coverage and uncertain claims. Leave my notes unchanged.

### One lecture

Use flipwise-deck-maker on [lecture note path] in the Obsidian vault [vault name]. Use deck [Root::Subject::Lecture]. Make atomic definition, theorem, method and why cards, grounded in the note, with source links and stable explicit IDs. Save cards.json and generate lecture.apkg. Flag missing assumptions instead of guessing.

### Update an existing deck

Use flipwise-deck-maker to update [existing cards.json] using [updated note paths] from vault [vault name]. Preserve every existing explicit id for the same concept, even when correcting a front or changing a source path. Revise the affected cards, add IDs only for new concepts, and report removed concepts without deleting them silently. Regenerate [existing output.apkg] and report new versus changed cards. Keep the normalized manifest for the next update.

### Exam-focused deck

Use flipwise-deck-maker on [notes folder] from vault [vault name] for [exam scope or learning outcomes]. Prioritize essential definitions, theorem assumptions, standard method steps and common conceptual mistakes. Use Root::Subject::Lecture structure, core/exam tags only where justified, source links and stable explicit IDs. Avoid large enumerations. Save cards.json, generate exam.apkg and report coverage plus topics that need exercise practice.

## Generate locally

From the extracted skill folder:

```sh
python3 scripts/make_apkg.py examples/cards.json sample.apkg
python3 scripts/make_apkg.py cards.json study.apkg
```

The JSON schema is in `references/format.md`; the example notes and manifest are in `examples/`. Front/Back accept simple HTML and `\( ... \)` / `\[ ... \]` math. JSON backslashes need escaping. Answers should usually be 15–40 words or shorter when sufficient. This tool produces Basic cards, not cloze or image-occlusion cards.

For a quick Q:/A: note:

```sh
python3 scripts/make_apkg.py --from-markdown note.md quick.apkg \
  --deck 'Semester 1::Analysis 1::Sequences' --vault 'Uni' \
  --source-path 'Analysis 1/Sequences.md'
```

Each `Q:` starts a card and its following `A:` supplies the answer, which may continue until the next question. The command writes `quick.cards.json` with explicit IDs; edit and regenerate that manifest for future updates. The helper does not summarize arbitrary Markdown.

## Import and update

**Flipwise:** Subjects → Import (or Settings → Data → Import Anki package) → pick `.apkg` → inspect the deck tree and new/updated/unchanged counts → Confirm import → Go to subjects. Review history is optional; packages from this generator have no revlog, so the cards begin new. Opening Source on an answer uses your local Obsidian application; the vault name and file path must match yours.

**Anki:** File → Import → select the `.apkg` → review the import report. The package uses the older anki2 schema and bundles no executable templates or media. Anki desktop's note-update options and timestamps also affect whether existing content is replaced; check the report after a re-import.

Keep the JSON manifest and reuse its explicit IDs. Without an explicit ID, the GUID is a hex SHA-256 hash of deck + decoded source path + front. Answer/tag edits retain the identity, but changing the front, deck or source path changes the computed GUID. Before changing those, copy the previous GUID into `id` (the normalized output manifest already does this).

Regenerate and re-import to update content instead of adding duplicates. Flipwise preserves the review log keyed by GUID + card ordinal; new incoming cards do not reset local progress. Missing notes are reported and retained, not deleted. This content-only generator does not transfer Anki scheduling or back up your collection. Verify factual accuracy and keep working exercises alongside recall practice.
