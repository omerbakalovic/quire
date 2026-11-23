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

## Footnote bugs, pulled forward from Milestone 3 (2026-11-22)

Both parked bugs are fixed in code and covered by `src/reader-page/notes.test.ts` (18 tests, jsdom). The phone check is still to do: `npm run phone-matrix` now ends each notes run with "opening notes raised no page errors".

- Empty anchors. An id on an empty anchor marks where its note starts, not a block. `noteBlock` now reads from that place: the anchor's own note `div` when nothing comes before it there, else the block that holds the first text after the anchor (its paragraph, a heading label, or the paragraph after an empty wrapper), running on through plain paragraphs until the next id. It returns nothing when the only text after the anchor is someone else's heading. The fixture's `en-empty` now gives exactly "This paragraph follows an empty anchor." for both the semantic and the `<sup>` link.
- Background reads of notes in another file stay on `section.load()`, foliate's loaded copy, because it has the image URLs rewritten to blobs. That copy is safe for empty anchors: foliate re-serializes XHTML with `XMLSerializer`, which writes `<a id="n1"></a>`, so the text/html parse keeps it empty. Raw XHTML parsed as text/html would not (a test shows the wrong note for `n1`). An earlier version of this branch switched to `createDocument()`, which dropped those images; review caught it and it is reverted.
- The 67 `doc is null` errors. Reproduced in headless Chromium with the pinned foliate and its `footnotes.js` (Chromium's wording is "Cannot read properties of null"): opening the nine fixture noterefs the way the M1a spike did raised no errors until the hidden popup views were removed, then 131. Each note opened a hidden `<foliate-view>`. Removing it without `close()` left its paginator's ResizeObserver, `fonts.ready` and layout callbacks running against the removed iframe, whose `contentDocument` is null. Calling `close()` first cut that to 2. The app no longer builds those views: `NotePopup` reads the note's HTML itself and shows it in a sheet. In the same harness, 64 note opens through `NotePopup` (eight rounds of the eight note links) raised no errors. The spike still uses `FootnoteHandler`; its numbers are history, not app behaviour.
- Seen while testing, not a note bug: about one in six headless opens of the fixture raised one `Cannot destructure property 'style' of 'el'` from `paginator.js` during the first `goTo`, before any note was touched. Watch for it on the phone.

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

M1a is proven on the Xiaomi 15T and recorded below. Do not start M1b until that work is asked for. M1b is import, flow modes, taps, the paginator patch, the book matrix, the lifecycle test, and the IDPF sample downloads. Empty-anchor notes and the 67 `doc is null` errors were later fixed on `claude/project-thread-q5b6uf`; see the footnote section above.

## Milestone 1 split

M1a is the loopback module, the `bookUrl` seam, a range-versus-blob comparison on the phone, and CSP plus DRM on that open path. M1b is import, flow modes, taps, the paginator patch, the book matrix, and the lifecycle test. IDPF sample downloads are M1b. Empty-anchor notes and the 67 `doc is null` errors were later fixed on `claude/project-thread-q5b6uf`; see the footnote section above.

`test-books/mine/` exists for 1 to 3 personal EPUBs. The books are gitignored. `.gitkeep` is tracked. M1a does not read that folder. M1b waits for the files instead of dropping the row.

## Where the code is

The M1a phone numbers below are from the in-app loopback, not from `scripts/serve-books.mjs`. Do not `adb reverse` port 8765 for this work. Metro for a debug launch is `npx expo start --host localhost --port 8081` with `adb reverse tcp:8081`. The reader page itself is bundled into the APK by `npm run reader` and copied again out of assets when the loopback server starts.

| Path | Role |
|---|---|
| `modules/quire-loopback/` | Kotlin Expo module. `package.json` sets `expo.autolinking.nativeModulesDir` to `./modules`. Gradle project `:quire-loopback`. |
| `HttpRange.kt`, `Routes.kt`, `LoopbackServer.kt` | Range parser, token routes, socket server. Main sources compiled. |
| `QuireLoopbackModule.kt` | JS API: `start`, `registerIfPresent`, `bookUrl`, `readerUrl`, launch check, ready/go/first/turns files, `appendNote`. |
| `src/renderer/book-url.ts` | The only app import of that module. Callers use `bookUrl(id)`. |
| `src/reader-page/open-book.js` | Range reader (`size` + `readUint8Array`) or a full blob. Builds an EPUB object and passes it to `view.open`. Vendored foliate is not patched. |
| `src/reader-page/entry.js` | One check per launch. Posts `first`, waits for `continue`, then turns only for `large` + `range`. Report POST is relative `report`. |
| `src/app/index.tsx` | Starts the server, registers one pushed file, waits for `quire-go`, then `quire-turns`. |
| `src/renderer/device-checks.ts` | `frankenstein-range`, `frankenstein-blob`, `large-range`, `large-blob`, `scripted`, `drm`, `font`. |
| `src/domain/entry-names.ts` | M1b skip rule, tested, no import UI. |
| `plugins/withReaderAssets.js` | Copies `assets/reader/index.html` to `quire-reader/reader.html` and `reader.js` into the APK. `index.html` now loads `reader.js` with a relative URL. |
| `android/app/build.gradle` | Same copy task, already applied. `android/` is gitignored, so a fresh prebuild depends on the plugin. |

The server binds `127.0.0.1` only. Token is 16 bytes from `SecureRandom`, hex. Routes are `/{token}/reader.html`, `/{token}/reader.js`, `/{token}/books/{id}`, and `POST /{token}/report`. Book ids match `^[A-Za-z0-9_-]{1,80}$`. The request path is never joined onto a disk path. No CORS headers. Range cases are in `HttpRange.kt`. Static files are the two known names, copied from assets into `filesDir` because a compressed asset cannot be seeked.

Checks are selected by the activity extra `quireCheck` or by `files/quire-check`, read before `start()` deletes that file. The host then uses `files/quire-ready`, `quire-go`, `quire-first`, `quire-turns`, and `quire-report.jsonl` under the app files dir (`adb shell run-as app.quire.reader`). One check per force-stopped launch. Memory compares PSS growth of `pg1184-images.epub` with Frankenstein, each from a cold start, for both read modes. There is no 100 MB and no 250 MB pass line. A block cache is added only if one chapter open or one turn issues more than about 20 range requests, and both counts are recorded.

Push `se-frankenstein.epub` and `pg1184-images.epub` into the app external files dir or `filesDir`. Do not base64 the 81 MB file through JavaScript. Fixtures for scripted, drm, and font go the same way. `registerIfPresent` looks up a plain file name in external files, then `filesDir`.

## What passed before the phone run

- `npm test`: 21 tests passed (`src/domain/*.test.ts`, `src/renderer/*.test.ts`). `tsc --noEmit` passed.
- `:quire-loopback:testDebugUnitTest`: 14 tests, 0 failures. `LoopbackServerTest` speaks HTTP with `java.net.Socket`. Android's unit-test classpath does not have `java.net.http`.

## M1a on the Xiaomi 15T, 2026-11-20

The debug APK with the loopback module installed (`adb` printed `Installed on 1 device`). Books were copied into the app files dir with `run-as`. One force-stopped launch per check. The host wrote `quire-go` after `quire-ready`, then `quire-turns` after `quire-first`. All seven verdicts passed.

PSS is `TOTAL PSS` in KB. Growth is the first page minus ready. Hermes `js_heapSize` was 12,582,912 bytes at ready, at the first page, and at the result, in every check. No block cache: the open counts were 14 and 17, and the busiest turn was 18.

| Check | fetch | open | range reads | full responses | PSS ready | PSS first | PSS growth | Verdict |
|---|---|---|---|---|---|---|---|---|
| frankenstein-range | 59 ms | 389 ms | 14 | 0 | 374,005 | 400,935 | 26,930 | pass, Letter I |
| frankenstein-blob | 47 ms | 120 ms | 0 | 0 | 373,682 | 397,295 | 23,613 | pass, Letter I |
| large-range, 81 MB | 62 ms | 345 ms | 17 | 0 | 373,075 | 400,723 | 27,648 | pass, cover, 124 sections, image 671 px |
| large-blob, 81 MB | 246 ms | 116 ms | 0 | 0 | 373,509 | 398,530 | 25,021 | pass, cover, 124 sections, image 671 px |
| scripted | 43 ms | 143 ms | 8 | 0 | 372,802 | 385,461 | 12,659 | pass, script did not run |
| drm | 113 ms | — | 4 | 0 | 371,415 | 378,026 | 6,611 | pass, refused before open |
| font | 68 ms | 179 ms | 12 | 0 | 369,711 | 382,968 | 13,257 | pass, obfuscation opened, subtle crypto true |

Large-book turns, range mode, same section. `wallMs` includes the hardcoded 100 ms wait.

| Turn | wallMs | relocateMs | range reads |
|---|---|---|---|
| 1 | 606 | 3 | 18 |
| 2 | 102 | 2 | 0 |
| 3 | 103 | 1 | 0 |
| 4 | 103 | 2 | 0 |
| 5 | 116 | 16 | 0 |

The choice is range. The numbers and the iOS server limit are in `DECISIONS.md`.

## Still untested

iOS. Import, taps, flow switching, the 100 ms paginator patch, the book matrix, the lifecycle test, and `test-books/mine/`. The step 5 phone numbers higher up are the computer server on port 8765. They are not these M1a numbers.
