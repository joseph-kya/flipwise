# Flipwise — Anki-Informed Feature Specification (Stage 1: Desktop PWA)

**Audience:** Joseph (AAU Klagenfurt student migrating active Anki decks and studying course decks like `decks/intro-to-robotics.flipwise.json`) and his co-developer.  
**Scope:** Stage 1 desktop-first (macOS & Windows), offline-first pure PWA. Research and architecture spec only; respects existing decisions in `README.md` and `decks/intro-to-robotics.flipwise.json`.

---

## 1. Goals and Non-Goals

### Goals
1. **Replace daily Anki desktop studying without losing progress:** Import Joseph's existing `.apkg`/`.colpkg` decks (including modern Anki 23.10+ `collection.anki21b` exports) with cards, cloze deletions, media, tags, and scheduling/review history intact.
2. **First-class university course workflow:** Preserve the colleague's `.flipwise.json` format (`subject`, `exam`, ordered `sections` like `L01`–`L10`/`EXAM`, `markdown+katex`, `examStyle`, `points`) so lecture decks work seamlessly alongside imported Anki decks.
3. **Modern FSRS scheduling out of the box:** Use [FSRS](https://github.com/open-spaced-repetition/fsrs4anki/wiki) via [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs) as the single scheduler—fewer reviews for the same retention, with clean short-term learning steps and configurable desired retention.
4. **Fast, offline-first desktop PWA:** Built on the chosen stack (React 18 + TypeScript, Vite, Tailwind CSS, Zustand, Dexie/IndexedDB, `ts-fsrs`, Markdown + KaTeX, JSZip, `sql.js`, `fzstd`, PapaParse). Zero account required in v1; all data lives locally with one-click backup/export.

### Decisions Reconciled with `README.md`
- **4 rating buttons (`Again`, `Hard`, `Good`, `Easy`) instead of 3:** The early mockup/README sketched 3 buttons (`Again`/`Hard`/`Good`), but FSRS and Anki's study flow natively depend on 4 grades ([Anki Manual: Studying](https://docs.ankiweb.net/studying.html), [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs)). Keeping all 4 prevents distorting FSRS difficulty/stability estimates on trivial cards; keyboard `1–4` keeps it frictionless.
- **Pure PWA first; Tauri later:** Stage 1 ships as an installable desktop PWA (Chrome/Edge/Safari on macOS & Windows). Keep storage and file I/O behind clean interfaces so a future Tauri wrapper can swap in native filesystem access without rewriting core logic.
- **FSRS-only (cut SM-2):** Supporting two schedulers doubles test surface and complicates migration; FSRS strictly dominates SM-2 for university study.

### Non-Goals (Deliberate Cuts)
- **Add-on ecosystem / plugin API:** High security and maintenance cost for a two-dev student app.
- **AnkiMobile / AnkiDroid-only features & phone-first UX:** Desktop study first; mobile layout comes later.
- **Shared decks marketplace / multiplayer / leaderboards:** Solo study + private dev-to-dev deck sharing via files/git.
- **Video media playback/storage:** Bloats IndexedDB quotas and adds codec headaches; images and audio only.
- **Arbitrary JavaScript execution in imported Anki card templates:** Major XSS vector in a web origin; render sanitized HTML + CSS only (see §6.3).
- **Anki desktop chrome that does not serve learning:** Multi-profile login window, raw SQLite debugger, Check Media/DB admin dialogs, custom deck-option preset inheritance trees.

---

## 2. Domain Model

### 2.1 How a Student Actually Studies
1. **The Study Day & Rollover:** Students study past midnight. A "study day" rolls over at a configurable local hour (default `04:00` local time, matching [Anki Preferences](https://docs.ankiweb.net/preferences.html)). Daily caps and buried cards reset at rollover, not UTC midnight.
2. **Building the Daily Queue:** Opening a deck (or parent subject deck, which aggregates its subdecks/sections) shows three counts: **New** (never reviewed, capped by `newPerDay`), **Learning/Relearning** (intra-day short steps, uncapped—must be finished), and **Due Review** (long-term cards whose `dueDay <= today`, capped by `reviewsPerDay`). Cards due right now in Learning/Relearning take priority (plus cards within a short learn-ahead window, default 20 min, if nothing else is due).
3. **First-Time Learning (`New` → `Learning` → `Review`):** A new card is rated `Again` / `Hard` / `Good` / `Easy`. Under FSRS, all learning/relearning steps **must stay under 1 day** (e.g., `1m`, `10m`) so FSRS—not fixed steps—governs multi-day intervals ([Anki Manual: Deck Options — FSRS](https://docs.ankiweb.net/deck-options.html)). `Easy` graduates immediately to `Review`.
4. **A Lapse (`Review` → `Relearning`):** Rating `Again` on a `Review` card increments `lapses`, reduces FSRS stability, and moves the card into `Relearning` (e.g., `10m` step). Once `lapses` hits `leechThreshold` (default 8), the note is tagged `leech` and the card is either suspended or left active per deck option ([Anki Manual: Leeches](https://docs.ankiweb.net/leeches.html)).
5. **Sibling Burying & Suspending:** A note with multiple cards (e.g., `c1` and `c2` clozes, or forward/reverse) tests closely related facts. Reviewing one optionally **buries** its sibling cards until the next rollover so recall isn't artificially primed ([Anki Manual: Studying](https://docs.ankiweb.net/studying.html)). **Suspending** removes a card indefinitely (e.g., dropped lecture topic or leech) until manually unsuspended.
6. **Exam Cramming (Filtered Study):** Two days before the Robotics exam, Joseph needs to drill all `examStyle` cards or `L05`–`L07` regardless of due dates. A **Filtered Deck** temporarily pulls matching cards by query without changing their home deck. Reviewing in a filtered deck can either update FSRS schedules (`reschedule: true`) or run in pure cram mode (`reschedule: false`), and emptying it returns all cards home ([Anki Manual: Filtered Decks](https://docs.ankiweb.net/filtered-decks.html)).

### 2.2 Core Entities and Relationships
```text
Deck (tree via parentId; holds DeckOptions + optional Course/Section metadata)
  ├── 1..* Card (homeDeckId; optional filteredDeckId when cramming)
  │          ├── N..1 Note (owning content, tags, media refs)
  │          │          └── N..1 NoteType (kind: basic | cloze | anki-template; fields + templates)
  │          ├── 1    SchedulingState (discriminated union: new | learning | review | relearning)
  │          ├── 1    CardStatus (discriminated union: active | suspended | buried)
  │          └── 0..* ReviewLog (append-only review history; drives stats, undo, future FSRS opt)
MediaAsset (content-addressed blob store in IndexedDB, referenced by Note fields)
```
- **Note vs. Card separation:** A `Note` stores knowledge once (fields + tags). A `NoteType` defines how fields generate one or more `Card`s (Basic = 1 card, Basic+Reversed = 2, Cloze = 1 per distinct `cN` index). Flat `.flipwise.json` cards map cleanly to a 1-field-pair `Basic` note with `courseMeta` (`examStyle`, `points`) preserved on the Note/Card.
- **Decks & Sections:** Flipwise's `Subject → Section` (`intro-to-robotics` → `L01`..`L10`, `EXAM`) maps directly to a parent `Deck` with ordered child `Deck`s (equivalent to Anki's `Subject::L01 Introduction` hierarchy). Preview sections (`preview: true`) can import suspended or tagged `preview` so students don't accidentally study upcoming lectures early.

### 2.3 Invariants (Making Illegal States Impossible)
1. **No buried + suspended cards:** `CardStatus` is a discriminated union (`active` | `suspended` | `buried`); suspending a buried card replaces the variant rather than setting two booleans ([Anki Manual: Studying](https://docs.ankiweb.net/studying.html)).
2. **State-locked scheduling fields:** A `new` card cannot carry `stability`, `difficulty`, or `lastReviewAt`; a `review` card *must* carry `stability > 0`, `difficulty`, `dueDay`, and `lastReviewAt`; `learning`/`relearning` cards *must* carry `stepIndex` and `dueAtMs`.
3. **Immutable home deck during cramming:** `homeDeckId` is never overwritten by a filtered deck; filtered membership is a separate nullable `filteredDeckId` pointing only to a deck with `kind: 'filtered'`.
4. **Unique card identity per note:** `(noteId, ord)` is unique; editing a cloze note reconciles cards by `cN` index without orphan cards or silent history loss.
5. **Append-only review history:** `ReviewLog` rows are never edited in place. Undo within a session deletes only the latest uncommitted/session log atomically alongside restoring the pre-review `Card` snapshot and unburying siblings auto-buried by that exact review.

---

## 3. Features by Tier

*PWA fit ratings: `easy` (standard Web APIs), `doable` (needs careful browser engineering/workers), `hard` (hits Web platform limits—see §4).*

### Tier 1 — v1 Must-Haves (Daily Study + Lossless Migration)
- **FSRS scheduling engine (`ts-fsrs`):** Core states (`New`/`Learning`/`Review`/`Relearning`), configurable `desiredRetention` (default `0.90`), short-term learning/relearning steps (< 1d), fuzzing, and max interval — replaces Anki's scheduler with higher recall efficiency — `easy` (pure TS).
- **4-button study screen + interval preview:** Show front, reveal back, preview next intervals on `Again`/`Hard`/`Good`/`Easy` — matches FSRS and Anki muscle memory — `easy` (React + `ts-fsrs` preview).
- **Study-focused keyboard shortcuts:** `Space`/`Enter` reveal, `1–4` rate, `Z`/`Cmd+Z` undo, `B` bury, `@` suspend, `E` edit current note, `F1–F4` or `Cmd+1–4` flag — eliminates mouse friction during 200-card sessions — `easy` (in-tab keydown listener; see §4 for reserved combos).
- **Transactional Undo (in-session):** Reverts last rating, restores exact `Card` state, removes the `ReviewLog`, and unburies any sibling buried by that review — prevents accidental mis-clicks from corrupting FSRS stability — `easy` (Dexie transaction).
- **Deck overview & hierarchical subdecks:** Parent/child deck tree (`Subject::Lecture`), per-deck `New`/`Learn`/`Due` counts, daily new/review limits, and `.flipwise.json` `sections` ordering/metadata — serves both Anki subdecks and AAU lecture courses — `easy` (IndexedDB queries).
- **Burying, suspending, and leech detection:** Manual & automatic sibling burying (reset at study-day rollover), manual suspend, and configurable leech threshold (tag `leech` + optional auto-suspend) — keeps toxic cards from stalling daily queues — `easy` (pure domain logic).
- **Note types: Basic, Basic+Reversed, and Cloze:** Multi-field notes, `{{c1::answer::hint}}` cloze generation, and field-based editing — covers >90% of real university Anki decks — `easy` (string parser + React renderer).
- **Content rendering (Markdown + KaTeX + sanitized Anki HTML):** Native `markdown+katex` for `.flipwise.json` cards plus DOMPurify-sanitized HTML/scoped CSS + MathJax-to-KaTeX delimiter support (`\( \)`, `\[ \]`) for Anki imports — renders Joseph's robotics formulas and existing Anki decks cleanly — `doable` (needs careful CSS scoping & LaTeX macro fallback).
- **`.apkg` / `.colpkg` importer (legacy + modern `anki21b`):** Unzips archive, detects zstd magic bytes (`0x28B52FFD`), decompresses `collection.anki21b` + protobuf `MediaEntries` + zstd media blobs (or legacy `anki21`/`anki2` + JSON `media`), imports notes, cards, decks, tags, media, FSRS/SM-2 state, and `revlog` — highest-priority migration path for Joseph's real decks — `doable` (`JSZip` + `fzstd` + `sql.js` WASM in a Web Worker).
- **`.flipwise.json` native import & export:** Round-trips `decks/intro-to-robotics.flipwise.json` preserving `subject`, `exam`, `sections`, `examStyle`, `points`, and optional scheduling overlay — respects colleague's existing deck format — `easy` (JSON schema validation).
- **CSV / TSV import & export:** Column-to-field mapping via PapaParse, deck/tag assignment, duplicate detection by first field — lets students import lecture tables or export notes to spreadsheets — `easy` (PapaParse).
- **Filtered / Custom Study deck (Exam Cram):** One-click presets ("Exam-style only", "Cram section/tag", "Lapsed recently", "Review ahead N days") + custom search query, with `reschedule` toggle — essential for AAU written exams — `easy` (query over IndexedDB).
- **Tags, flags, and basic search syntax:** Hierarchical tags (`robotics::sensors`), 4 color flags, and browser/filter search (`deck:`, `tag:`, `is:due|new|learn|suspended|buried|leech`, `flag:`, `exam:true`, negation `-`, `OR`) — lets students isolate weak topics quickly — `easy` (Dexie indices + query parser).
- **Student-useful statistics:** Today's count & time, 7-day/30-day due forecast, true retention rate (pass % on mature/young reviews), card maturity breakdown (`New`/`Learning`/`Young`/`Mature`/`Suspended`), and study streak heatmap — answers "am I on track for the exam?" — `easy` (aggregation over `ReviewLog` + `Card`).
- **Offline-first PWA & local data safety:** Service Worker precaching (`vite-plugin-pwa`), `navigator.storage.persist()` request on install, storage health indicator, multi-tab write lock, and one-click full collection JSON/ZIP backup & restore — protects months of study history in a browser — `hard` (see §4).

### Tier 2 — v1.5 (High-Value Polish & Two-Dev Workflow)
- **Image Occlusion (rect/ellipse SVG masks):** Hide-all-guess-one and hide-one-guess-one cards on diagrams, plus import of Anki 23.10+ native Image Occlusion notes ([Anki Manual: Image Occlusion](https://docs.ankiweb.net/editing.html#image-occlusion)) — very useful for robotics/anatomy diagrams, but canvas editor + Anki IO parsing takes real effort — `doable` (SVG overlay over blob URL).
- **Two-developer sync (self-hosted / lightweight backend):** Delta sync of append-only `ReviewLog` + LWW/CRDT note/card updates across Mac/Windows browsers — lets Joseph and his colleague share decks and sync between home/uni laptops — `doable` (needs backend endpoint + conflict rules; background sync is `hard` on Safari).
- **In-browser FSRS parameter optimization:** Train personalized FSRS weights from local `ReviewLog` using `@open-spaced-repetition/binding` / WASM optimizer ([`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs)) — improves accuracy after ~400+ reviews — `doable` (WASM bundle in Web Worker).
- **Audio playback & auto-play on card flip:** Parse `[sound:file.mp3]` from Anki notes, play from IndexedDB blobs with replay hotkey (`R`) — required for language Anki decks — `easy` (HTMLAudioElement + Blob URL).
- **Auto-backup to chosen local folder:** Periodic snapshot writes via File System Access API (Chrome/Edge) with manual reminder fallback on Safari/Firefox — eliminates browser-eviction anxiety — `hard` (Chromium-only API).
- **Bulk browser editing:** Multi-select cards to add/remove tags, move decks, suspend, reset progress, or edit note fields inline — saves time when cleaning imported Anki decks — `easy` (virtualized table + batch Dexie tx).
- **Card info inspector & review history timeline:** Per-card stability, difficulty, current retrievability $R(t)$, and past `revlog` entries — helps power users trust FSRS scheduling — `easy` (read-only view).

### Tier 3 — Later (Deferred Beyond Stage 1)
- **Tauri 2 desktop wrapper:** Native SQLite/filesystem backups, global shortcuts, `.apkg` OS double-click association, auto-updater (`README.md` roadmap phase 5) — removes PWA platform limits once core app is proven — `n/a` (native shell).
- **Mobile / phone responsive PWA:** Touch gestures (swipe to flip/rate), mobile layout, offline sync — useful for commuting, deferred until desktop study is rock solid — `doable`.
- **AI-assisted card generation from lecture PDFs:** Draft Q&A cards from AAU slides into `.flipwise.json` (`README.md` phase 6) — separate workflow from SRS core — `doable`.
- **FSRS retention simulator & workload planner:** "What if I set desired retention to 0.85 before exam date X?" — nice optimization once basic stats work — `doable` (Web Worker).
- **Custom card template editor (HTML/CSS):** Full Anki-style Mustache template authoring beyond Basic/Cloze — unnecessary complexity for v1 students — `easy`.
- **AnkiWeb sync protocol compatibility:** Direct sync with AnkiWeb servers — undocumented/ToS-sensitive protocol; own sync is cleaner — `hard`.

---

## 4. Hard on a PWA (and Mitigations)

| Platform Constraint | Why It Hurts Flipwise | Concrete Mitigation |
| --- | --- | --- |
| **IndexedDB eviction & Safari 7-day ITP** | WebKit wipes script-writable storage after 7 days without site interaction in regular Safari tabs; Chromium can evict best-effort storage under disk pressure ([MDN StorageManager](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist), [WebKit Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)). | Call `navigator.storage.persist()` on first write; detect unpersisted/Safari-tab mode and prompt user to **install PWA** (exempts Safari Web Apps from 7-day wipe); show "days since last backup" badge and one-click `.flipwise-backup.zip` export (v1); add File System Access folder auto-backup in v1.5. |
| **Multi-tab IndexedDB corruption** | Opening Flipwise in two desktop browser tabs can race on `ReviewLog` writes, daily counters, and undo stacks. | Acquire a `navigator.locks` exclusive lock (`flipwise-session`) for active study mutations and broadcast state invalidation over `BroadcastChannel`; warn if a second study tab opens. |
| **Large `.apkg` / `.colpkg` RAM & UI freezes** | Importing a 500 MB Anki deck with `JSZip` + `fzstd` + `sql.js` WASM on the main thread freezes the UI or OOMs the tab. | Run all archive parsing, zstd decompression, and SQLite queries inside a **dedicated Web Worker**; stream/chunk media blobs directly into IndexedDB (`MediaAsset` table) rather than holding all extracted files in JS heap; check `navigator.storage.estimate()` before import and abort cleanly with an actionable error. |
| **OS file associations (`.apkg`, `.flipwise.json`)** | Double-clicking a deck in Finder/Explorer doesn't open a browser tab reliably; Web File Handling API (`launchQueue`) is Chromium-only and ignored by Safari/Firefox. | Treat drag-and-drop onto the app window + file picker as primary across all browsers; progressively enhance `manifest.webmanifest` `file_handlers` for installed Chrome/Edge PWAs. |
| **Browser-reserved keyboard shortcuts** | Browsers intercept `Cmd/Ctrl+W`, `Cmd/Ctrl+N`, `Cmd/Ctrl+T`, and `Ctrl+1–4` (tab switching on Windows/Linux), breaking Anki desktop muscle memory. | Bind single-key shortcuts (`Space`, `1–4`, `Z`, `B`, `@`, `E`, `R`) only when focus is not in an input/editor; never rely on OS/browser-reserved `Ctrl/Cmd` combos for core study actions. |
| **Background sync & scheduled reminders** | WebKit does not support the Background Sync API; closed PWAs cannot reliably push daily review reminders or sync offline edits silently. | Keep v1 strictly local; when sync arrives in v1.5, trigger sync on app focus, online event, and `visibilitychange`, using an idempotent outbox queue in IndexedDB. |

---

## 5. Core Types and Modules Sketch

*Signatures only — no implementation. Designed so illegal card/scheduling states fail at compile time and `ts-fsrs` internals stay encapsulated inside `Scheduler`.*

```ts
// --- Branded IDs & Primitives ---
export type DeckId = string & { readonly __brand: 'DeckId' };
export type NoteTypeId = string & { readonly __brand: 'NoteTypeId' };
export type NoteId = string & { readonly __brand: 'NoteId' };
export type CardId = string & { readonly __brand: 'CardId' };
export type ReviewLogId = string & { readonly __brand: 'ReviewLogId' };
export type MediaHash = string & { readonly __brand: 'MediaHash' }; // SHA-256 hex
export type EpochMs = number;
export type StudyDay = number; // Days since Unix epoch in user's rollover-adjusted local calendar

export type Rating = 1 | 2 | 3 | 4; // 1=Again, 2=Hard, 3=Good, 4=Easy
export type FlagColor = 0 | 1 | 2 | 3 | 4; // 0=None, 1=Red, 2=Orange, 3=Green, 4=Blue

// --- Scheduling & Status (Illegal States Unrepresentable) ---
export interface FsrsMemory {
  readonly stability: number;  // days until R drops to 90%
  readonly difficulty: number; // [1, 10]
}

export type SchedulingState =
  | { readonly kind: 'new'; readonly queuePosition: number }
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
export interface NoteType {
  readonly id: NoteTypeId;
  readonly name: string;
  readonly kind: 'basic' | 'basic-reversed' | 'cloze' | 'anki-imported';
  readonly contentFormat: 'markdown+katex' | 'anki-html';
  readonly fields: readonly string[];
  readonly templates: readonly { readonly ord: number; readonly name: string; readonly front: string; readonly back: string }[];
  readonly css?: string;
}

export interface Note {
  readonly id: NoteId;
  readonly noteTypeId: NoteTypeId;
  readonly fields: Readonly<Record<string, string>>;
  readonly tags: readonly string[];
  readonly mediaRefs: readonly MediaHash[];
  readonly courseMeta?: { readonly examStyle?: boolean; readonly points?: number; readonly sourceCardId?: string };
  readonly createdAtMs: EpochMs;
  readonly updatedAtMs: EpochMs;
}

export interface Card {
  readonly id: CardId;
  readonly noteId: NoteId;
  readonly ord: number; // Template index or cloze cN (1-based for cloze)
  readonly homeDeckId: DeckId;
  readonly filteredDeckId: DeckId | null;
  readonly status: CardStatus;
  readonly scheduling: SchedulingState;
  readonly flag: FlagColor;
  readonly createdAtMs: EpochMs;
  readonly updatedAtMs: EpochMs;
}

export interface DeckOptions {
  readonly desiredRetention: number;              // e.g. 0.90
  readonly learningStepsMin: readonly number[];   // each < 1440 (FSRS rule)
  readonly relearningStepsMin: readonly number[]; // each < 1440 (FSRS rule)
  readonly maxIntervalDays: number;               // e.g. 36500
  readonly enableFuzz: boolean;
  readonly newPerDay: number;
  readonly reviewsPerDay: number;
  readonly buryNewSiblings: boolean;
  readonly buryReviewSiblings: boolean;
  readonly leechThreshold: number;                // default 8
  readonly leechAction: 'suspend' | 'tag-only';
  readonly fsrsWeights?: readonly number[];       // default ts-fsrs weights if omitted
}

export type Deck =
  | {
      readonly kind: 'normal';
      readonly id: DeckId;
      readonly parentId: DeckId | null;
      readonly name: string;
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
  readonly reviewedAtMs: EpochMs;
  readonly studyDay: StudyDay;
  readonly rating: Rating;
  readonly durationMs: number;
  readonly stateBefore: SchedulingState['kind'];
  readonly intervalAfterDays: number;
  readonly memoryAfter: FsrsMemory;
  readonly wasFilteredCram: boolean; // true when reschedule=false
}

export interface MediaAsset {
  readonly hash: MediaHash;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly blob: Blob;
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
  readonly autoBuriedSiblingIds: readonly CardId[];
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
  // Atomic unit of work (maps to Dexie db.transaction)
  transaction<T>(mode: 'r' | 'rw', fn: () => Promise<T>): Promise<T>;
  getDeckTree(): Promise<readonly Deck[]>;
  getCardsByQuery(query: string, today: StudyDay): Promise<readonly Card[]>;
  putEntities(batch: { decks?: readonly Deck[]; noteTypes?: readonly NoteType[]; notes?: readonly Note[]; cards?: readonly Card[]; logs?: readonly ReviewLog[] }): Promise<void>;
  deleteReviewLog(id: ReviewLogId): Promise<void>;
  putMedia(asset: MediaAsset): Promise<void>;
  getMedia(hash: MediaHash): Promise<MediaAsset | null>;
  exportBackupZip(): Promise<Blob>;
  importBackupZip(file: Blob): Promise<{ readonly decks: number; readonly notes: number; readonly cards: number; readonly logs: number }>;
  storageHealth(): Promise<{ readonly persisted: boolean; readonly usedBytes: number; readonly quotaBytes: number }>;
}

export interface ImportReport {
  readonly format: 'apkg' | 'colpkg' | 'flipwise-json' | 'csv';
  readonly decksImported: number;
  readonly notesImported: number;
  readonly cardsImported: number;
  readonly logsImported: number;
  readonly mediaImported: number;
  readonly warnings: readonly { readonly code: string; readonly count: number; readonly detail: string }[];
}

export interface Importer {
  importAnkiPackage(file: File, opts: { readonly preserveScheduling: boolean; readonly onProgress?: (pct: number, stage: string) => void }): Promise<ImportReport>;
  importFlipwiseJson(file: File, opts: { readonly suspendPreviewSections: boolean }): Promise<ImportReport>;
  importCsv(file: File, opts: { readonly deckId: DeckId; readonly delimiter?: string; readonly mapping: Readonly<Record<number, string>>; readonly duplicatePolicy: 'skip' | 'update' | 'keep' }): Promise<ImportReport>;
}
```

---

## 6. Adversarial Review and Open Questions

### 6.1 Offline Data Safety
- **Attack:** "IndexedDB is not a database; Safari will nuke Joseph's entire semester of review logs if he takes an 8-day break after exams."
  - **Fix applied in spec:** Elevated `navigator.storage.persist()`, Safari-tab install nudges, storage-quota preflight checks, and one-click `.flipwise-backup.zip` export to **v1 Must-Have** (not v1.5).
- **Attack:** "A crash or quota error halfway through importing a 300 MB `.apkg` leaves half-written notes and orphaned media blobs."
  - **Fix applied in spec:** Import writes media chunks first (content-addressed by SHA-256, safe to garbage-collect), then commits decks/notes/cards/logs in batched transactions with a rollback/cleanup manifest on failure; `storage.estimate()` preflight rejects before starting if free quota < 2× archive size.
- **Residual risk:** If the user ignores backup reminders *and* clears browser site data manually, local-only data is gone until v1.5 sync/folder backup ships.

### 6.2 FSRS Correctness
- **Attack:** "Storing `due` only as a UTC timestamp breaks daily queues across timezones, DST transitions, and 02:00 AM exam cramming."
  - **Fix applied in spec:** Split scheduling timestamps cleanly in `SchedulingState`: intra-day `learning`/`relearning` use exact `dueAtMs` (`EpochMs`), while multi-day `review` cards use `dueDay` (`StudyDay`, computed via user's local timezone + configurable rollover hour, default `04:00`). Crossing a DST boundary or flying between timezones never double-counts or skips a review day.
- **Attack:** "Undo corrupts FSRS when a review auto-buried siblings or triggered a leech tag/suspension."
  - **Fix applied in spec:** `UndoToken` captures the exact `previousCard`, `reviewLogId`, `autoBuriedSiblingIds`, and `addedLeechTag`, and `StudySession.undo` reverts all four inside one Dexie transaction.
- **Attack:** "The colleague's `README.md` specifies 3 rating buttons (`Again`/`Hard`/`Good`), while this spec specifies 4 (`Again`/`Hard`/`Good`/`Easy`)."
  - **Fix applied in spec:** Explicitly reconciled in §1: default to 4 buttons so FSRS parameters remain calibrated; keep `Easy` visually understated so the UI stays as clean as the mockup.
- **Attack:** "What if an imported Anki deck has learning steps ≥ 1 day (e.g., `10m 1d 3d`), which FSRS explicitly warns against?"
  - **Fix applied in spec:** Clamp or warn on import when any step ≥ `1440` minutes (`ImportReport.warnings`), defaulting to `['1m', '10m']` / `['10m']` while preserving the user's choice to override.
- **Attack:** "`ts-fsrs` evolved rapidly (v5 `fsrs()` → v6 `DefaultScheduler()` / FSRS-7); coupling storage types to `ts-fsrs` card objects will break migrations."
  - **Fix applied in spec:** `SchedulingState` and `ReviewLog` are Flipwise-owned domain types; `Scheduler` is the sole adapter wrapping `ts-fsrs`.

### 6.3 Lossless `.apkg` / `.colpkg` Import
- **Attack:** "Modern Anki exports (`23.10+`) do **not** use plain SQLite + JSON `media`; `sql.js` alone will crash on Joseph's decks."
  - **Fix applied in spec:** Explicitly handle both formats: legacy (`collection.anki2` / `collection.anki21` + JSON `media`) and modern (`collection.anki21b` zstd-compressed SQLite + zstd-compressed protobuf `MediaEntries` + zstd-compressed numbered media blobs, detected via zstd magic bytes `0x28B52FFD`).
- **Attack:** "Anki cards imported from SM-2 decks lack FSRS `stability` and `difficulty` in `cards.data`."
  - **Fix applied in spec:** Two-tier migration: (1) if `cards.data` contains Anki FSRS JSON (`s`, `d`), import directly; (2) if the card was SM-2 only and `revlog` is present, replay its `revlog` through `ts-fsrs` to derive accurate `(S, D)`; (3) if `revlog` was stripped (shared `.apkg`), initialize `S` from the card's current interval (`ivl`) and default `D` from ease factor, logging a warning in `ImportReport`.
- **Attack:** "Anki templates contain arbitrary HTML, CSS, `<script>`, LaTeX (`[latex]`, `\( \)`), cloze hints (`{{c1::x::hint}}`), nested clozes, and Anki 23.10+ Image Occlusion notes—naive rendering breaks cards or opens XSS."
  - **Fix applied in spec:** Sanitize all imported HTML with DOMPurify (strip `<script>` and inline event handlers), isolate card CSS inside Shadow DOM or scoped wrapper, normalize `\( \)` / `\[ \]` to KaTeX, support hinted clozes (`::hint`) in v1, and emit explicit `ImportReport.warnings` for unsupported constructs (nested clozes, `<script>` templates, Image Occlusion until v1.5, `[latex]` TeX packages) rather than silently dropping cards.

### 6.4 Open Questions for Joseph & Co-Developer
1. **3 vs. 4 rating buttons in UI:** Confirm adopting 4 buttons (`Again`/`Hard`/`Good`/`Easy`) to match FSRS & Anki, or whether `Easy` should be an optional setting (default on).
2. **Anki `.colpkg` import semantics:** Should importing a `.colpkg` **merge** into existing Flipwise decks (safer for a student who already has `intro-to-robotics.flipwise.json`) or **replace** the collection like Anki desktop? *(Recommendation: merge by default with explicit replace option.)*
3. **Preview sections in `.flipwise.json`:** For sections with `"preview": true` (`L08`–`L10` in Robotics), should Flipwise import their cards as **suspended** by default until the lecture happens, or active with a `preview` badge?
4. **v1.5 Sync backend choice:** When syncing between the two developers, prefer a tiny self-hosted server (e.g., Cloudflare Worker + R2/D1 or PocketBase) or peer/file-based sync (Git/Syncthing)?
5. **Image Occlusion priority:** Do Joseph's current AAU Anki decks rely heavily on Image Occlusion diagrams? If yes, pull read-only rendering of imported Anki Image Occlusion cards into v1 (keeping the IO authoring editor in v1.5).

---

## 7. Sources

- **Anki Manual (Official):**
  - Studying, burying, suspending, undo, shortcuts: https://docs.ankiweb.net/studying.html
  - Deck options, daily limits, FSRS, learning steps: https://docs.ankiweb.net/deck-options.html
  - Leeches: https://docs.ankiweb.net/leeches.html
  - Filtered decks & cramming: https://docs.ankiweb.net/filtered-decks.html
  - Searching syntax: https://docs.ankiweb.net/searching.html
  - Editing, cloze deletions, native Image Occlusion: https://docs.ankiweb.net/editing.html
  - Card templates & field replacements: https://docs.ankiweb.net/templates/intro.html
  - Importing (`.apkg`, `.colpkg`, CSV/TSV): https://docs.ankiweb.net/importing/intro.html
  - Exporting: https://docs.ankiweb.net/exporting.html
  - Statistics & card info: https://docs.ankiweb.net/stats.html
  - Preferences (next-day rollover): https://docs.ankiweb.net/preferences.html
- **FSRS & `ts-fsrs`:**
  - `ts-fsrs` TypeScript library & API: https://github.com/open-spaced-repetition/ts-fsrs
  - FSRS algorithm wiki & FAQ: https://github.com/open-spaced-repetition/fsrs4anki/wiki
- **Anki Package & Database Format:**
  - Anki official backend (`rslib`, `import_export.proto` / `MediaEntries`, `anki21b` zstd): https://github.com/ankitects/anki
  - AnkiDroid database schema reference (`col`, `notes`, `cards`, `revlog`): https://github.com/ankidroid/Anki-Android/wiki/Database-Structure
- **PWA Storage & Platform Specs:**
  - MDN `StorageManager.persist()` & eviction: https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist
  - WebKit Storage Policy (7-day cap & Home Screen/PWA exemption): https://webkit.org/blog/14403/updates-to-storage-policy/
  - MDN Web Locks API (multi-tab concurrency): https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
- **Repository Context:**
  - `README.md`
  - `decks/intro-to-robotics.flipwise.json`
