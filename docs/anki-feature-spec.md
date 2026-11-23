# Flipwise — Anki-Informed Feature Specification (Stage 1: Desktop PWA)

**Audience:** Joseph (AAU Klagenfurt student) and his co-developer.  
**Design anchor:** Built first for Joseph's **real active Anki deck** (`Semester 1.apkg`) and the colleague's course deck format (`decks/intro-to-robotics.flipwise.json`), before generic Anki features.  
**Scope:** Stage 1 desktop-first (macOS & Windows), offline-first pure PWA. Research and architecture spec only.

---

## 1. Goals and Non-Goals

### Ground Truth: Joseph's Real Anki Setup (`Semester 1.apkg`)
- **Scale & hierarchy:** 2,568 notes (1 card/note) in a 3-level tree `Semester 1::<Course>::<Lecture Note Title>` where parent decks are empty containers and each leaf deck is one lecture: **Analysis 1** (696), **Intro to Robotics** (904), **Physics 1** (756), **Programming 1** (212).
- **Scheduling & quotas:** FSRS enabled, desired retention `0.90`. Per-course new cards/day (**Physics 18, Robotics 11, Analysis 6, Programming 5**) bounded by a **global daily cap of 40**.
- **Priority via ascending position:** New cards are studied in ascending `position` order, encoded by Joseph's generator as `core = lectureIndex * 1000 + n` and `coverage = 500000 + lectureIndex * 1000 + n`, ensuring all `core` cards arrive in lecture order before `coverage`.
- **Card shape & content:** One note type (`Front`, `Back`, `Source`; back renders `FrontSide + <hr> + Back + Source`). `Source` holds a clickable `obsidian://` deep link to the exact lecture note and section. Math uses inline MathJax `\( ... \)`; HTML is limited to `<b>`, `<a>`, `<code>`, `<br>`; typography is 19px, left-aligned, dark/night mode. Cloze exists in Anki but is unused; zero image occlusion; zero media.
- **Tags:** 8 flat tags — tier (`core`, `coverage`), type (`definition`, `rule`, `method`, `fact`, `explain`), and optional `slide-corrected`.
- **Re-import workflow:** Cards are generated from text files with **stable GUIDs** and repeatedly re-imported into Anki with scheduling progress preserved. Live collection currently syncs via AnkiWeb.

