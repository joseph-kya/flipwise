# AI & Robotics starter set

`public/starter/ai-robotics.json` is Joseph's ready-made deck collection, derived from the lecture
slides of the AI & Robotics programme. New users can add it from onboarding ("Choose your start").
Vite copies `public/` verbatim into `dist/`, and the app fetches the file only when the starter
set is chosen. It's never part of the JS bundle.

## Contents

The source is `Semester 1.apkg`: a legacy `collection.anki2` with 2,568 notes and 2,568 cards, no
revlog and no media.

| Course | Lectures | Cards | New/day cap |
| --- | --- | --- | --- |
| Analysis 1 | 9 | 696 | 6 |
| Introduction to Robotics | 14 | 904 | 11 |
| Physics 1 | 14 | 756 | 18 |
| Programming 1 | 9 | 212 | 5 |

Introduction to Robotics includes three small leftover decks whose numbers duplicate other
lectures:

- "4 Operation, Simulation and Communication of Robots" (2 cards)
- "5 Coordinate Transformation and Kinematics" (4 cards)
- "11 Exam Preparation" (9 cards)

They're kept as they are in Anki. If they're cleaned up in Anki, the next rebuild simply reflects
that.

Size: about 2.5 MiB raw and about 240 KiB gzip. GitHub Pages and Vite serve it compressed.

## Regenerate

```sh
npm run build:starter -- "artifacts/anki/Semester 1.apkg"
```

The script (`scripts/build-starter-pack.ts`, run with `vite-node`) opens the `.apkg` **read-only**
with the app's own parser (`src/anki/package.ts`). Ids are therefore exactly what a normal import
of the same file produces:

- subjects are `anki-<Root::Course>`
- lectures are the encoded lecture name
- cards are `anki:<note GUID>:<ord>`

Because of that, adding the starter set twice, or adding it and later importing the real `.apkg`,
upserts instead of duplicating.

Review history (`revlog`), scheduling and media are dropped. Cards carry no due, interval or ease;
`queuePosition` is only the new-card order. Commit the regenerated JSON, then run
`npx vitest run src/onboarding` to check counts, GUID stability, upsert and sync.

## How it's added

Onboarding calls the same commit path as Import: `mergeImport` → `LogStorage.importDecks`. The
starter set is therefore real (non-demo) data. It's stamped for sync, upserts by GUID, and keeps
review progress if it's re-added. Picking a subset of courses imports only those subjects; the
rest can be added later the same way.

The first time real decks arrive (starter set, import or sync), the built-in demo decks are hidden
and the generated demo history is cleared. Demo data was never synced. The demo decks aren't
deleted: Settings → Data → "Show demo decks" brings them back.
