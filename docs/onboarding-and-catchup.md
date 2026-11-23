# Onboarding and quick catch-up

## First-run onboarding

**When it shows:** on a device with no `flipwise.onboarded.v1` flag **and** no real decks.
Real decks means any imported, synced or starter card; the built-in demo decks never count.
The decision is made when local storage loads. An unfinished persisted flow also resumes after
adding decks, so a reload in the explainer does not discard progress. It can be replayed from Settings → About → "Show welcome again".

**Steps:**
1. **Welcome**
2. **Sign in**
   - Uses the existing account controller.
   - "Continue offline" appears only when Firebase isn't configured or the device is offline,
     and “Continue without account” appears after two failures/cancellations or an auth timeout.
     Sign-in remains available later in Settings.
   - Once signed in, the step waits for the first sync. If the cloud already had decks, it
     finishes onboarding; otherwise it goes to step 3. Signed-in users never revisit Welcome.
3. **Choose your start**
   - **AI & Robotics starter set:** pick courses, then add them through the normal import path
     (see `docs/starter-pack.md`).
   - **Import my own decks:** a short Anki-export how-to with the real Import screen embedded,
     or the AI deck-maker how-to with the real AI guide embedded.
4. **How Flipwise works:** three panels.
   - FSRS, with a forgetting-curve sketch.
   - Rating honestly.
   - The daily habit: course caps and catch-up.

   The same panels are at Settings → About → "How Flipwise works" (`#/how-it-works`).
5. **Done:** sets the flag and opens Today.

**Demo decks:** when the first real decks arrive (from import, the starter set or sync), the
built-in demo decks are hidden and the generated demo history is cleared. Demo data never syncs.
An explicit Settings choice ("Show demo decks") always wins, and nothing is deleted.

**Testing in a headless browser:** Firebase is configured and online there, so "Continue offline"
is hidden by design. Emulate offline (`context.setOffline(true)`), click it, then go back online.
With `VITE_FIREBASE_EMULATOR=1`, `?authTest=redirect` forces the real emulator redirect
handler for return-path verification. The switch has no effect in a production Firebase setup.

## Reload and sign-in recovery

`flipwise.onboarding-progress.v1` stores the step, start view, explainer panel, and starter-course
choices. `null` choices mean all default courses; an empty list deliberately selects none.
Invalid values are validated and corrupt/unavailable storage falls back safely. Completion clears
progress. Import and starter choices remain on the device; they are not uploaded as onboarding data.

Configured auth begins in a loading gate rather than Welcome, including restored account and
redirect state. It waits up to six seconds for Firebase's initial auth state and redirect processing.
A signed-in user at Welcome/account skips sign-in; later steps keep their restored position.
Existing cloud decks finish setup automatically. Late auth results are still accepted after timeout.
Failed and cancelled attempts show an inline explanation and “Try again”; two unlock
“Continue without account”. The ordinary offline/unconfigured escape remains available.

The update prompt is deferred until onboarding finishes. Its Reload action previously could
interrupt sign-in or reset in-memory progress; progress also survives an external reload or app kill.
First-install service-worker activation does not reload the app (`src/pwa/runtime.ts`).

For local browser proof, use only the demo Firebase project and Auth/Firestore emulators, then
serve Vite on 4443. `scripts/verify-ios-signin.cjs` drives WebKit with an iPhone 15 viewport,
fake emulator accounts, redirect returns, cancellation, reload restoration, and screenshots under
ignored `artifacts/ios-check/`. Production-path verification uses a build with
`BASE_PATH=/flipwise/`, served on `127.0.0.1:4443/flipwise/`. See the verification script's header
for invocation. No real Google login or production Firebase request is needed.

## Quick catch-up (`#/catchup/<subject|global>/<lecture|all>`)

**Entry points:**
- Catch up on a subject page.
- Catch up in the header of a lecture's study screen.
- A "Catch up on N due cards" row on Today when more than 50 cards are due.

**Rules** (pure, in `src/catchup.ts`):
- **Due cards:** a card that is due *when you answer* logs a real FSRS review through the normal
  review log. Knew it = Good, Didn't know = Again. The backlog really clears, and the reviews
  sync like any other.
- **Practice:** with "Review everything", cards that aren't due (studied ones, and never-studied
  ones) are practice only. No event is written, so their schedule is unchanged.
- **Undo:** removes the last answer through the same `remove()` path as study, which writes a
  sync tombstone. FSRS state is always re-derived from the log.

**Input:**
- Tap or Space reveals the answer.
- Keys 1/2, the two buttons, or a horizontal swipe answer.
- The swipe tracks 1:1 and commits on distance (more than 32% of the card width) or a flick
  (over 0.5 px/ms). It flies out at the release speed, or snaps back.
- Answers are queued, so fast taps are never dropped.
- Reduced motion fades instead of flying. Motion off is instant.
