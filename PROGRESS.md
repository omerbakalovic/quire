# Progress

## Done

- Toolchain checked. Node 22.23.5 is installed for this user. JDK 17 and Android platforms 36 and 37 are not installed.
- Expo SDK 58 app scaffolded. Working name and package id are in `src/config/identity.json`. UI strings are in `src/i18n/en.ts`.
- Reader screen loads `assets/reader/index.html` and speaks ping/pong. In Firefox the page answered `{"type":"pong","id":"bridge-1"}`. The React Native WebView round trip has not been run on the phone.
- `npm test`: 10 tests passed. `tsc --noEmit` passed after that.
- Hand-built fixtures: noteref, malformed, DRM marker, and a scripted book. `scripts/download-test-books.mjs` checked the four public-domain files against their pinned SHA-256 hashes.
- Desktop checklist for foliate-js and epub.js is in `DECISIONS.md`. The recommendation is foliate-js. It is not adopted.

## Known gaps

- No JDK 17, and the Android SDK has platform 35 only. SDK 58 needs compileSdk 37 and targetSdk 36.
- iOS is untested. See `DECISIONS.md`.
- The large-book timings in `DECISIONS.md` are desktop Firefox numbers. The phone measurement waits until an engine is confirmed and a development build can be installed.
- The tree has no commit. Milestone 0 is stopped before the engine is vendored.

## Next

- Wait for a yes or no on foliate-js.
- Wait for approval before installing OpenJDK 17 and Android platforms 36 and 37, plus a current cmdline-tools package and a matching build-tools package.
- After both of those: vendor the chosen engine, show one chapter in the app WebView on the phone, re-measure the large book there, then commit.
