# Study pace and limits

Users decide how fast new cards arrive and how many reviews a day they'll accept. They can choose
a preset, set their own numbers per course and per lecture, or set an exam date and let Flipwise
work out the pace. A live forecast shows what each choice means: reviews per week for the next 8
weeks, minutes per day, and the date every card will have been seen.

## Types

```ts
type PresetId = 'slow' | 'medium' | 'aggressive' | 'exam' | 'custom';

/** Stored on a course (Subject.study) and on a lecture (Lecture.study). Absent field = inherit. */
interface StudyLimits {
  newPerDay?: number;      // >= 0
  reviewsPerDay?: number;  // >= 1; absent = inherit
  targetDate?: string;     // 'YYYY-MM-DD' (exam); courses only
  preset?: PresetId;       // courses only; which preset produced the numbers
}

/** Global, part of the synced settings record (next to retention). */
interface GlobalStudy {
  newPerDay: number;            // all courses combined (default 40)
  reviewsPerDay: number | null; // all courses combined; null = no limit (default)
  pace: PresetId;               // last preset applied to all courses ('custom' by default)
}
```

### Where it lives, and how it syncs

- **Global values** sit in `AppearanceSettings` (`newPerDay`, `reviewsPerDay`, `pace`), the same
  record as `retention`. They're one synced settings record, last-writer-wins (LWW).
- **Course and lecture overrides** sit on the imported `Subject` / `Lecture` objects. Those are
  already per-record LWW sync records (`subject~…`, `deck~…`), so an edit on one device merges
  record by record with edits elsewhere and never overwrites a whole collection.
  - `mergeImport` keeps `study` when a deck is re-imported.
  - `Subject.dailyNew` (set at import) stays as the course's built-in default.
- **Demo courses** aren't imported data, so their overrides live in localStorage
  (`flipwise.demoStudy.v1`) and are never uploaded, like every other piece of demo data.

### Migration

Nothing is rewritten; the old values become the defaults that everything inherits from:

| Old | New |
| --- | --- |
| `STUDY_CONFIG.globalNew = 40` | `settings.newPerDay` default 40 |
| `STUDY_CONFIG.courseNew` (Physics 1 18, Robotics 11, Analysis 1 6, Programming 1 5) | course default: `Subject.dailyNew`, else this table by name, else 20 |
| (no review limit) | `settings.reviewsPerDay = null` |

`STUDY_CONFIG.rolloverHour` (04:00) is unchanged. `STUDY_CONFIG` stays as the table of defaults.

## Resolution (`resolveLimits`)

| Value | Lecture | Course | Global |
| --- | --- | --- | --- |
| New per day | lecture `study.newPerDay`, else no lecture limit | `study.newPerDay`; exam preset = solver; else course default | `newPerDay` (combined) |
| Reviews per day | lecture `study.reviewsPerDay`, else no lecture limit | `study.reviewsPerDay`, else no course limit | `reviewsPerDay` (combined) |

