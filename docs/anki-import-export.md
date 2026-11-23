# Anki package interchange

Subjects → Import and Settings → Data accept `.apkg` and `.colpkg` files. Parsing runs in a Web Worker. SQLite WASM, KaTeX CSS/fonts and all JavaScript are served from Vite assets; no CDN is used.

The parser prefers `collection.anki21b`, then `collection.anki21`, then `collection.anki2`. Zstd collection/media payloads use fzstd. Deck/model JSON and normalized decks/notetypes/fields/templates tables are supported. Media manifests support legacy JSON and Anki's protobuf MediaEntries format. Unreadable modern data produces older-export guidance; media decoding failures appear as preview warnings.

Three-level paths retain the root as a collection label and map Course → Lecture. Course-level notes under a recognized root go into General. Standalone two-level decks use their first component as subject and General as lesson. Deeper lecture paths remain joined, preserving their names.

Card identity is `anki:<encoded GUID>:<template ordinal>`. Re-import updates fields, tags and placement, retains missing notes, and keeps local review history. New-card due positions update only while unreviewed. Preview new/updated/unchanged counts refer to notes, not individual cards. Content and optional merged revlog commit in one IndexedDB v2 transaction. Historical reviews deduplicate by card ID + timestamp, are marked `source: anki`, and replay through FSRS. Without revlog, cards start new, regardless of an incoming cards table's cached scheduling fields. Imported content and media survive reload; imported decks default to hiding demo decks, with a Data toggle to show them again.

Name aliases use the central scheduler caps: Analysis 1 = 18, Introduction to Robotics / Robotics = 11, Physics 1 = 6, Programming 1 = 5. Other courses default to 20. Global cap remains 40.

HTML is sanitized with DOMPurify, scripts/event handlers/style attributes are removed, ordinary links require HTTPS, and images require a matching imported-media blob URL. Source separately allows `obsidian://` and HTTPS and appears as Open source on answers. KaTeX handles `\(...\)`, `\[...\]`, `$...$` and `$$...$$`, with trust disabled. Demo cards retain their Markdown renderer.

Settings → Data exports a legacy anki2 `.apkg` with one Basic note type, forward/reverse templates as required, stable GUIDs, subject::lesson decks and media. Export is content-only: cards export as new and no scheduling history is exported. Extra fields are retained in an Extra JSON field. Flipwise JSON exports one selected subject in the existing subject/sections/cards envelope, retaining imported metadata.

## Validation and limits

Vitest synthesizes SQLite fixtures in memory, loads WASM from node_modules, and covers hierarchy, General lessons, normalized metadata, reversed cards, GUID updates with preserved progress, missing notes, revlog deduplication, sanitization, math detection, zstd + protobuf media, SQLite export/import and atomic deck/history persistence. Browser checks cover the real legacy package, preview/confirmation, reload, global queue/rating, re-import counts, Insights filters and both download formats. Screenshots and real-deck exports stay gitignored or in `/tmp`; no personal deck content is committed.

This is a Basic/reversed interchange implementation, not a full Anki template engine. Cloze, image occlusion, custom template expressions/CSS/JavaScript and audio playback are not rendered; raw fields/media are retained and warnings identify unsupported content. Other template ordinals retain their identity but display basic fields. No Anki desktop import was automated; exported SQLite is validated by re-importing through the parser. Scheduling reconstruction requires complete revlog and uses the configured default FSRS parameters, not original Anki memory-state caches. Cross-tab concurrent writes and browser storage eviction retain the Phase 1 limitations. Existing legacy logs are never rewritten merely because a deck is imported. Imports require IndexedDB; review-only localStorage fallback does not accept deck imports.

References: [Anki package protobuf](https://github.com/ankitects/anki/blob/main/proto/anki/import_export.proto), [Anki exporting](https://docs.ankiweb.net/exporting.html).

Approximate isolated minified/gzip JavaScript sizes: sql.js 58.7/20.3 kB plus 688.3/337.2 kB WASM; fflate 32.6/12.3 kB; fzstd 8.3/3.8 kB; DOMPurify 32.5/12.6 kB; KaTeX 268.9/77.1 kB plus local CSS and 1.07 MB of font fallbacks. These are standalone estimates, not additive bundle deltas. Test-only additions are jsdom and TypeScript declarations for sql.js, KaTeX and Node. Production build reports a large JavaScript chunk; further lazy loading is a follow-up.
