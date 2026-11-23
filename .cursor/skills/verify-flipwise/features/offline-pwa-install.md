# Offline and PWA install

Offline and PWA install proves that Flipwise ships a valid Web App Manifest and service worker so it can be installed on iOS/desktop and used to study and save ratings with zero network connectivity.

## Sub-features

- `pwa-manifest` serves a valid web app manifest (`name`, `icons`, `display: standalone`, `start_url`).
- `pwa-sw` registers and activates a service worker on the production build (`vite preview`) that precaches the app shell and assets.
- `pwa-offline-study` reloads the app with `context.setOffline(true)`, flips and rates a card, and persists the rating in IndexedDB across another offline reload.

## How to get to it (user POV)

- Open Flipwise in a browser (installable via browser "Add to Home Screen" / install prompt).
- Load the app once while online so the service worker activates and caches the shell.
- Turn on Airplane Mode / go offline, reopen or reload Flipwise, and continue studying flashcards normally.

## Driving it with verify-drive.sh

Preconditions:

- Real Flipwise PWA production build is running via `.cursor/skills/verify-flipwise/scripts/verify-launch.sh --mode preview` on `http://127.0.0.1:4391`.
- `verify-doctor.sh` passed, including the web manifest reachability check.

- **Run offline scenario.** Execute `.cursor/skills/verify-flipwise/scripts/verify-drive.sh offline` (and optionally repeat with `--browser webkit` for iOS Safari parity).
- **Verify manifest.** Confirm `<link rel="manifest">` is present in `<head>` and fetches with HTTP 200 and valid JSON.
- **Verify service worker.** Confirm `navigator.serviceWorker.getRegistrations()` reports at least one active registration controlling the page.
- **Reload offline.** Enable `context.setOffline(true)` and reload `http://127.0.0.1:4391/`. The app shell and cards render with Flipwise content and zero uncaught page errors.
- **Proof.** Inspect `.verify-artifacts/flipwise/<run-id>/offline/` for `01-offline-state` screenshots (`390x844` and `1440x900`), ARIA snapshot, and `report.json` (`checks.manifest`, `checks.serviceWorker`, `checks.offlineReload`).

## Gotchas

- Never test offline/service-worker behavior against `vite dev` (`--mode dev`) or `--mode mockup` — neither registers a production precaching service worker. Always use `--mode preview`.
- Any external CDN asset (such as fonts, Marked, or MathJax in the design mockup) breaks offline mode; the real PWA must bundle fonts, Markdown, and KaTeX assets locally so zero third-party network calls are required while offline.
- Service workers register only on secure contexts (`https://` or `http://127.0.0.1` / `localhost`). Always bind to `127.0.0.1`, never a LAN IP.
