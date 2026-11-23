# Flipwise

An open-source, general-purpose **spaced-repetition flashcard app** for studying university courses (or anything else).

Flip a card, rate how well you knew it, and let the scheduler decide when you see it next.

## Features (planned)

- **Flip cards**: see the question, tap to reveal the answer.
- **Three rating buttons**:
  - 🔴 **Again**: didn't know it, show it again soon
  - 🟠 **Hard**: got it, but with effort
  - 🟢 **Good**: knew it, push it further out
- **Spaced repetition** with FSRS (SM-2 optional).
- **Subject → lecture navigation**: study one lecture or a whole subject.
- **Markdown and math** on cards (KaTeX).
- **Import / export**, including Anki decks and CSV.
- Runs as a **desktop app** (Tauri) and on the **web** (GitHub Pages).

## What's done so far

| Item | Status |
| --- | --- |
| Clickable HTML prototype / mockup of the study flow | ✅ Done (`docs/design/flipwise-mockup.html`) |
| **Introduction to Robotics** deck (AAU Klagenfurt): 341 cards, 212 of them exam-style | ✅ Done (`decks/intro-to-robotics.flipwise.json`) |
| Build guide: 24 step-by-step prompts in 6 phases | ✅ Done |
| App code | 🚧 Next up |

The deck and mockup files are being added to the repo next.

## Tech stack

| Area | Choice |
| --- | --- |
| Desktop shell | [Tauri 2](https://tauri.app/) |
| UI | React 18 + TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS |
| State | Zustand |
| Local storage | Dexie (IndexedDB) |
| Scheduling | FSRS via [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), SM-2 optional |
| Card content | Markdown + KaTeX |
| Import / export | JSZip, sql.js (Anki `.apkg`), PapaParse (CSV) |
| Testing | Vitest (unit), Playwright (end-to-end) |
| CI / deploy | GitHub Actions, GitHub Pages |

## Roadmap

1. **Foundation**: project setup, deck format, storage
2. **The app**: study screen, rating, scheduler, subject/lecture navigation
3. **Import / export**, including Anki
4. **Open-source quality**: tests, linting, CI
5. **Installers** with auto-update
6. **Later**: sync, mobile, AI-assisted card generation

## Deck format

Decks are JSON files (`*.flipwise.json`) organised by subject and lecture, each card with a front and a back. See `decks/` for an example.

## Contributing

Contributions are welcome: new decks, bug fixes and features. Open an issue or a pull request.

## License

MIT (to be added).
