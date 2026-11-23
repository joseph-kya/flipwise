---
name: verify-flipwise
description: Verify Flipwise (mobile-first React + TypeScript Vite PWA flashcard app) end to end with Playwright using a fixed non-default port and disposable browser profile. Reach for this skill whenever proving UI flows, spaced-repetition scheduling, navigation, deck import, touch targets, reduced motion, IndexedDB persistence, or offline PWA behavior.
---

# Verify Flipwise

Flipwise is a mobile-first spaced-repetition flashcard PWA (React + TypeScript + Vite + Dexie/IndexedDB, installable and offline-capable, primary target 390px iPhone plus 1440px desktop; no Tauri/native shell). Read [features/README.md](./features/README.md) before driving a flow.

## Launch

Start an isolated instance on fixed non-default port `4391` (never `4173`, `5173`, or `3000`) with a fresh disposable browser profile under `/tmp/flipwise-verify-<run-id>/profile` so verification never touches a user's real IndexedDB or browser session:

```bash
# Real PWA (normal verification once app code exists)
.cursor/skills/verify-flipwise/scripts/verify-launch.sh --mode dev

# Real PWA production build (required for service worker, manifest, and offline checks)
.cursor/skills/verify-flipwise/scripts/verify-launch.sh --mode preview

# Design mockup stand-in (only while no app code / package.json exists yet)
.cursor/skills/verify-flipwise/scripts/verify-launch.sh --mode mockup
```

- Override the port only if needed via `--port <port>` or `FLIPWISE_VERIFY_PORT`. The launcher refuses to start if the port is already occupied — never double-drive an existing server.
- **Seed data:** `decks/intro-to-robotics.flipwise.json` (341 cards, 11 sections, 212 exam-style). In `--mode mockup`, `docs/design/deck.json` is an identical copy loaded automatically.
- **Ready means usable:** `verify-launch.sh` waits until the entry URL returns HTTP 200 with Flipwise markup (and `deck.json` loads in mockup mode), not merely until a socket opens.
- **Teardown:** always run `verify-cleanup.sh` at the end of every run, including failed runs.

## Doctor

Run this read-only check before driving or whenever anything looks off:

```bash
.cursor/skills/verify-flipwise/scripts/verify-doctor.sh
```

Doctor verifies, without mutating state:
1. The recorded server PID is alive and owns port `4391`.
2. The disposable profile directory exists under `/tmp/flipwise-verify-*`.
3. The entry URL responds with HTTP 200 and Flipwise HTML (plus `deck.json` in `mockup` mode, or web manifest in `preview` mode).
4. Playwright and its cached Chromium/WebKit binaries in `~/Library/Caches/ms-playwright` are reachable via `npx --yes -p playwright` with no repo `package.json` or dependencies added.
5. `decks/intro-to-robotics.flipwise.json` is present.

If doctor fails, stop and fix the launch before driving.

## Drive

