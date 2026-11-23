# Scheduling outcome

Scheduling outcome ensures that rating a card moves its next due date in the right direction — Again brings it back within minutes, Hard schedules a shorter gap, and Good schedules a longer gap — and persists those due timestamps across reloads.

## Sub-features

- `sched-again` schedules a short re-learning interval (minutes) and requeues the card in the current session.
- `sched-hard` schedules a shorter future interval than Good.
- `sched-good` schedules a longer future interval (days) than Hard.
- `sched-persist` stores updated scheduling records in IndexedDB so due dates survive reload.

## How to get to it (user POV)

- Start a study session on `Intro to Robotics`.
- Flip a card and read the projected next interval shown on each rating button (`Again`, `Hard`, `Good`).
- Rate three consecutive cards with `Again`, `Hard`, and `Good`, then reload or open `Stats` to confirm the forecast and persisted due state.

## Driving it with verify-drive.sh

Preconditions:

- Flipwise is running on `http://127.0.0.1:4391` with a clean disposable profile and `verify-doctor.sh` passed.
- Seed deck `Intro to Robotics` has at least 3 unreviewed cards (`ir-l01-001`, `ir-l01-002`, `ir-l01-003`).

- **Run scheduling scenario.** Execute `.cursor/skills/verify-flipwise/scripts/verify-drive.sh scheduling`.
- **Rate three cards.** For card 1, click the flashcard button then `getByRole('button', { name: /again|didn't know/i })`; for card 2, flip then click `/hard|unsure/i`; for card 3, flip then click `/good|knew it/i`.
- **Verify due date ordering.** Read persisted scheduling records from IndexedDB (or `localStorage['fw.srs']` in mockup mode) and assert `due(card1/Again) < due(card2/Hard) < due(card3/Good)`.
- **Confirm persistence across reload.** Reload the page and re-read storage. All three card records remain present with identical due timestamps.
- **Proof.** Inspect `.verify-artifacts/flipwise/<run-id>/scheduling/report.json` (`checks.schedulingOrder`, `checks.storageAfterReload`) along with `01-after-three-ratings` and `02-after-reload` PNGs (`390x844` and `1440x900`) and ARIA snapshots.

## Gotchas

- The mockup uses a simplified SM-2 approximation in `localStorage['fw.srs']`; the real PWA uses FSRS (`ts-fsrs`) stored in Dexie/IndexedDB, so exact day counts will differ while the invariant `due(Again) < due(Hard) < due(Good)` must hold in both.
- Rating `Again` requeues the card later in the same session, so do not assert that the card disappears permanently from the queue; assert its stored due timestamp is earlier than `Hard` and `Good`.
- Always check persisted storage after a reload — session counters in the sidebar reset on reload and are not proof of persistence.
