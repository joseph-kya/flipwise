# Flipwise verification map

This directory is the maintained source for verifying the user-facing behavior of Flipwise. Read this index before driving the app, then follow the matching feature file as the recipe.

## Baseline preconditions

- Launch Flipwise at `http://127.0.0.1:4391` via `.cursor/skills/verify-flipwise/scripts/verify-launch.sh` (`--mode dev` for normal PWA checks, `--mode preview` for offline/service-worker checks, `--mode mockup` only while app code does not exist).
- Never use ports `4173`, `5173`, or `3000`, and never drive a server that was not started by this verification run.
- Use the disposable browser profile at `/tmp/flipwise-verify-<run-id>/profile` so no run touches a user's real IndexedDB or browser session.
- Use `decks/intro-to-robotics.flipwise.json` (341 cards, 11 sections, 212 exam-style) as the seed deck.
- Run `.cursor/skills/verify-flipwise/scripts/verify-doctor.sh` before driving and require a passing result.

## Driving conventions

- Start each recipe from a clean disposable profile unless its preconditions state otherwise.
- Prefer ARIA roles and accessible names (`button`, `combobox`, `tab`, `checkbox`) over CSS selectors, DOM order, or coordinates.
- Treat commands and flags as literal. Invoke Playwright only through `.cursor/skills/verify-flipwise/scripts/verify-drive.sh` (which uses `npx --yes -p playwright` with zero repo dependencies).
- Run `--browser chromium` by default and `--browser webkit` when checking iOS Safari parity.
- Every verification run captures screenshots at `390x844` (phone) and `1440x900` (desktop), checks touch targets `>= 44x44px`, checks `prefers-reduced-motion: reduce`, and checks reload persistence.
- Always run `.cursor/skills/verify-flipwise/scripts/verify-cleanup.sh` after every run (even failed ones). Cleanup removes the server and `/tmp/flipwise-verify-<run-id>`, never `.verify-artifacts/`.

## Proof and skip reporting

- Capture both the user action and the resulting state, not only the final screen.
- Every UI proof bundle in `.verify-artifacts/flipwise/<run-id>/<scenario>/` includes phone (`390x844`) and desktop (`1440x900`) PNG screenshots, ARIA snapshots (`*.aria.txt`), and `report.json`.
- Mutation proofs (rating, scheduling, deck import) must reload the page and read back persisted storage (IndexedDB in the real PWA; `localStorage` only in mockup stand-in mode).
- If a precondition is missing or a feature is unimplemented (such as deck import or service worker in the mockup), report the failure honestly with the attempted command and unmet precondition. Never weaken a journey to make it pass.
- Do not claim a skipped or stand-in step is verified for the real PWA.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior, followed by exactly four H2 sections in this order:

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify-drive.sh` starts with `Preconditions:` and pairs each user action with an exact command or ARIA interaction and observable result.
4. `Gotchas` lists traps and known gaps that can waste or invalidate a verification run.

## Features

- [Study session](./study-session.md) covers flipping a flashcard, rating Again/Hard/Good, advancing to the next card, touch targets, reduced motion, and reload persistence.
- [Scheduling outcome](./scheduling-outcome.md) covers interval ordering across Again/Hard/Good ratings and verifying due dates persist after reload.
- [Subject and lecture navigation](./subject-lecture-navigation.md) covers selecting a subject, filtering by lecture/week or Exam-style only, and updating the active card queue.
- [Deck import](./deck-import.md) covers importing `decks/intro-to-robotics.flipwise.json` into IndexedDB and confirming it survives reload.
- [Offline and PWA install](./offline-pwa-install.md) covers web app manifest, service worker activation, and studying offline on `vite preview`.
