# Onboarding and quick catch-up

## First-run onboarding

**When it shows:** on a device with no `flipwise.onboarded.v1` flag **and** no real decks.
Real decks means any imported, synced or starter card; the built-in demo decks never count.
The decision is made once, when local storage loads, so adding decks halfway through doesn't
yank the flow away. It can be replayed from Settings → About → "Show welcome again".

**Steps:**
1. **Welcome**
2. **Sign in**
   - Uses the existing account controller.
   - "Continue offline" appears only when Firebase isn't configured or the device is offline,
     so the flow never dead-ends.
   - Once signed in, the step waits for the first sync. If the cloud already had decks, it
     skips to done; otherwise it goes to step 3.
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
No app-side test hook exists.

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