Drive the app with Playwright through `verify-drive.sh` (runs `npx --yes -p playwright` against the run's disposable persistent browser profile — never adds dependencies to the repo):

```bash
.cursor/skills/verify-flipwise/scripts/verify-drive.sh <scenario> [--browser chromium|webkit] [--strict]
```

Scenarios mapped to [features/](./features/README.md):
- `study-session` — flip a card, rate Again/Hard/Good, verify next card, touch targets, reduced motion, reload persistence, and offline check.
- `scheduling` — rate Again, Hard, and Good on separate cards, confirm `due(Again) < due(Hard) < due(Good)`, reload, and confirm persisted due state.
- `navigation` — switch subject/lecture filters (`L02` Sensors, `Exam-style only`) and confirm counts and card IDs update.
- `import` — upload `decks/intro-to-robotics.flipwise.json` via the Decks file input and confirm 341 cards persist in IndexedDB.
- `offline` — verify web app manifest, service worker registration, and full offline reload (`context.setOffline(true)`).
- `audit` — run the cross-cutting checks on the current landing view.

Driving rules:
- Prefer ARIA roles and accessible names (`getByRole('button', { name: ... })`, `getByRole('combobox', { name: ... })`, `getByRole('tab', { name: ... })`) over CSS selectors or coordinates.
- Default browser is `chromium`; pass `--browser webkit` to verify iOS Safari engine behavior.
- Every verification run checks:
  - Phone (`390x844`) and desktop (`1440x900`) screenshots.
  - Touch targets `>= 44x44px` on interactive controls at `390x844`.
  - `prefers-reduced-motion: reduce` disables card flip transition (`0s`).
  - Data survives a page reload (IndexedDB in the real PWA).
  - Offline reload behavior (`context.setOffline(true)` against `--mode preview`).

## Evidence

Artifacts are written to `.verify-artifacts/flipwise/<run-id>/<scenario>/` (gitignored via `.gitignore`, preserved across cleanup):

- `*-phone-390x844.png` and `*-desktop-1440x900.png` — before/after user actions at both viewports.
- `*.aria.txt` — ARIA accessibility snapshots pairing action and resulting state.
- `report.json` — machine-readable results for touch-target measurements, reduced-motion check, IndexedDB/localStorage snapshots before and after reload, offline reload status, console/page errors, and pass/fail summary.

Proof standards:
- Drive real user paths (clicks, file upload, reloads), never internal store setters or test-only hooks.
- Capture both the action and the resulting state, plus storage side effects read back after a reload.
- Never weaken a failing check to force a pass; report unmet preconditions and record them under that feature's `Gotchas`.

## Cleanup

Tear down every verification instance when done (and after failed iterations):

```bash
.cursor/skills/verify-flipwise/scripts/verify-cleanup.sh
```

- Kills **only** the recorded server PID and its direct children from `/tmp/flipwise-verify-<run-id>/state.env` — never kills by process name.
- Confirms port `4391` has no remaining listener.
- Deletes `/tmp/flipwise-verify-<run-id>` (disposable browser profile and logs).
- **Never** deletes `.verify-artifacts/flipwise/<run-id>/` so proof survives teardown.

## Helpers

All helper scripts live in `.cursor/skills/verify-flipwise/scripts/` and are executable:

| Script | Invocation | Purpose |
| --- | --- | --- |
| `verify-launch.sh` | `.cursor/skills/verify-flipwise/scripts/verify-launch.sh [--mode dev\|preview\|mockup] [--port 4391] [--run-id <id>]` | Start server on fixed port, create disposable profile, wait for usable UI |
| `verify-doctor.sh` | `.cursor/skills/verify-flipwise/scripts/verify-doctor.sh [--run-id <id>]` | Read-only health check (PID, port ownership, profile isolation, HTTP, Playwright) |
| `verify-drive.sh` | `.cursor/skills/verify-flipwise/scripts/verify-drive.sh <scenario> [--run-id <id>] [--browser chromium\|webkit] [--strict]` | Run Playwright scenario via `npx` and write evidence bundle |
| `verify-cleanup.sh` | `.cursor/skills/verify-flipwise/scripts/verify-cleanup.sh [--run-id <id>]` | Stop recorded PID, verify port freed, delete temp profile, keep artifacts |
| `drive.mjs` | Invoked by `verify-drive.sh` | Playwright driver implementing scenarios, viewports, a11y, storage, and offline checks |
| `serve-mockup.mjs` | Invoked by `verify-launch.sh --mode mockup` | Strict-port local static server for `docs/design/` with `/.verify-ping` |

## Feature map

- [features/README.md](./features/README.md) — baseline preconditions, driving conventions, and proof rules.
- [features/study-session.md](./features/study-session.md) — flip card, rate Again/Hard/Good, next card, touch targets, reduced motion.
- [features/scheduling-outcome.md](./features/scheduling-outcome.md) — interval ordering and persisted next due date.
- [features/subject-lecture-navigation.md](./features/subject-lecture-navigation.md) — subject and lecture/exam-only filtering.
- [features/deck-import.md](./features/deck-import.md) — importing `decks/intro-to-robotics.flipwise.json`.
- [features/offline-pwa-install.md](./features/offline-pwa-install.md) — manifest, service worker, and offline study via `vite preview`.

Keep the map honest as app code lands by running `/maintain-verification-skill`.

## Unverified steps (mockup stand-in only)

No PWA app code exists yet; the initial end-to-end proof ran against `docs/design/flipwise-mockup.html` (`--mode mockup`). The following steps remain **unverified** until real React + Vite PWA code is implemented and verified on `--mode dev` / `--mode preview`:

1. Launching the Vite dev server (`verify-launch.sh --mode dev` / `npx vite --host 127.0.0.1 --port 4391 --strictPort`).
2. Building and launching `vite preview` (`verify-launch.sh --mode preview`) for production service-worker verification.
3. Persisting review ratings, scheduling state, and imported decks in **IndexedDB** (Dexie) across reloads (the mockup persists only to `localStorage['fw.srs']`).
4. Importing a `*.flipwise.json` file (`decks/intro-to-robotics.flipwise.json`) via a real file input / dropzone (the mockup's Decks view only shows static placeholder text).
5. PWA Web App Manifest validation, service worker registration/activation, installability, and offline reload/study (`context.setOffline(true)` — fails in mockup because no service worker exists and external CDN assets are uncached).
6. FSRS (`ts-fsrs`) scheduling interval math and real multi-subject switching (the mockup implements a simplified 3-grade SM-2 approximation and only loads one subject).
7. Passing strict `>= 44x44px` touch-target checks on **all** mobile controls at `390x844` and declaring `<meta name="viewport" content="width=device-width, initial-scale=1">` (in the mockup, the flashcard and rating buttons pass, while header `<select>` controls, view tabs, and filter checkboxes are `< 44px` tall and the viewport meta tag is missing).
8. WebKit (`--browser webkit`) iOS Safari verification against the real PWA build.
