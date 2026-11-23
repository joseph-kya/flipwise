# Subject and lecture navigation

Subject and lecture navigation lets a learner choose which subject to study and narrow the study queue to a single lecture/week or to exam-style questions only.

## Sub-features

- `nav-subject` switches the active subject and loads its sections and cards.
- `nav-lecture` filters the study queue to one lecture (for example `L02` Sensors, 46 cards) or all lectures (341 cards).
- `nav-exam-filter` narrows the active lecture or subject queue to exam-style cards only.
- `nav-persist-selection` preserves the selected filter across reloads.

## How to get to it (user POV)

- Open the `Subject` selector in the top bar and choose a subject (for example `Intro to Robotics`).
- Open the `Lecture / week` selector in the top bar and choose `All lectures (mixed)` or a specific lecture such as `L2 · Sensors (46)`.
- Toggle the `Exam-style only` checkbox above the flashcard stage.

## Driving it with verify-drive.sh

Preconditions:

- Flipwise is running on `http://127.0.0.1:4391` with `verify-doctor.sh` passing.
- `Intro to Robotics` seed deck is loaded (11 sections `L01`–`L10` plus `EXAM`, 341 total cards, 46 in `L02`, 212 exam-style overall).

- **Run navigation scenario.** Execute `.cursor/skills/verify-flipwise/scripts/verify-drive.sh navigation`.
- **Verify controls.** Confirm `getByRole('combobox', { name: /subject/i })` and `getByRole('combobox', { name: /lecture/i })` are visible.
- **Filter to Lecture 2.** Select option `L02` (`L2 · Sensors (46)`) in the `Lecture / week` combobox. The card total updates to `46` and the active card switches to `ir-l02-001`.
- **Apply Exam-style filter.** Check `getByRole('checkbox', { name: /exam-style/i })`. The card count drops to the exam-style subset of `L02` (`> 0` and `<= 46`) and the displayed card carries the exam-style tag.
- **Proof.** Inspect `.verify-artifacts/flipwise/<run-id>/navigation/` for `01-lecture-l02` and `02-lecture-l02-exam` screenshots (`390x844` and `1440x900`), ARIA snapshots, and `report.json`.

## Gotchas

- In the design mockup, switching `Subject` to `Analysis 1` or other placeholder options does not load another deck because only `docs/design/deck.json` exists; multi-subject switching stays unverified until real app code supports multiple subjects in IndexedDB.
- Changing lecture resets the current card flip state; never assume an already-flipped card stays flipped after switching filters.
- Keyboard shortcuts (`Space`, `1`, `2`, `3`) are ignored while focus is inside a `<select>` or `<input>`; blur the selector before testing keyboard study controls.
