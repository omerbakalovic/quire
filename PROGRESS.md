# Progress

## Done

- Toolchain checked. Node 22.23.5 is installed for this user. OpenJDK 17.0.21.1 (Temurin) is at `~/.local/jdk`. Android platforms 36 and 37.0, build-tools 37.0.0, cmdline-tools, CMake 3.30.5, and NDK 27.1.12297006 are under `~/Android/Sdk`. System Java 21 and system Node 18 were left as they were.
- Expo SDK 58 app scaffolded. Working name and package id are in `src/config/identity.json`. UI strings are in `src/i18n/en.ts`.
- Reader screen loads `assets/reader/index.html` and speaks ping/pong. The phone WebView answered the pong and ran the six checks. The raw reports are in gitignored `spike/results/device.json`.
- `npm test`: 19 tests passed. `tsc --noEmit` passed after the WebView allow-list change.
- Hand-built fixtures: noteref, malformed, DRM marker, and a scripted book. `scripts/download-test-books.mjs` checked the four public-domain files against their pinned SHA-256 hashes.
- Desktop checklist for foliate-js and epub.js is in `DECISIONS.md`. foliate-js at `78914aef4466eb960965702401634c2cb348e9b1` is the adopted engine. The scaffold commit is `adbbac3882f7fda396c69ce56bbe35090057bbee`.
- foliate-js has an unstable API, so the app vendors only that pinned commit and talks to it through the reader bridge. The React Native screens do not import the engine.

## Known gaps

- Platform 37.0 is installed as `platforms/android-37.0` (API level 37.0). The phone build is the check that Gradle resolves compileSdk 37 to that directory.
- iOS is untested. See `DECISIONS.md`.
- The large-book timings below are the phone run. The desktop Firefox numbers in `DECISIONS.md` only compare engines. Foliate's turn time includes its internal 100 ms wait, which is not a setting.
- The fixture table is 4000 px wide so it overflows this phone. A 1200 px table fit inside the 1232 px page and did not scroll.

## Milestone 3, not this step

- Our own note extractor has to handle the empty-anchor case: take the nearest enclosing `li`, `p`, `aside`, or `div`, and stop at the next note boundary. Do not trust foliate's output for that case. With detection off, the semantic empty anchor came back empty. With detection on, the plain empty anchor came back as the rest of the endnotes file.
- Find the cause of the 67 `doc is null` errors when opening notes, so they do not hide a real error later. The running theory is that the footnote popup builds a detached view and calls `goTo` before layout, or that removing the popup on render races the paginator. Not investigated in this step.

## On-device results, Xiaomi 15T, 2026-11-19

The debug APK installed once the phone was unlocked and awake (`adb install` printed `Success`). USB debugging and Install via USB were already on. HyperOS still opens a Security screen, also titled Install via USB, and the first attempt ended as `INSTALL_FAILED_USER_RESTRICTED: Install canceled by user` when that screen was not confirmed. The app package is `app.quire.reader`.

The first launch blocked chapter `blob:` URLs, so the suite never posted. `src/renderer/webview-allow.ts` now allows the loopback page, `about:blank`, and `blob:` URLs, and refuses other origins. After a relaunch the suite posted six reports.

| Check | Result | Phone evidence |
|---|---|---|
| Bridge | ran | WebView loaded `http://127.0.0.1:8765/reader.js` and the suite started, which happens only after pong |
| Scripted book | pass | `engineOpened` true, `scriptRan` false, text `SCRIPTED-BOOK-TEXT`, CSP contains `script-src 'none'`. Logcat also showed the inline script refused by that policy. open 75 ms, fetch 8 ms |
| DRM | pass | `engineOpened` false, `kind` `drm`, fetch 12 ms. The engine did not open it |
| Font obfuscation | pass | `engineOpened` true, `kind` `font-obfuscation`, text contains `FONT-OBFUSCATION-TEXT`, `secureContext` true, `hasSubtle` true. open 48 ms |
| Chapter image | pass | one image, drawn width 1, text contains `CHAPTER-ONE-START`, 4 sections. open 79 ms |
| Wide table | pass | The 4000 px table, in scrolled flow, had clientWidth 1231, scrollWidth 4000, scrollLeft 80, and `scrolls` true. pageWidth 1232. The earlier 1200 px table fit this page and did not scroll |
| Large book, 81 MB | measured | fetch 2139 ms, open 136 ms, 124 sections, 84,582,692 bytes. Opening text was empty and the first section had an image 671 px wide, which matches the desktop run opening on the cover |

Page turns on the phone, same section, paginated, five samples. `wallMs` is `next()` and includes the hardcoded 100 ms wait. `relocateMs` is the time until the page had moved, before that wait.

| Turn | wallMs | relocateMs |
|---|---|---|
| 1 | 202 | 0 |
| 2 | 101 | 1 |
| 3 | 103 | 2 |
| 4 | 104 | 3 |
| 5 | 115 | 14 |

Desktop Firefox medians for this book were about 35 ms to open and 101 ms per turn. The phone open, after the file was already fetched, was 136 ms. The phone turn wall times sit on the same 100 ms wait. The move itself was 0–14 ms.

A second full run, after the table was widened to 4000 px, passed the same five checks. The large book fetched in 2098 ms and opened in 124 ms. Its turn wall times were 185, 101, 102, 103, and 115 ms, and the move before the 100 ms wait was 0, 1, 1, 3, and 15 ms.

## Next

- Step 5 is accepted on the phone. Milestone 1 has not started.
