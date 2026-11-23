# Deck import

Deck import lets a user load a `*.flipwise.json` deck file from disk so its subject, lectures, and cards become available to study and persist in IndexedDB.

## Sub-features

- `import-open` navigates to the Decks view and exposes a file input or dropzone accepting `*.flipwise.json`.
- `import-parse` validates and imports `decks/intro-to-robotics.flipwise.json` (341 cards across 11 sections).
- `import-persist` saves the imported subject, sections, and cards in IndexedDB so they survive a reload.

## How to get to it (user POV)

- Choose the `Decks` tab in the top navigation.
- Activate the `Import a deck` control (file picker or drag-and-drop zone) and select a `*.flipwise.json` file.
- Confirm the imported subject appears in the deck list and can be studied from the `Study` tab.

## Driving it with verify-drive.sh

Preconditions:

- Real Flipwise PWA is running via `verify-launch.sh --mode dev` (or `--mode preview`) with a clean disposable profile and `verify-doctor.sh` passed.
- Seed file `decks/intro-to-robotics.flipwise.json` exists in the repo.

- **Run import scenario.** Execute `.cursor/skills/verify-flipwise/scripts/verify-drive.sh import`.
- **Open Decks view.** Click `getByRole('tab', { name: /decks/i })`. The Decks view renders with an import control containing `<input type="file">`.
- **Upload seed deck.** Attach `decks/intro-to-robotics.flipwise.json` via Playwright `setInputFiles`. `Introduction to Robotics` appears in the deck list showing `341` cards and `11` sections.
- **Confirm IndexedDB persistence.** Reload the page and inspect IndexedDB. The imported deck database/stores remain populated and `Introduction to Robotics` is still selectable to study.
- **Proof.** Inspect `.verify-artifacts/flipwise/<run-id>/import/` for `01-decks-view` and `02-after-import` screenshots (`390x844` and `1440x900`), ARIA snapshots, and `report.json`.

## Gotchas

- **Unimplemented in mockup:** `docs/design/flipwise-mockup.html` only renders a static `Import a deck` box with no `<input type="file">`. Running `verify-drive.sh import` in `--mode mockup` intentionally fails and reports the missing file input; do not weaken the scenario to pass on the mockup.
- Import must be tested from an empty disposable IndexedDB profile so an already-seeded deck cannot mask a broken import write.
- Re-importing the same `subject.id` (`intro-to-robotics`) should not duplicate cards or wipe existing review history silently; verify card count stays `341`.
