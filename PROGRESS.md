# Progress

## Current checkpoint: 2026-11-23

Source: `m4-bars` at `cec1b25`, integrating the import/library, navigation, footnote and customization work. This checkpoint is 58 commits ahead of the fork's previous `master` (`5417a65`). The sections below preserve results from earlier milestones; their old counts, package ids and next steps are historical, not the current implementation status.

Implemented now:

- Android standalone APK workflow and local build script, with separate Quire and Quire Dev packages; EPUB import/Open/Share, local library and reading-position persistence.
- Contents, progress slider, chapter navigation, jump-back history, footnote sheets and external-link confirmation.
- Layered typography, themes, light controls, bundled/imported fonts, Reading look screen, profile creation/switching/deletion and per-book overrides. Aa edits the active profile when one is selected. Footnote sheets now follow the theme.
- Header/footer information slots and Bare/Classic/Informative presets; editable top bar, quick row and bottom bar. Controls wrap on narrow screens (`cec1b25`). Layout presets affect information bands only.
- Publisher-relative text scaling and a stable anchor for consecutive look changes until navigation, including asynchronous font loading (`863c2ed`, `fdf0b78`).

Remaining work and verification:

- Recheck the latest controls on a device: crowded rows in portrait/landscape, slider dragging, Back pill placement, empty slots and fixed-layout books.
- Recheck profile/book scope, successive font/size/theme changes, restart/rotation/flow restore, Android back order and external-link confirmation. Earlier partial phone runs below do not establish that the latest integrated state passes all of these.
- Page-turn effects are not implemented. Start with the planned Skia capture/performance spike; registry choices alone do not activate effects.
- Theme editing, preset sharing, assignable gestures and the rest of [the customization design](docs/customization.md) remain open. SQLite migration, library folders/tags and later product milestones also remain open.
- iOS is not implemented by the Android-only loopback module and has not been validated.

Validation of this checkpoint on Windows, 2026-11-23 (Node 22.17.0, using the existing local dependencies):

- `npm test`: 152 tests, 148 passed, 4 skipped, 0 failures. The skips are the four optional downloaded-book checks; downloaded and personal books were not included in the verification checkout.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `npm run reader`: passed, bundling pinned foliate-js `78914aef4466` and its build-time patch.
- `git diff --check`: passed. No new APK build, native unit-test run or device matrix was performed for this documentation checkpoint; use the Android APK workflow for the new commit's build result.

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

Desktop Firefox medians for this book were about 35 ms to open and 101 ms per turn. The phone open, after the file was already fetched, was 136 ms. The phone turn wall times sit on the same 100 ms wait. The move itself was 0-14 ms.

A second full run, after the table was widened to 4000 px, passed the same five checks. The large book fetched in 2098 ms and opened in 124 ms. Its turn wall times were 185, 101, 102, 103, and 115 ms, and the move before the 100 ms wait was 0, 1, 1, 3, and 15 ms.

## Milestone 4, started (branch `m4-customization`, off the Milestone 2 branch)

