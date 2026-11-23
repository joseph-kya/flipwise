# Scheduler versus Anki — Phase 1

## Audit

At 6906627, ratings were saved to localStorage and empty storage automatically generated demo history. There was no scheduler, queue, interval preview or daily quota enforcement. Today displayed a literal 24 due cards. Mastery used latest ratings; session statistics and calendar aggregated review events. Those existing aggregations now consume the real persisted log; mastery remains a rating-based indicator, not an FSRS retrievability estimate.

Phase 1 uses the legacy FSRS-6 API in pinned ts-fsrs 6.0.1 (the package also has a newer FSRS-7 API, which we do not use). Scheduling is recomputed from ordered events; retention and fuzz are recorded per event so settings changes do not rewrite history. Legacy rows default to 0.90/fuzz enabled. New installs seed no history. Previously generated demo rows are retained rather than silently deleting potentially mixed real history.

| Feature | Parity | Implementation / limitation |
| --- | --- | --- |
| FSRS version/parameters | Same | FSRS-6, package default 21 weights, short-term model enabled, maximum interval 36500 days; no custom weights. |
| Desired retention | Same | 0.90 default; Study settings offer 85/90/95%. |
| Learning/relearning steps | Same | 1m, 10m / 10m via ts-fsrs; model handles graduation and Easy. |
| Fuzz | Same | Enabled; replay deterministic through ts-fsrs; tests disable fuzz for reference comparisons. |
| Load balancing (Anki 24.11+) | Gap | No workload-aware selection within fuzz windows. |
| Bury siblings | Gap | No automatic sibling burying; current content has one card per note. |
| Leech threshold/action | Partial | Derived `leech` tag at 8 lapses, shown during study; no auto-suspend or editable note-tag database. |
| Easy days | Gap | No weekday workload preferences. |
| Parameter optimization | Gap | Uses defaults; no in-browser optimizer. |
| Day rollover | Same | Local 04:00 for quotas, review eligibility, calendar and streaks; fixed in Phase 1. |
| New-card quotas/order | Same | Course caps plus global 40; due learning/relearning first, due reviews next, new by position; stable ID ties. |

Default weights: `[0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]`.

Caps live in `STUDY_CONFIG` in `src/scheduler.ts`, keyed by subject ID: Physics 18, Robotics 11, Analysis 6, Programming 5 (confirmed by Joseph, matching the product spec). Demo queue positions follow lesson index × 1000 + card index; imported Anki positions are future import work.

## Persistence and undo

IndexedDB stores the complete log atomically per rating. The UI waits for transaction completion; failed writes leave the card unrated and show a notice. First open migrates localStorage once, keeping its copy as backup. A missing IndexedDB/open failure falls back to localStorage with a quiet notice. Undo removes only the last session event after saving the shortened log, and replay restores the previous schedule. Reloading reads IndexedDB before enabling study. Card states and leech tags are derived, with no mutable scheduling cache to diverge.

## Remaining gaps

In addition to the table: no learn-ahead window, configurable rollover UI, review limit, arbitrary ancestor deck presets, import/suspend/bury controls, backup/export or cross-tab write coordination. Study in one tab; simultaneous writers are not supported. Browser storage eviction remains possible. No claim of byte-for-byte Anki queue parity or imported historical scheduling parity: legacy logs lack original FSRS parameters/state, so replay starts cards as new. Learning cards return when their short step becomes due; finishing the current queue does not advance the clock. Existing demo mastery labels describe latest answer quality, not predicted retention.

References: [Anki deck options](https://docs.ankiweb.net/deck-options.html), [ts-fsrs source](https://github.com/open-spaced-repetition/ts-fsrs), [FSRS-6 model](https://open-spaced-repetition.github.io/ts-fsrs/guide/model/fsrs-6).
