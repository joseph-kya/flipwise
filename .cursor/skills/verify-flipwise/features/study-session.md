# Study session

Study session lets a learner view the front of a flashcard, flip it to reveal the answer, rate how well they knew it (Again, Hard, or Good), and advance immediately to the next card while keeping progress persisted across reloads.

## Sub-features

- `study-flip` reveals the card answer and enables the three rating buttons on tap/click or `Space`.
- `study-rate` records Again, Hard, or Good (via button or keys `1`/`2`/`3`) and advances to the next card.
- `study-a11y` verifies `>= 44x44px` touch targets at `390x844` and zero card flip transition under `prefers-reduced-motion: reduce`.
- `study-persist` keeps the rated card's review state after a full page reload.

## How to get to it (user POV)

- Open Flipwise on the default `Study` view (or choose the `Study` tab in the top navigation).
- Tap/click the flashcard or press `Space` to flip it.
- Tap/click a rating button (`Again`/`Didn't know`, `Hard`/`Unsure`, `Good`/`Knew it`) or press `1`, `2`, or `3`.

## Driving it with verify-drive.sh

Preconditions:

- Flipwise is running on `http://127.0.0.1:4391` via `verify-launch.sh` (`--mode dev` for real PWA, `--mode mockup` for stand-in).
- `verify-doctor.sh` passed.
- Seed deck `Intro to Robotics` is loaded (`ir-l01-001` "What is a robot? (exam definition)" is due first in a clean profile).

- **Run full flow.** Execute `.cursor/skills/verify-flipwise/scripts/verify-drive.sh study-session`. The script opens a fresh disposable profile at `390x844` and waits for the flashcard button (`role=button`, name matching `/flashcard|flip|show answer/i`) and first question to render.
- **Audit mobile ergonomics & motion.** At `390x844`, the script checks interactive element dimensions (`>= 44x44px`) and emulates `prefers-reduced-motion: reduce`, requiring `transitionDuration` of `0s` on the card.
- **Flip card.** Click `getByRole('button', { name: /flashcard|flip|show answer/i })`. The answer face becomes visible and all three rating buttons (`Again`/`Didn't know`, `Hard`/`Unsure`, `Good`/`Knew it`) become visible and enabled.
- **Rate Good and advance.** Click `getByRole('button', { name: /good|knew it/i })`. The displayed question changes from `ir-l01-001` to the next card (`ir-l01-002` "Define robotics.") and the progress counter advances.
- **Confirm reload persistence.** Reload the page. Storage contains the review record for `ir-l01-001` (IndexedDB in PWA; `localStorage['fw.srs']` in mockup) and `ir-l01-001` does not reappear as the first due card.
- **Proof.** Check `.verify-artifacts/flipwise/<run-id>/study-session/` for `01-before-flip`, `02-after-flip`, and `03-after-rate` screenshots at both `390x844` and `1440x900`, matching `*.aria.txt` snapshots, and `report.json`.

## Gotchas

- Button labels differ between README (`Again`, `Hard`, `Good`) and the design mockup (`Didn't know`, `Unsure`, `Knew it`); keep ARIA patterns matched to the real app once implemented and remove the mockup aliases via `/maintain-verification-skill`.
- Rating keys `1`/`2`/`3` and rating buttons are inactive until the card is flipped.
- In `--mode mockup`, header `<select>` dropdowns, view tabs, and filter checkboxes are smaller than `44x44px` at `390x844`, storage uses `localStorage` instead of IndexedDB, and offline reload fails because there is no service worker. The real PWA must pass all of these without stand-in allowances (verify with `--strict`).
