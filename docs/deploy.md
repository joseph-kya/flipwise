# Deploying Flipwise (GitHub Pages)

Live URL, once Pages is enabled: **https://malikovski.github.io/flipwise/**

`.github/workflows/deploy.yml` runs on every push to `main`, and from Actions › Deploy to GitHub
Pages › Run workflow.

1. **build:** `npm ci`, `npm test`, then `npm run build` with `BASE_PATH=/flipwise/`. Uploads
   `dist/` as the Pages artifact.
2. **pages-check:** asks the API whether Pages is enabled with source "GitHub Actions". If not,
   the run stays green and shows a notice saying what to do. The deploy is skipped, not failed.
3. **deploy:** `actions/deploy-pages`.

## One-time setup (repository owner only)

Pages can only be switched on by the owner of `malikovski/flipwise`. Collaborators with Write
access can't do it.

1. Go to **Settings › Pages › Build and deployment › Source** and choose **GitHub Actions**.
2. Re-run the latest "Deploy to GitHub Pages" workflow, or push to `main`.

## Firebase

- The build uses the six `VITE_FIREBASE_*` web-config values that are written into the workflow.
  These are public by design: they're in every built bundle, and Firestore rules plus Auth's
  authorized domains are what protect data.
- To change them without editing the workflow, set **repository variables** with the same names
  (Settings › Secrets and variables › Actions › Variables). Variables take precedence over the
  defaults in the file.
- **Authorized domains** (Firebase console › Authentication › Settings): `malikovski.github.io`
  is already authorized, as are `localhost`, `127.0.0.1` and `joseph-kya.github.io`. Google
  sign-in works on the live URL without changes.

## Base path

`vite.config.ts` reads `BASE_PATH`, defaulting to `/`. Local dev (`npm run dev`, or port 4441
for this worktree) stays at `/`. Everything that loads at runtime follows
`import.meta.env.BASE_URL`:

- the JS and CSS chunks
- the starter pack (`starter/ai-robotics.json`)
- sql-wasm
- KaTeX fonts
- the deck-maker zip and guide
- the manifest and icons
- the service worker and its scope

To try a sub-path build locally:

```sh
BASE_PATH=/flipwise/ npm run build
mkdir -p /tmp/site && ln -sfn "$PWD/dist" /tmp/site/flipwise
python3 -m http.server 4442 --bind 127.0.0.1 --directory /tmp/site   # http://127.0.0.1:4442/flipwise/
```

## Installing and updating (PWA)

- **Install:** Settings › About › Install app, and a quiet button on the first-run welcome.
  - **Chrome and Edge** (Mac, Windows) show their own install dialog.
  - **Safari on Mac:** File › Add to Dock.
  - **iPhone and iPad:** Share › Add to Home Screen.
  - **Firefox:** can't install web apps, so the button explains how to do it from another
    browser.
- **Offline:** the service worker, production builds only, caches the app shell, so Flipwise
  opens offline. `index.html` is fetched network-first, so new builds arrive on the next
  launch.
- **Updates:** when a new build is waiting, the app shows "New version available · Reload".
- **Never cached:** Firebase, Google sign-in and Firestore traffic is cross-origin and goes
  straight to the network.
- **Icons:** `scripts/build-icons.mjs` regenerates them from `public/icons/flipwise-mark.svg`.