Follows `docs/customization.md` (PR #4). First slice, cloud only, not yet on the phone:

- Settings registry (`src/settings/registry.ts`): typed entries for font size, font family (book's, serif, sans, mono), line height, paragraph spacing, alignment, hyphenation, the publisher-styles switch, side margin, max line width, theme, and page-turn style. Each declares its layers and whether it repaginates. Unknown keys and bad values are dropped.
- Layers (`src/settings/layers.ts`): session, this book, active profile, global, default. Setting a value equal to the layers below clears the override, so no stray per-book values pile up. `sourceOf` says where a value comes from.
- Saved customization (`src/settings/customization.ts`), stored in the library index as `custom`: global values, named profiles with one active, per-book overrides. Removing a book forgets its overrides.
- Themes (`src/settings/themes.ts`): Light, Paper, Gray, Dark, Black, Night, High contrast as tokens, with WCAG contrast checks. All pass 4.5:1 except Night, which is deliberately dim and passes 3:1.
- Reading CSS (`src/settings/reading-css.ts`): only settings moved off "book's" are forced; publisher styles off forces Quire's values everywhere. Dark themes override every element's colour; light themes keep a book's coloured callouts. Chosen families carry a CJK, Arabic, Hebrew and symbol fallback chain.
- Reader page: `look` message restyles live; a typography change returns to the same CFI after two frames, as a flow change does. The page behind the book follows the theme.
- Quick panel (Aa in the bottom bar): size, font, theme swatches, line spacing, margins, alignment, hyphenation, publisher styles, "All books / This book" scope with a dot on overridden settings, and reset.
- `npm test`: 97 tests, 93 pass, 4 skipped. `tsc --noEmit` passes. Desktop Chromium: a look sent at open and a live change to Dark, serif, 150%, 1.8 line height, justified, 10% margins applied inside the book frame (24 px, Georgia, rgb(222,220,214) on rgb(31,31,33), justify), and the reader stayed at the start of chapter 2.

- Reader chrome follows the theme (`src/reader/chrome.tsx`): top and bottom bars, contents panel, Back pill, slider (accent fill and thumb, ticks that change colour where the fill passes), and the status bar icons. The note sheet is the footnote thread's and still uses its own colours; it can read the `--quire-page` variable the page already sets.

- Light (Aa panel): reader brightness (System or 5 to 100 percent, window only, handed back on exit and background), a dimmer veil to 85 percent, and a warm amber veil. Brightness needs one APK rebuild for `expo-brightness`.

- Fonts: four bundled reading fonts under the SIL OFL 1.1 (Literata, EB Garamond as "Garamond", Atkinson Hyperlegible as "Atkinson", OpenDyslexic), regular and bold, upright and italic, Latin, Latin Extended, Cyrillic and Greek where the font has them (1.4 MB in `assets/fonts`, licences beside the files; `scripts/vendor-fonts.mjs` rebuilds them from @fontsource 5.3.0). Import your own TTF, OTF, WOFF or WOFF2 from the Aa panel ("+ Add font"); long press an imported font to remove it, and settings that chose it go back to the book's fonts. The loopback server gained a `fonts/` route (bundled files copied out of the APK once per install, imported ones from `files/quire-fonts`); the reader page fetches a font only once it is chosen and gives the book a blob: URL, so the book's CSP is unchanged. Imported files are checked by their signature, capped at 8 MB, and stored under an id, never their own name. Needs an APK rebuild. Desktop Chromium: Literata at open, then a live switch to OpenDyslexic, both loaded inside the book frame, and the reader stayed at the start of chapter 2.

- Look changes keep the place (phone run 9 fix): the first change's anchor is kept until the reader turns, swipes, scrolls or jumps, so five Aa changes in a row no longer walk the page backwards, and quick overlapping changes share the anchor. The page waits for new fonts before going back. Desktop Chromium on Moby-Dick: seven changes (size, Serif, Literata, OpenDyslexic, Garamond, back to 100%) sent in pairs 30 ms apart all kept the anchor on screen and came back to the exact CFI; the old page drifted a page early. Pages, Scroll, Pages twice still lands on the exact CFI.
- Phone matrix `add-font` command (debug builds): imports a font the host copied into `files/quire-cmd-fonts/` with run-as, since the system picker can't be driven by taps.

- Gestures (3.5): the left, middle and right taps, a swipe up or down (Pages mode) and a two-finger tap each run an action from one catalog: nothing, previous or next page, show the controls, Contents, Aa, previous or next chapter, Pages or Scroll, back to library. Set on Reading look, for all books or a profile. A sideways swipe always turns and a long press always selects. The page turns pages itself and hands the rest to the app. Reading look warns when no gesture shows the controls. Desktop Chromium with touch emulation: each gesture ran its action, a sideways swipe still turned, and a swipe up in Scroll mode scrolled instead. Volume keys need a native key hook and come later.
- Battery and time left (3.3): new header and footer elements. Battery shows the level, or "Charging" with it, through `expo-battery` 58.0.4 (MIT, Expo), read only while a slot shows it; it needs an APK rebuild and shows nothing on an older one. Time left in the chapter and in the book come from this session's reading speed: the median of recent one-page forward turns in Pages mode, leaving out skims under 4 s and breaks over 10 minutes. It shows after three such turns. Milestone 7 keeps speed across sessions. The Informative preset now has the clock and battery at the top right and time left in the chapter with the percent at the bottom right.
- Page-turn styles, first slice (5.3, 5.4): the snapshot overlay engine with Fade and Slide as turn packs (a manifest and one SkSL function each, `src/turns/packs.ts`), on `@shopify/react-native-skia` 2.14.0 with `react-native-reanimated` 4.7.1 and `react-native-worklets` 0.13.0, the versions Expo SDK 58 pins. The app takes a picture of the page 300 ms after it settles (Skia's `makeImageFromView`). On a tap, the page asks the app first, the app puts the picture up, and the page turns underneath on "turn-go", or by itself after 150 ms. The shader then draws the old page away. A tap during an animation ends it and turns at once. Pages mode only. Reduce motion turns it off unless the reader opts back in. Page-turn length is 120 to 1200 ms. Reading look now shows the Page turns group. Both packs compile in CanvasKit (Skia for the web) in `npm test`, which also draws them to check their motion. The handshake runs on desktop Chromium: 17 ms from ask to relocate with an answer, and a turn without one. Swipes are not animated yet. Capture time, first-frame latency, frame times and APK size still need measuring on the emulator and the phone. Needs an APK rebuild.

Since this first slice, the themed note sheet, profile UI, registry-generated Reading look screen, information slots and control rows have been integrated. The Skia spike and page-turn styles remain outstanding; see the current checkpoint above.

## Milestone 2, in progress (branch `claude/project-thread-xehbd9`, off `m1b-import-reading`)

Android only; iOS is out of scope. Footnotes and `note-popup.js` are left alone (a separate fix is in flight).

Built, cloud only, not yet run on the phone:

- Position: every relocate now carries `sectionIndex` and `sectionFraction` next to the CFI and book fraction, and the library saves all four. Restore tries the CFI when it resolves to the saved section, then the saved section plus offset, then the book fraction, then the start of the text (`src/domain/position.ts`, `restoreTarget` in `src/reader-page/jumps.js`). The `opened` message reports which one was used as `restoredFrom`. M1b rows without a section still parse.
- Back stack: TOC entries, the slider, the chapter buttons, and internal book links each push where the reader was (`src/reader-page/back-stack.js`, 30 levels). A "Back to ." pill shows the chapter it returns to and how many levels remain, with a dismiss button. Android back closes a note, then the contents, then steps back one jump level, then returns from a note's "Go to note" (M1b's foliate-history back), then leaves the book. Jumps move through `view.renderer.goTo`, not `view.goTo`, so they never add to foliate's history and the two stacks do not replay each other. The note popup's own "Back to text" chip is unchanged.
- Phone run 7 (Xiaomi 15T, 2026-11-23, partial): quick matrix 123/123, Contents panel and Back pill passed. Three slider bugs were fixed afterwards: � did nothing on a chapter's first page, because foliate's relocate `fraction` is the END of the visible page, so the first page already read as inside the chapter. Relocate now also sends `startFraction` and a `sectionFraction` taken from the paginator's page count, and chapter logic uses those. Ticks now go one TOC level deeper when the top level has fewer than 8 entries (Frankenstein's volumes). The Back pill hides while the slider is dragged, so the preview no longer covers it. Back-key order, restore and the web-link confirm are still to check on the phone.
- Contents panel (`src/reader/TocPanel.tsx`): nested, the current chapter marked and scrolled into view, entries that do not resolve are disabled.
- Progress slider (`src/reader/ProgressSlider.tsx`): top-level chapter ticks, a chapter and percent preview while dragging, a jump on release, and adjustable accessibility actions. Previous/next chapter buttons sit either side. Previous goes to the start of the current chapter first.
- External links: only `http`, `https`, and `mailto` are offered, after a confirmation that shows the host or address. Other schemes, spaces, control characters, and `user@host` URLs are refused (`src/domain/links.ts`).
- `npm test`: 76 tests, 72 pass, 4 skipped (test books not downloaded). `tsc --noEmit` passes.
- Desktop Chromium smoke run of the bundled reader page on `noteref.epub` and `malformed.epub`: TOC entries came back with sections and fractions, a TOC jump and a slider jump each pushed the stack (depth 1, then 2), two backs returned to the exact CFIs, a CFI past the spine with a saved section restored into that section (`restoredFrom: section`), and a good CFI restored exactly.

Still to do for M2:

- Phone checks: restart, rotation, flow switch and back-stack behavior on the Xiaomi 15T, plus the phone matrix (the bottom bar is taller now, two rows).
- Move the library index to SQLite with migrations (needs `expo-sqlite` and a native rebuild).
- The reader screen is about 490 lines. Split it after M1b merges, to avoid conflicts with that branch.
- Reopening a book in the same page logs `Cannot read properties of null (reading 'destroy')` from foliate's `Paginator.destroy`. Seen on desktop; it is caught and the next book opens. It predates M2.
- Fragment TOC entries inside one file share that file's start fraction, so ticks and the highlight fall back to the engine's own TOC item for those.

## Historical next step after M1a

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
| drm | 113 ms | - | 4 | 0 | 371,415 | 378,026 | 6,611 | pass, refused before open |
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

## Historical untested list after M1a

iOS. Import, taps, flow switching, the 100 ms paginator patch, the book matrix, the lifecycle test, and `test-books/mine/`. The step 5 phone numbers higher up are the computer server on port 8765. They are not these M1a numbers.
