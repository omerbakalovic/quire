# Quire

A local-first EPUB reader for Android and iOS. The name and package id are working values in `src/config/identity.json`.

Milestone 0 compared foliate-js and epub.js in a desktop browser. The recommendation is in `DECISIONS.md`. The app does not vendor a renderer yet.

- `npm test` runs the domain tests.
- `npm run fixtures` rebuilds the hand-built EPUBs.
- `npm run books` downloads the public-domain test books. They are not committed.
- `python3 spike/run_spike.py` repeats the browser checklist.

See `DECISIONS.md` and `PROGRESS.md`.
