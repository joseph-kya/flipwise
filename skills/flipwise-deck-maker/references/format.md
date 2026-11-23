# Generator input

UTF-8 JSON, with this envelope:

```json
{
  "cards": [
    {
      "deck": "Semester 1::Analysis 1::Sequences",
      "front": "Can a convergent real sequence have two distinct limits?",
      "back": "No. Limits of convergent real sequences are unique.",
      "tags": ["core", "theorem"],
      "source": "obsidian://open?vault=Uni&file=Analysis%201%2FSequences.md",
      "id": "analysis-sequences-unique-limit"
    }
  ]
}
```

`cards` is a nonempty array. Each card requires nonempty `deck`, `front`, `back`, an array of flat string `tags`, and an `obsidian://open` source URL with nonempty `vault` and `file` query parameters. `id` is optional. Each deck is exactly `Root::Subject::Lecture`; all three names must be nonempty. For this generator there is one Basic card per note, ordinal 0. Cards enter the new queue in JSON order (due positions 1, 2, …). Flipwise's course/global daily caps apply after import.

`front` and `back` use simple HTML and Anki math (`\( ... \)` / `\[ ... \]`); no templates, cloze syntax, scripts or embedded media. All JSON fields are strings except `tags`. Unknown keys are rejected so misspelled fields are caught. Use `urllib.parse.urlencode` or an equivalent URL encoder for vault names and vault-relative file paths. Encode a heading fragment as part of the `file` value (for example `Notes.md%23Limits`), not as the URL's own fragment. Never embed a machine's absolute filesystem path.

## Stable identity

If an explicit `id` is supplied, the GUID equals that ID, unchanged. IDs must be unique in a manifest and remain attached to the same concept across later edits. Use a short portable ID (letters, digits, `_`, `-`, `.`, `:`; up to 80 characters).

Otherwise the generator computes a 32-character lowercase hex GUID:

```python
source_path = parse_qs(urlsplit(card['source']).query)['file'][0]
identity = json.dumps([card['deck'], source_path, card['front']],
                      ensure_ascii=False, separators=(',', ':'))
guid = hashlib.sha256(identity.encode('utf-8')).hexdigest()[:32]
```

This hashes the exact deck string, decoded vault-relative source path and exact front text. Back and tags are excluded, so answer/tag edits update the existing note. Changing the front, source path or deck changes a computed GUID. To edit any of those while retaining progress, first save the original computed GUID as the explicit `id` and keep it on subsequent versions. Do not mint a new ID for a correction. The command prints GUIDs and writes a normalized `<output>.cards.json` manifest with explicit IDs; keep that manifest for updates.

Flipwise's stable card ID is derived from GUID + ordinal, and re-import does not replace its local review log. Removed notes are reported, not deleted. Anki also uses note GUIDs to identify re-imported notes; newer timestamps permit content updates. Neither tool should be described as deleting missing notes automatically.

## Quick Markdown mode

```markdown
Q: In Python, what does continue do inside a loop?
A: It skips the rest of the current iteration and proceeds to the next.

Q: Can a convergent real sequence have two distinct limits?
A: No. A convergent real sequence has a unique limit.
```

Use `--from-markdown INPUT OUTPUT --deck 'Root::Subject::Lecture' --vault 'Uni' --source-path 'Course/Note.md'`. A Q starts a card and its A can continue on subsequent lines until the next Q. Optional Markdown headings outside cards are ignored. This is a Q:/A: extractor, not a summarizer or a general Markdown renderer. Use basic HTML in answers when formatting is needed. All cards use the supplied deck and source. For later edits use the generated JSON manifest to preserve IDs.