### Goals
1. **Drop-in replacement for `Semester 1.apkg` daily study:** Lossless import of notes, 3-level deck tree, tags, stable GUIDs, new-card `position` values, and `revlog`/FSRS state—plus **idempotent GUID upsert on re-import** so text-file edits (`slide-corrected`, new lectures) update cards without wiping study history.
2. **First-class `.flipwise.json` compatibility:** Preserve the colleague's existing format (`subject`, `exam`, ordered `sections` like `L01`–`L10`/`EXAM`, `markdown+katex`, `examStyle`, `points`) in the same unified deck tree.
3. **Exact FSRS + quota fidelity:** [FSRS](https://github.com/open-spaced-repetition/fsrs4anki/wiki) via [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs) with per-course new caps + global daily cap and ascending-position new-card ordering across leaf decks.
4. **Fast, offline-first desktop PWA:** Built on the chosen stack (`README.md`: React 18 + TypeScript, Vite, Tailwind CSS, Zustand, Dexie/IndexedDB, `ts-fsrs`, Markdown + KaTeX, JSZip, `sql.js`, `fzstd`, PapaParse). Zero backend in v1; one-click backup/restore.

### Decisions Reconciled with `README.md`
- **4 rating buttons (`Again`, `Hard`, `Good`, `Easy`) instead of 3:** The mockup sketched 3 buttons, but FSRS and Anki natively expect 4 grades ([Anki Manual: Studying](https://docs.ankiweb.net/studying.html), [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs)). Keeping all 4 avoids skewing FSRS difficulty/stability on easy definitions.
- **Pure PWA first; Tauri later:** Stage 1 ships as an installable desktop PWA (macOS/Windows); storage and file I/O stay behind interfaces so a future Tauri shell drops in cleanly.
- **FSRS-only (cut SM-2):** Joseph already runs FSRS at `0.90`; dropping optional SM-2 halves scheduler complexity.

### Non-Goals (Deliberate Cuts)
- **Add-on ecosystem / plugin API:** High security and maintenance cost for a two-dev student app.
- **Cloze, image occlusion, and media blobs in v1:** Unused in Joseph's 2,568-note pack; domain model stays ready (`ord`, `NoteType`), while implementation drops to v1.5/later.
- **AnkiMobile / AnkiDroid-only features & phone-first UX:** Desktop study first; phone layout comes later.
- **Shared decks marketplace / multiplayer / video media / arbitrary JS in Anki templates:** Out of scope or XSS-unsafe in a web origin.
- **Anki desktop admin chrome:** Multi-profile switcher, raw SQLite browser, preset inheritance trees.

---

## 2. Domain Model

### 2.1 How a Student Actually Studies
1. **Study Day & Rollover:** Students study past midnight. A study day rolls over at a configurable local hour (default `04:00` local time, matching [Anki Preferences](https://docs.ankiweb.net/preferences.html)). Daily caps and buried cards reset at rollover, not UTC midnight.
2. **Hierarchical Daily Queue & Quotas:** Opening `Semester 1` (or a course like `Semester 1::Physics 1`) aggregates its leaf lecture decks. Three buckets appear: **Learning/Relearning** (intra-day short steps, uncapped, highest priority, plus a 20-min learn-ahead window if idle), **Due Review** (`dueDay <= today`, capped by `reviewsPerDay`), and **New** (never reviewed). A new card is eligible only if **every ancestor deck's remaining new cap AND the global daily cap (40) are > 0**—so Physics introduces up to 18, Robotics 11, Analysis 6, Programming 5, never exceeding 40 total.
3. **Priority-Ordered New Cards:** Within each course's leaf decks, new cards are drawn in **ascending `queuePosition`**. Because Joseph encodes `core` as `lectureIndex*1000+n` and `coverage` as `500000+...`, studying `Semester 1::Physics 1` automatically teaches all `core` cards lecture-by-lecture before touching `coverage`.
4. **First-Time Learning & Lapses:** Under FSRS, learning/relearning steps **must stay < 1 day** (e.g., `1m`, `10m`) so FSRS governs multi-day intervals ([Anki Manual: Deck Options — FSRS](https://docs.ankiweb.net/deck-options.html)). Rating `Again` on a `Review` card increments `lapses`, drops FSRS stability, and enters `Relearning`. Hitting `leechThreshold` (default 8) tags the note `leech` and optionally suspends the card ([Anki Manual: Leeches](https://docs.ankiweb.net/leeches.html)).
5. **Source Deep-Linking & Re-Import Loop:** When a card is unclear or has a slide typo, Joseph clicks `Source` (`obsidian://...`) to jump straight to that lecture section in Obsidian, fixes his source text, regenerates `Semester 1.apkg` with the same **stable GUIDs**, and re-imports. Existing cards update their `Front`/`Back`/`Source`/tags (e.g., `slide-corrected`) while keeping their exact FSRS state and `ReviewLog`.
6. **Burying, Suspending & Exam Cramming:** Burying hides a card until next rollover; suspending removes it indefinitely (mutually exclusive). Before exams, a **Filtered Deck** temporarily pulls matching cards (e.g., `deck:"Semester 1::Intro to Robotics" tag:core`, `tag:definition`, or `exam:true`) with a `reschedule` toggle without changing `homeDeckId` ([Anki Manual: Filtered Decks](https://docs.ankiweb.net/filtered-decks.html)).

### 2.2 Core Entities and Relationships
```text
GlobalStudyConfig (globalNewPerDay=40, rolloverHour=4, learnAheadMin=20, theme='dark')
Deck (3+ level tree via parentId; empty parents hold course caps; leaves hold Cards)
  ├── 0..* Card (homeDeckId; optional filteredDeckId; unique (noteId, ord))
  │          ├── N..1 Note (stable unique guid, fields {Front, Back, Source}, tags, courseMeta)
  │          │          └── N..1 NoteType (fields + FrontSide/Back/Source template; ready for v1.5 cloze)
  │          ├── 1    SchedulingState (discriminated union: new | learning | review | relearning)
  │          ├── 1    CardStatus (discriminated union: active | suspended | buried)
  │          └── 0..* ReviewLog (append-only review history; deduped by (cardId, reviewedAtMs) on re-import)
```
- **Unified hierarchy for both formats:** `Semester 1::Intro to Robotics::L01 Introduction` (Anki `.apkg`) and `subject` → `sections` (`.flipwise.json`) both store as parent/child `Deck`s with `order` and optional `courseMeta`.
- **Note vs. Card kept clean:** v1 creates 1 card per note (`ord = 0`), matching both `Semester 1.apkg` and `.flipwise.json`, while preserving `(noteId, ord)` so v1.5 cloze/reversed requires zero database migration.

### 2.3 Invariants (Making Illegal States Impossible)
1. **Unique stable `guid` per Note:** Every `Note` has a non-empty unique `guid` (from Anki `notes.guid`, `.flipwise.json` `subject.id + ':' + card.id`, or generated UUID). Re-imports upsert strictly by `guid`.
2. **Re-import never regresses progress:** Upserting an existing `guid` updates content/tags/homeDeck (and `queuePosition` only while `scheduling.kind === 'new'`). An incoming `new` card can never overwrite a local `learning`/`review`/`relearning` card.
3. **No buried + suspended cards:** `CardStatus` is a discriminated union (`active` | `suspended` | `buried`); setting one replaces the variant ([Anki Manual: Studying](https://docs.ankiweb.net/studying.html)).
4. **State-locked scheduling fields:** `new` carries `queuePosition` and **no** FSRS memory/`lastReviewAtMs`; `review` requires `dueDay`, `stability > 0`, `difficulty`, `reps`, `lapses`, `lastReviewAtMs`; `learning`/`relearning` require `stepIndex` and `dueAtMs`.
5. **Immutable home deck during cramming:** `homeDeckId` is never overwritten by a filtered deck; `filteredDeckId` points only to a `kind: 'filtered'` deck.
6. **Append-only review history:** `ReviewLog` rows are never edited in place; session undo atomically removes only the undone log alongside restoring the exact pre-review `Card` snapshot.

---

## 3. Features by Tier

*PWA fit: `easy` (standard Web APIs), `doable` (needs careful browser engineering/workers), `hard` (hits Web platform limits—see §4).*

### Tier 1 — v1 Must-Haves (Built for `Semester 1.apkg` + `.flipwise.json`)
- **FSRS scheduling engine (`ts-fsrs`):** `New`/`Learning`/`Review`/`Relearning`, desired retention (`0.90`), <1d learning/relearning steps, fuzzing, max interval — matches Joseph's active Anki setup — `easy` (pure TS).
- **4-button study screen + interval preview:** `Front` reveal → `FrontSide + <hr> + Back + Source`, live next-interval labels on `Again`/`Hard`/`Good`/`Easy`, 19px left-aligned dark/night-mode default — mirrors Joseph's daily study ergonomics — `easy` (React + `ts-fsrs`).
- **Study keyboard shortcuts & transactional Undo:** `Space`/`Enter` reveal, `1–4` rate, `Z` undo, `B` bury, `@` suspend, `E` edit, flags; undo atomically restores `Card` snapshot and removes session `ReviewLog` — zero-friction 200-card sessions — `easy` (Dexie tx + keydown handler).
- **3-level deck tree with per-course + global daily new caps:** Empty parent containers (`Semester 1`, `<Course>`) + leaf lecture decks, per-course caps (18/11/6/5) bounded by global cap (40) and daily review limits — exact match for Joseph's 4-course workload — `easy` (tree cap aggregation in TS).
- **Ascending `queuePosition` new-card ordering:** Preserves Anki's `cards.due` position on New cards and selects lowest `queuePosition` across child lecture decks — keeps `core` (`lecture*1000+n`) strictly ahead of `coverage` (`500000+...`) — `easy` (indexed sort in Dexie).
- **Lossless `.apkg` / `.colpkg` import with GUID upsert:** Parses legacy (`anki2`/`anki21`) and modern zstd (`collection.anki21b`) SQLite packages, imports notes, deck tree, tags, `guid`, `position`, FSRS/SM-2 state, and `revlog`, and **upserts by `guid` without losing scheduling history** — #1 migration & ongoing re-import workflow — `doable` (`JSZip` + `fzstd` + `sql.js` WASM in Web Worker).
- **Clickable `obsidian://` `Source` links:** Renders `Source` field below answer with `obsidian://` explicitly allowlisted in DOMPurify while blocking unsafe schemes (`javascript:`, `data:`, `file:`) — lets Joseph jump directly to lecture notes — `doable` (browser custom-protocol confirmation prompt; see §4).
- **MathJax `\( \)` / `\[ \]` → KaTeX + minimal HTML & Markdown:** Renders inline/display MathJax delimiters via KaTeX, DOMPurify-sanitized Anki HTML (`<b>`, `<a>`, `<code>`, `<br>`), plus native `markdown+katex` for `.flipwise.json` — covers 100% of Joseph's current cards and robotics JSON — `easy` (KaTeX + DOMPurify + Markdown parser).
- **`.flipwise.json` native import & export:** Round-trips `decks/intro-to-robotics.flipwise.json` preserving `subject`, `exam`, `sections`, `examStyle`, `points`, and deterministic GUIDs (`subject.id:card.id`) — honors colleague's existing deck format — `easy` (JSON schema).
- **Burying, suspending, and leech detection:** Manual bury (resets at rollover), manual suspend, configurable leech threshold (`leech` tag + optional auto-suspend) — keeps problem cards from stalling queues — `easy` (pure domain logic).
- **Flat tags, flags, and basic search syntax:** Filter by `deck:`, `tag:` (`core`, `coverage`, `definition`, `rule`, `method`, `fact`, `explain`, `slide-corrected`), `is:due|new|learn|suspended|buried|leech`, `flag:`, `exam:true`, `-` negation, `OR` — isolates exact exam topics — `easy` (Dexie indices + parser).
- **Filtered / Custom Study deck (Exam Cram):** One-click presets ("`core` only", "Course/Lecture cram", "`examStyle` only", "Lapsed recently") + search query, with `reschedule` toggle — critical for AAU written exams — `easy` (query over IndexedDB).
- **CSV / TSV import & export:** PapaParse column mapping, tag assignment, optional GUID/first-field upsert — easy inspection and tabular authoring — `easy` (PapaParse).
- **Student-useful statistics:** Daily reviews & time, 7/30-day due forecast, true retention (pass % on reviews), maturity breakdown (`New`/`Learn`/`Young`/`Mature`/`Suspended`), and streak heatmap — tracks exam readiness across all 4 courses — `easy` (aggregation over `ReviewLog` + `Card`).
- **Offline-first PWA & local data safety:** Service Worker precaching (`vite-plugin-pwa`), `navigator.storage.persist()`, Safari-tab install warning, multi-tab Web Lock, and one-click full backup/restore `.zip` — protects semester-long `revlog` in browser storage — `hard` (see §4).

### Tier 2 — v1.5 (Deferred Because Unused in Current Pack, High Value Next)
- **Cloze deletions (`{{c1::...::hint}}`) & Basic+Reversed:** Multi-card generation per note + automatic sibling burying — unused in `Semester 1.apkg`, cleanly slots into existing `(noteId, ord)` model — `easy`.
- **Media import & audio playback:** Extract legacy JSON `media` and modern zstd protobuf `MediaEntries` + numbered media blobs into content-addressed IndexedDB store (`MediaAsset`), render `<img>` & `[sound:...]` — zero media in current pack, saves significant v1 scope — `doable` (Web Worker + Blob URLs).
- **Two-developer sync:** Delta sync of append-only `ReviewLog` + GUID-keyed `Note` updates across Mac/Windows browsers — bridges Joseph's devices once leaving AnkiWeb — `doable` (background sync is `hard` on Safari).
- **In-browser FSRS parameter optimizer:** Train custom weights from local `ReviewLog` via `@open-spaced-repetition/binding` WASM in a Web Worker — useful after ~400+ reviews — `doable`.
- **Auto-backup to local folder:** Periodic backup writes via File System Access API (Chrome/Edge) with reminder fallback on Safari/Firefox — reduces eviction anxiety — `hard` (Chromium-only).
- **Bulk browser editing & card info inspector:** Multi-select tag/deck/suspend edits and per-card stability/difficulty/retrievability timeline — useful for deck curation — `easy`.

### Tier 3 — Later (Beyond Stage 1)
- **Image Occlusion (SVG masks + Anki 23.10+ IO import):** Unused in Joseph's current decks; nontrivial editor & parser — `doable`.
- **Tauri 2 desktop wrapper:** Native SQLite/file backups, frictionless `obsidian://` launch, `.apkg` OS file association, auto-updater (`README.md` phase 5) — `n/a` (native shell).
- **Mobile / phone responsive PWA:** Touch gestures and phone layout after desktop study is rock solid — `doable`.
- **Custom HTML/CSS card template editor:** Full Anki Mustache template authoring beyond `Front`/`Back`/`Source` — `easy`.
- **AI card generation from lecture PDFs & FSRS workload simulator:** Separate authoring/planning tools (`README.md` phase 6) — `doable`.
- **AnkiWeb protocol sync:** Undocumented/ToS-sensitive; bridge transition via `.apkg`/`.colpkg` GUID upsert + `revlog` merge instead — `hard`.

---

## 4. Hard on a PWA (and Mitigations)

| Platform Constraint | Why It Hurts Flipwise | Concrete Mitigation |
| --- | --- | --- |
| **IndexedDB eviction & Safari 7-day ITP** | WebKit wipes script-writable storage after 7 days without interaction in regular Safari tabs; Chromium can evict best-effort storage under disk pressure ([MDN StorageManager](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist), [WebKit Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)). | Request `navigator.storage.persist()` on first write; warn when unpersisted or in a Safari browser tab to **install the PWA** (exempts Safari Web Apps from 7-day wipe); show a "days since last backup" badge + one-click `.flipwise-backup.zip` export in v1. |
| **Custom URI deep links (`obsidian://`)** | DOMPurify strips non-`http(s)` protocols by default; browsers show an external-app confirmation prompt (and macOS/Windows PWAs sometimes lose focus or block links without user gesture). | Explicitly allowlist `^obsidian:\/\/` alongside `https?:` in DOMPurify while strictly forbidding `javascript:`, `data:`, `file:`; render `Source` as a direct user-clicked `<a href="obsidian://...">` (never `window.open` async) so browser gesture checks pass and users can tick "Always allow" once. |
| **Multi-tab IndexedDB concurrency** | Two open tabs can race on `ReviewLog` writes, daily cap counters (40/day), and undo state. | Acquire a `navigator.locks` lock (`flipwise-session`) for study writes and broadcast updates via `BroadcastChannel`; warn if a second study tab opens ([MDN Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)). |
| **`.apkg` WASM parsing on main thread** | Unzipping + zstd decompression (`fzstd`) + `sql.js` queries on the UI thread stalls rendering (especially on larger `.colpkg` files or future media packs). | Run `JSZip` + `fzstd` + `sql.js` inside a **dedicated Web Worker**; report progress stages and check `navigator.storage.estimate()` before committing writes. (Joseph's 2,568 text-only notes will import in ~1–2s.) |
| **OS file associations (`.apkg`, `.flipwise.json`)** | Double-clicking a regenerated `Semester 1.apkg` in Finder/Explorer doesn't open Safari/Firefox PWAs; File Handling API (`launchQueue`) is Chromium-only. | Make drag-and-drop onto any screen + file picker fast and primary; progressively add `file_handlers` in `manifest.webmanifest` for installed Chrome/Edge PWAs. |
| **Browser-reserved shortcuts & background sync** | Browsers hijack `Cmd/Ctrl+W/T/N` and `Ctrl+1–4`; WebKit lacks Background Sync API. | Bind single-key study hotkeys (`Space`, `1–4`, `Z`, `B`, `@`, `E`) outside inputs only; keep v1 strictly local and trigger future v1.5 sync on focus/`online`/`visibilitychange`. |

---

## 5. Core Types and Modules Sketch

*Signatures only — no implementation. Illegal states fail at compile time and `ts-fsrs` stays behind `Scheduler`.*

```ts
// --- Branded IDs & Primitives ---
export type DeckId = string & { readonly __brand: 'DeckId' };
export type NoteTypeId = string & { readonly __brand: 'NoteTypeId' };
export type NoteId = string & { readonly __brand: 'NoteId' };
export type NoteGuid = string & { readonly __brand: 'NoteGuid' }; // Stable cross-import key (Anki notes.guid)
export type CardId = string & { readonly __brand: 'CardId' };
export type ReviewLogId = string & { readonly __brand: 'ReviewLogId' };
export type EpochMs = number;
export type StudyDay = number; // Rollover-adjusted local calendar day since Unix epoch

export type Rating = 1 | 2 | 3 | 4; // 1=Again, 2=Hard, 3=Good, 4=Easy
export type FlagColor = 0 | 1 | 2 | 3 | 4; // 0=None, 1=Red, 2=Orange, 3=Green, 4=Blue

// --- Scheduling & Status (Illegal States Unrepresentable) ---
export interface FsrsMemory {
  readonly stability: number;  // days until R drops to 90%
  readonly difficulty: number; // [1, 10]
}

export type SchedulingState =
  | { readonly kind: 'new'; readonly queuePosition: number } // Anki cards.due for New (core=lec*1000+n, cov=500000+...)
  | {
      readonly kind: 'learning';
      readonly stepIndex: number;
      readonly dueAtMs: EpochMs;
      readonly memory: FsrsMemory;
      readonly reps: number;
      readonly lastReviewAtMs: EpochMs;
    }
  | {
      readonly kind: 'review';
      readonly dueDay: StudyDay;
      readonly intervalDays: number;
      readonly memory: FsrsMemory;
      readonly reps: number;
      readonly lapses: number;
      readonly lastReviewAtMs: EpochMs;
    }
  | {
      readonly kind: 'relearning';
      readonly stepIndex: number;
      readonly dueAtMs: EpochMs;
      readonly memory: FsrsMemory;
      readonly reps: number;
      readonly lapses: number;
      readonly lastReviewAtMs: EpochMs;
    };

export type CardStatus =
  | { readonly kind: 'active' }
  | { readonly kind: 'suspended'; readonly reason: 'manual' | 'leech' }
  | { readonly kind: 'buried'; readonly untilDay: StudyDay; readonly source: 'manual' | 'sibling' };

// --- Core Domain Entities ---
export interface GlobalStudyConfig {
  readonly globalNewPerDay: number;     // e.g. 40
  readonly globalReviewsPerDay: number; // e.g. 9999
  readonly rolloverHour: number;        // 0..23 local time, default 4
  readonly learnAheadMin: number;       // default 20
  readonly theme: 'dark' | 'light' | 'system';
}

export interface NoteType {
  readonly id: NoteTypeId;
  readonly name: string;
  readonly kind: 'basic' | 'basic-source' | 'anki-imported'; // v1.5 adds 'basic-reversed' | 'cloze'
  readonly contentFormat: 'markdown+katex' | 'anki-html';
  readonly fields: readonly string[]; // e.g. ['Front', 'Back', 'Source']
  readonly templates: readonly { readonly ord: number; readonly name: string; readonly front: string; readonly back: string }[];
  readonly css?: string;
}

export interface Note {
  readonly id: NoteId;
  readonly guid: NoteGuid; // Unique index; upsert key for re-imports
  readonly noteTypeId: NoteTypeId;
  readonly fields: Readonly<Record<string, string>>; // e.g. { Front, Back, Source }
  readonly tags: readonly string[];                  // e.g. ['core', 'definition', 'slide-corrected']
  readonly courseMeta?: { readonly examStyle?: boolean; readonly points?: number; readonly sourceCardId?: string };
  readonly createdAtMs: EpochMs;
  readonly updatedAtMs: EpochMs;
}

export interface Card {
  readonly id: CardId;
  readonly noteId: NoteId;
  readonly ord: number; // 0 in v1; template/cloze index in v1.5+
  readonly homeDeckId: DeckId;
  readonly filteredDeckId: DeckId | null;
  readonly status: CardStatus;
  readonly scheduling: SchedulingState;
  readonly flag: FlagColor;
  readonly createdAtMs: EpochMs;
  readonly updatedAtMs: EpochMs;
}

export interface DeckOptions {
  readonly desiredRetention: number;              // default 0.90
  readonly learningStepsMin: readonly number[];   // each < 1440 (FSRS rule)
  readonly relearningStepsMin: readonly number[]; // each < 1440 (FSRS rule)
  readonly maxIntervalDays: number;               // default 36500
  readonly enableFuzz: boolean;
  readonly newPerDay: number | null;              // null = inherit parent/global; course deck sets 18/11/6/5
  readonly reviewsPerDay: number | null;          // null = inherit parent/global
  readonly newCardOrder: 'position-asc' | 'random'; // default 'position-asc'
  readonly leechThreshold: number;                // default 8
  readonly leechAction: 'suspend' | 'tag-only';
  readonly fsrsWeights?: readonly number[];       // default ts-fsrs weights if omitted
}

export type Deck =
  | {
      readonly kind: 'normal';
      readonly id: DeckId;
      readonly parentId: DeckId | null;
      readonly name: string; // segment name (e.g. 'Physics 1' or lecture title)
      readonly order: number;
      readonly options: DeckOptions;
      readonly courseMeta?: {
        readonly code?: string;
        readonly institution?: string;
        readonly term?: string;
        readonly sectionId?: string;
        readonly sourceFile?: string;
        readonly preview?: boolean;
        readonly exam?: { readonly durationMin: number; readonly totalPoints: number; readonly passPoints: number; readonly notes?: string };
      };
    }
  | {
      readonly kind: 'filtered';
      readonly id: DeckId;
      readonly name: string;
      readonly query: string;
      readonly limit: number;
      readonly reschedule: boolean;
      readonly createdAtMs: EpochMs;
    };

export interface ReviewLog {
  readonly id: ReviewLogId;
  readonly cardId: CardId;
  readonly reviewedAtMs: EpochMs; // Paired with cardId for idempotent re-import dedupe
  readonly studyDay: StudyDay;
  readonly rating: Rating;
  readonly durationMs: number;
  readonly stateBefore: SchedulingState['kind'];
  readonly intervalAfterDays: number;
  readonly memoryAfter: FsrsMemory;
  readonly wasFilteredCram: boolean; // true when reschedule=false
}

// --- Core Modules ---
export interface SchedulerPreview {
  readonly rating: Rating;
  readonly nextScheduling: SchedulingState;
  readonly nextIntervalLabel: string; // e.g. "10m", "4d", "1.2mo"
}

export interface Scheduler {
  toStudyDay(timestampMs: EpochMs, rolloverHour: number, timeZone: string): StudyDay;
  preview(card: Card, options: DeckOptions, nowMs: EpochMs, today: StudyDay): readonly SchedulerPreview[];
  schedule(card: Card, rating: Rating, options: DeckOptions, nowMs: EpochMs, today: StudyDay): {
    readonly nextScheduling: SchedulingState;
    readonly logDraft: Omit<ReviewLog, 'id' | 'durationMs' | 'wasFilteredCram'>;
    readonly triggeredLeech: boolean;
  };
  retrievability(card: Card, nowMs: EpochMs): number | null; // null if New
}

export interface UndoToken {
  readonly reviewLogId: ReviewLogId;
  readonly previousCard: Card;
  readonly addedLeechTag: boolean;
}

export interface StudySession {
  readonly deckId: DeckId;
  readonly today: StudyDay;
  counts(): Promise<{ readonly newCount: number; readonly learningCount: number; readonly dueCount: number }>;
  nextCard(nowMs: EpochMs): Promise<{ readonly card: Card; readonly note: Note; readonly previews: readonly SchedulerPreview[] } | null>;
  answer(cardId: CardId, rating: Rating, durationMs: number, nowMs: EpochMs): Promise<UndoToken>;
  undo(token: UndoToken): Promise<Card>;
  bury(cardId: CardId): Promise<void>;
  suspend(cardId: CardId): Promise<void>;
  setFlag(cardId: CardId, flag: FlagColor): Promise<void>;
}

export interface Storage {
  transaction<T>(mode: 'r' | 'rw', fn: () => Promise<T>): Promise<T>;
  getGlobalConfig(): Promise<GlobalStudyConfig>;
  getDeckTree(): Promise<readonly Deck[]>;
  getNoteByGuid(guid: NoteGuid): Promise<Note | null>;
  getCardsByQuery(query: string, today: StudyDay): Promise<readonly Card[]>;
  putEntities(batch: { decks?: readonly Deck[]; noteTypes?: readonly NoteType[]; notes?: readonly Note[]; cards?: readonly Card[]; logs?: readonly ReviewLog[] }): Promise<void>;
  deleteReviewLog(id: ReviewLogId): Promise<void>;
  exportBackupZip(): Promise<Blob>;
  importBackupZip(file: Blob): Promise<{ readonly decks: number; readonly notes: number; readonly cards: number; readonly logs: number }>;
  storageHealth(): Promise<{ readonly persisted: boolean; readonly usedBytes: number; readonly quotaBytes: number }>;
}

export interface ImportReport {
  readonly format: 'apkg' | 'colpkg' | 'flipwise-json' | 'csv';
  readonly decksCreated: number;
  readonly notesAdded: number;
  readonly notesUpdated: number;
  readonly notesUnchanged: number;
  readonly missingLocalGuids: number; // present locally in target deck tree, absent from file
  readonly logsMerged: number;
  readonly warnings: readonly { readonly code: string; readonly count: number; readonly detail: string }[];
}

export interface Importer {
  importAnkiPackage(
    file: File,
    opts: {
      readonly upsertByGuid: boolean;       // default true
      readonly mergeScheduling: 'preserve-local' | 'newer-wins' | 'import-all'; // default 'preserve-local' for generator re-imports
      readonly onProgress?: (pct: number, stage: string) => void;
    },
  ): Promise<ImportReport>;
  importFlipwiseJson(file: File, opts: { readonly upsertByGuid: boolean; readonly suspendPreviewSections: boolean }): Promise<ImportReport>;
  importCsv(file: File, opts: { readonly deckId: DeckId; readonly delimiter?: string; readonly mapping: Readonly<Record<number, string>>; readonly duplicatePolicy: 'upsert' | 'skip' | 'keep' }): Promise<ImportReport>;
}
```

---

## 6. Adversarial Review and Open Questions

### 6.1 Offline Data Safety
- **Attack:** "Safari's 7-day ITP wipe or browser cache clearing could destroy an entire semester of review logs across all 4 courses."
  - **Fixed in spec:** Persistent storage request (`navigator.storage.persist()`), Safari-tab install prompt, multi-tab Web Locks, and one-click `.flipwise-backup.zip` export are v1 must-haves.
- **Attack:** "A failed re-import of `Semester 1.apkg` halfway through 2,568 notes could leave half the deck updated and half stale."
  - **Fixed in spec:** Parse and validate the entire SQLite payload inside the Web Worker first, build the diff in memory, and apply note/card/log upserts inside atomic Dexie transactions.
- **Residual risk:** Pure browser storage still relies on the user keeping backups until v1.5 folder auto-backup or sync ships.

### 6.2 FSRS Correctness & Quota Semantics
- **Attack:** "Storing `due` as a raw UTC timestamp breaks daily queues on DST changes or 02:00 AM exam cramming."
  - **Fixed in spec:** `learning`/`relearning` use exact `dueAtMs` (`EpochMs`); multi-day `review` uses rollover-adjusted local `dueDay` (`StudyDay`, default `04:00`).
- **Attack:** "Per-course new caps (Physics 18, Robotics 11, Analysis 6, Programming 5) + global cap (40) can break if leaf lecture decks each get a default `newPerDay: 20` or if studying `Semester 1` drains 18 Physics cards before showing any Robotics."
  - **Fixed in spec:** Leaf decks inherit `newPerDay: null` by default so caps live on course decks + `GlobalStudyConfig.globalNewPerDay`; queue selection enforces `min(ancestorCaps..., globalRemaining)`. (Interleaving policy across courses at the root deck is flagged as Open Question #1.)
- **Attack:** "Anki's `cards.due` stores *position* for `New` cards, *Unix seconds* for `Learning`, and *days since collection creation (`col.crt`)* for `Review`—treating `cards.due` uniformly corrupts every imported card."
  - **Fixed in spec:** Importer branches strictly on Anki `cards.type`/`cards.queue` (`0` = `queuePosition`, `1`/`3` = `dueAtMs`, `2` = `col.crt` + `due` days converted to `StudyDay`).
- **Attack:** "3 buttons in `README.md` vs 4 buttons in FSRS; `ts-fsrs` API churn (v5 → v6)."
  - **Fixed in spec:** Standardized on 4 FSRS ratings (`Again`/`Hard`/`Good`/`Easy`) and encapsulated `ts-fsrs` strictly behind `Scheduler` with Flipwise-owned `SchedulingState`.

### 6.3 Lossless `.apkg` Import, GUID Upsert & `obsidian://` Links
- **Attack:** "Joseph re-imports a regenerated `Semester 1.apkg` (which has fresh `New` cards with no `revlog`) to apply `slide-corrected` edits—naive upsert wipes his FSRS progress!"
  - **Fixed in spec:** Default `mergeScheduling: 'preserve-local'` updates only `Note.fields`, `Note.tags`, `Card.homeDeckId`, and `queuePosition` (only if local card is still `New`), leaving existing `Learning`/`Review`/`Relearning` states and `ReviewLog` untouched. When importing an AnkiWeb-synced snapshot (`'newer-wins'`), `ReviewLog` dedupes on `(cardId, reviewedAtMs)` and scheduling advances only if incoming `lastReviewAtMs > local.lastReviewAtMs`.
- **Attack:** "Modern Anki exports (`23.10+`) compress `collection.anki21b` with zstd (`0x28B52FFD`) and may include unused cloze templates or future media—`sql.js` alone will crash."
  - **Fixed in spec:** Worker detects zstd magic bytes, decompresses `collection.anki21b` with `fzstd` (falling back to `collection.anki21`/`collection.anki2`), parses Anki FSRS state from `cards.data` JSON (`s`, `d`) or replays `revlog` for SM-2 cards, and emits explicit `ImportReport.warnings` if any media files or cloze/IO notes are encountered in v1 (so nothing fails silently).
- **Attack:** "Allowing custom URI schemes in `Source` opens XSS if an imported deck contains `javascript:` links."
  - **Fixed in spec:** DOMPurify allowlists strictly `https?:` and `obsidian://` and strips `<script>`, inline event handlers, and all other schemes.

### 6.4 Open Questions for Joseph & Co-Developer
1. **Root-deck (`Semester 1`) course ordering:** When studying at the top `Semester 1` deck (cap 40 across 4 courses), should new cards pull **one course at a time** (Physics → Robotics → Analysis → Programming, each in ascending `position`), or **round-robin / interleaved** across courses while respecting each course's cap and ascending `position`?
2. **Deleted notes on GUID re-import:** If Joseph removes a card from his source text files and re-imports `Semester 1.apkg`, should Flipwise **keep** the old card (and only report `missingLocalGuids`), or offer a checkbox to **suspend** missing cards? *(Recommendation: keep by default, surface count + one-click "Review/Suspend missing".)*
3. **3 vs. 4 rating buttons in UI:** Confirm adopting 4 buttons (`Again`/`Hard`/`Good`/`Easy`) to align with FSRS and Joseph's Anki habit, superseding the 3-button mockup in `README.md`.
4. **AnkiWeb coexistence during transition:** While Joseph still syncs with AnkiWeb on other devices, should Flipwise support **exporting `.apkg` / `revlog` back** or only one-way migration once v1.5 sync replaces AnkiWeb?
5. **Preview sections in `.flipwise.json`:** For `preview: true` sections (`L08`–`L10` in Robotics), import them **suspended** by default or active with a `preview` tag?

---

## 7. Sources

- **Anki Manual (Official):**
  - Studying, burying, suspending, undo, shortcuts: https://docs.ankiweb.net/studying.html
  - Deck options, daily limits, FSRS, learning steps: https://docs.ankiweb.net/deck-options.html
  - Leeches: https://docs.ankiweb.net/leeches.html
  - Filtered decks & cramming: https://docs.ankiweb.net/filtered-decks.html
  - Searching syntax: https://docs.ankiweb.net/searching.html
  - Editing, fields, cloze, Image Occlusion: https://docs.ankiweb.net/editing.html
  - Card templates & `FrontSide`: https://docs.ankiweb.net/templates/intro.html
  - Importing (`.apkg`, `.colpkg`, GUID matching, CSV): https://docs.ankiweb.net/importing/intro.html
  - Exporting: https://docs.ankiweb.net/exporting.html
  - Statistics & card info: https://docs.ankiweb.net/stats.html
  - Preferences (next-day rollover): https://docs.ankiweb.net/preferences.html
- **FSRS & `ts-fsrs`:**
  - `ts-fsrs` TypeScript library & API: https://github.com/open-spaced-repetition/ts-fsrs
  - FSRS algorithm wiki & FAQ: https://github.com/open-spaced-repetition/fsrs4anki/wiki
- **Anki Package & Database Format:**
  - Anki official backend (`rslib`, `import_export.proto` / `MediaEntries`, `anki21b` zstd): https://github.com/ankitects/anki
  - AnkiDroid database schema reference (`col`, `notes.guid`, `cards.due`/`type`/`queue`, `revlog`): https://github.com/ankidroid/Anki-Android/wiki/Database-Structure
- **PWA Storage & Platform Specs:**
  - MDN `StorageManager.persist()` & eviction: https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
  - WebKit Storage Policy (7-day cap & PWA exemption): https://webkit.org/blog/14403/updates-to-storage-policy/
  - MDN Web Locks API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
- **Repository Context:**
  - `README.md`
  - `decks/intro-to-robotics.flipwise.json`