The UI shows each value as **inherited**, with where it comes from ("Course default", "All
courses", "No limit"), or as **set here**, with "Reset to inherited".

## Queue rules (`queue()`)

**Learning and relearning cards are never capped.** They're short steps that should finish the
same day.

**New cards:**

- They go in `queuePosition` order.
- A card is admitted while every level still has room: lecture, course and global.
- "Used today" counts first introductions since the 04:00 rollover.

**Due reviews:** only review-state cards count against review caps. "Used today" counts answers
given today to cards that were in review state at the time.

- **When a cap binds, which reviews are deferred?** Due reviews are taken in order of **lowest
  retrievability first**. Retrievability is the FSRS probability of recalling the card right
  now. A card at 55% is about to be lost; a card at 88% that's due today will still be recalled
  tomorrow almost as often. Deferring the high-retrievability cards therefore loses the least
  memory per deferred review. Most-overdue-first is close but ignores stability: a 3-day-overdue
  card with a 2-day interval is far worse off than a 3-day-overdue card with a 200-day one.
- A review is admitted while every level has room (lecture, course, global).
- The admitted set is then shown in the usual order: learning first, then reviews by due time,
  then new cards.

## Presets (per course, or "apply to all")

`U` is the course's unseen (never-studied) cards. Each preset spreads `U` over a horizon,
clamped to a range, and never above `U`.

| Preset | New per day | Reviews per day |
| --- | --- | --- |
| Slow | `clamp(ceil(U / 90), 5, 10)` | `min(10 × new, 300)` |
| Medium | `clamp(ceil(U / 45), 15, 20)` | `min(10 × new, 400)` |
| Aggressive | `clamp(ceil(U / 21), 30, 40)` | 500 (a sanity ceiling, not a target) |
| Exam | solver (below), re-solved every day | `min(10 × new, 500)` |
| Custom | whatever the user set | whatever the user set |

The review caps are generous on purpose: they're ceilings that only bite when a backlog builds,
not targets. The forecast itself measures what a constant intake really costs with FSRS-6's
default parameters (10 new cards a day):

| Retention | Week 1 | Week 4 | Week 8 | Week 26 | Week 52 |
| --- | --- | --- | --- | --- | --- |
| 85% | 4.7 | 14.3 | 27.3 | 34.2 | 51.3 |
| 90% | 7.9 | 24.7 | 27.4 | 45.6 | 61.8 |
| 95% | 13.4 | 35.5 | 49.2 | 78.0 | 97.3 |

(Reviews per day. At 90% that's about 2.7× the new cards by week 8 and about 6× after a year,
which is roughly 12 minutes a day at 8 s per answer.) That's well below the 8–10× often quoted
for Anki's old SM-2 scheduler, because FSRS intervals grow faster.

Editing any number by hand switches the course to **Custom**. **Apply to all** writes the preset
to every course and records it as the global `pace`.

### Exam mode (`solveExam`)

Given the exam date and today:

- `days = calendar days from today up to the exam`, excluding the exam day itself
- `buffer = clamp(round(days × 0.15), 2, 7)`: the last days are kept for review only
- `new/day = ceil(U / (days − buffer))`

The exam is **unrealistic** if any of these hold, and the UI says so and offers the closest
sensible pace:

- `days − buffer ≤ 0` (the exam is today, already past, or too close for a buffer)
- `new/day > 60`
- the forecast says the load exceeds 60 minutes a day

## Forecast (`forecast()`)

The forecast is a **deterministic expected-value cohort simulation** built on ts-fsrs. It runs at
the chosen retention `r`, with no fuzz, over 56 days.

- **Cohorts.** A cohort is a ts-fsrs `Card` (a typical card in that state), a weight (expected
  number of cards) and a due day.
  - Every studied card starts as its own cohort, from `replay(log)`. Overdue cards start on
    day 0.
  - Each day introduces `n` new cards as one cohort of weight `n`. Each is rated Good, does its
    10-minute learning step, is rated Good again, and is then due in its first interval.
- **Each review splits a cohort.** On its due day the cohort's weight counts as reviews (up to
  the review cap; see below), then splits:
  - **Recalled** (weight × `r`): rated Good, and the next due day comes from ts-fsrs.
  - **Lapsed** (weight × `(1 − r)`): rated Again, which counts a lapse. Then it does one
    relearning step, which costs one extra answer that day, and is rated Good on the same day.
  - `r` is the probability of a Good. FSRS schedules each review for the moment the card's
    retrievability reaches the target retention, so on its due day a card is recalled with
    probability ≈ `r`.
  - The model ignores Hard and Easy; they shift intervals symmetrically and barely move totals.
- **Merging keeps the simulation bounded.** Cohorts with the same due day, ~5% stability bucket
  and 0.5 difficulty bucket are merged (weights add). Weights below 0.01 are dropped. The cohort
  count therefore stays bounded instead of doubling at every review.
- **The review cap is enforced.**
  - If a day's due weight is over the cap, the lowest-retrievability cohorts go first, as in
    the queue.
  - The rest roll to the next day, which is the backlog.
  - A backlog that's still growing at day 56 triggers a warning.
- **Minutes per day.** Answers per day (new cards × 2, reviews, lapses × 1) × the user's average
  seconds per answer. The average comes from the review log (the median over the last 500
  answers, capped at 60 s); with fewer than 20 answers it falls back to 8 s.
- **Finish date.**
  - The day the last unseen card is introduced: today + `ceil(U / n) − 1`, where `n` is the
    effective new/day.
  - For a single course, `n` is its own cap, further capped by the global cap.
  - For all courses together, `n` is the global cap allocated across courses in queue order.
- **Warnings:**
  - average load over 60 minutes a day in the busiest week
  - a growing review backlog (the review cap is below the demand)
  - the finish date falling after the exam date minus the buffer
- **Cache and speed.**
  - Results are cached by a key of every input: card states (by log length and last id), the
    limits, retention and today.
  - Slider input is debounced.
  - Timings on the 2,568-card starter set are in the "Performance" section.

### Assumptions, stated plainly

- Recall on the due day ≈ target retention: no individual differences, no Hard or Easy.
- A new card is introduced with a Good on its first day (no first-day lapse).
- You study every day. Missed days aren't modelled; that's what the backlog warning and
  catch-up are for.
- The single-course forecast ignores competition from other courses for the global new-card cap.
  The all-courses forecast models it.

## Performance

(Filled in after measurement; see the end of this document.)
