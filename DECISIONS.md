# Decisions

## Stack

Expo SDK 58 with TypeScript, a development build, and `react-native-webview`. One codebase for Android and iOS. The book will render in a WebView because both candidate engines are JavaScript.

Flutter and a pair of native apps were set aside. The hard work is pagination, CFI, footnotes, and user CSS, and that work already lives in JavaScript. Readium's mobile toolkits are separate Kotlin and Swift codebases, so they do not fit this app. Readium's user-style approach can still be borrowed later.

Navigation is Expo Router. Zustand is not added yet. There is no session state shared across screens. SQLite is not added yet. The first tables arrive with saved position.

The browser checklist is done. The adopted engine is recorded under Engine pick.

## Engine pick

Adopted: foliate-js, pinned at `78914aef4466eb960965702401634c2cb348e9b1` (1 May 2026). The scaffold this pick sits on is commit `adbbac3882f7fda396c69ce56bbe35090057bbee`. Only that commit is vendored. The React Native screens do not import the engine. They talk to the WebView through the typed bridge.

Reasons, from the desktop checklist below:

- It classifies noterefs and can extract the note, with aggressive detection off by default. epub.js has no note API, so a note popup there would be new code.
- It opened every real book in the set. The 81 MB illustrated Monte Cristo opened in 35 ms. epub.js opened that file in 384 ms, and one Frankenstein turn stalled for 8 seconds.
- The failures it does have stay outside the engine. Empty anchors come back wrong, and its default frame runs scripts. The app supplies a Content Security Policy and refuses DRM in `classifyEncryption` before `open`.

The desktop timings only compare the engines. They are Firefox 149, headless, at 400×640. They are not the phone numbers. foliate's turn samples include a hardcoded `wait(100)` in `paginator.js` `#turnPage`. That wait is not a setting. It is skipped only when the `animated` attribute is set and the turn stays in the same section. The same attribute runs a 300 ms ease-out when the scroll is smooth, which page turns are. The phone run records the wall-clock `next()`, which includes the 100 ms, and the time until the relocate event, which is the turn without that wait.

## App identity

The working name is Quire. The working package id is `app.quire.reader`. Both live only in `src/config/identity.json`. `app.config.ts` reads that file, and `src/config/identity.ts` re-exports it for the app. They are not final.

UI copy is English, in `src/i18n/en.ts`.

Orientation is unlocked. The template's portrait lock would get in the way of later rotation tests.

## Toolchain

Checked against Expo's SDK reference for 58.0.0 and `npm view expo@58.0.26 engines`, and against React Native's environment setup for the 0.88 line that SDK 58 uses.

| Need | Required | On this machine |
|---|---|---|
| Node | 22.13.x, or 24.3+, or 26+. Odd releases are not supported. | System Node is 18.19.1. User-local Node 22.23.5 is installed at `~/.local/node`. The system Node was left as it was. |
| JDK | 17. React Native's setup page says higher versions may cause problems. Expo's Linux instructions say OpenJDK 17. | Java 21 JRE only, plus Java 8. No `javac`. No JDK 17. |
| Android SDK | compileSdk 37, targetSdk 36. | `~/Android/Sdk` already has platform 35 and build-tools 34 and 35 (about 608 MB). Platforms 36 and 37 are missing. The installed cmdline-tools warn that they do not understand current SDK XML. |
| Device | A phone over USB. | Xiaomi 25069PTEBG (`goya`), Android 16, API 36, serial visible to `adb` as `device`. |
| Watchman | SDK 55 and earlier only. | Not installed. Not required. |
| iOS | Xcode 26.4 or newer for SDK 58. | No iOS toolchain. |

A local dev build is the better route. The phone is already authorized, and a partial SDK is already on disk. EAS can produce the first development build without those SDK packages, and it needs an Expo account plus a cloud rebuild for every later native change. Daily work after the first build is a USB install and Metro, which the local SDK serves.

JDK 17, platforms 36 and 37.0, build-tools 37.0.0, CMake 3.30.5, and NDK 27.1.12297006 are installed for this user. `expo-modules-core` compiles a native library with CMake, so the NDK and CMake are part of the build. The only SDK license used is `android-sdk-license`, which was already accepted on this machine. No other license was accepted. System Java 21 was not changed.

### The M1b build PC

M1b builds and phone runs happen on a Windows PC with the phone on USB. The repository path plus react-native-gesture-handler's generated CMake paths pass Windows' 260-character limit. Three settings fix it together: `LongPathsEnabled` = 1 in the registry, `git config core.longpaths true`, and `cmake.dir` in `android/local.properties` pointing at SDK CMake 4.1.2. The SDK's CMake 3.22.1 and 3.30.5 ship ninja 1.10.2, which ignores the long-path setting and fails on a 316-character path. CMake 4.1.2 ships ninja 1.12.1, which works. Delete `android/app/.cxx` after changing `cmake.dir`. `android/` is gitignored, so this is per machine.

## Dependencies

Kept from the Expo SDK 58 default template, because the router needs them: `expo`, `expo-router`, `expo-constants`, `expo-linking`, `expo-splash-screen`, `expo-status-bar`, `react`, `react-native`, `react-dom`, `react-native-web`, `react-native-screens`, `react-native-safe-area-context`. All are MIT and current with SDK 58. `react-native-web` stays so the bridge page can be opened in a browser. `react-native-safe-area-context` is a required peer of Expo Router.

Removed from the template because the demo screens were the only users, and Expo Router marks them optional: `@expo/ui`, `expo-device`, `expo-font`, `expo-glass-effect`, `expo-image`, `expo-symbols`, `expo-system-ui`, `expo-web-browser`, `react-native-gesture-handler`, `react-native-reanimated`, `react-native-worklets`. The last three are still installed: npm installs them as peers of `expo-router`, and autolinking puts them in the native build. That was already true of the M1a build. The app does not import them.

`expo-document-picker` 58.0.5 (MIT, Expo) opens the system file picker for import. It is called with `copyToCacheDirectory: false`, so the picker hands over a `content://` URI and the native module copies the bytes once, straight into the library.

`expo-asset` (MIT, Expo, 58.0.21) loads the reader HTML as an app asset.

`@types/node` 22.20.5 is a devDependency only. The domain tests and `app.config.ts` import Node built-ins, and TypeScript 6 does not load those types unless `node` is listed. It is MIT, from DefinitelyTyped, and it is not shipped in the app.

`react-native-webview` 14.0.1 is the host for the reader page. MIT, maintained as the community WebView. `expo install` selected this version for SDK 58.

epub.js stays out of the app. The spike used the published `epubjs@0.3.93` package, which is FreeBSD-licensed. foliate-js is MIT, has no release, and its author says the API can break. The app vendors the pinned commit under `vendor/foliate-js` and does not track upstream. `esbuild` 0.28.2 (MIT, devDependency, maintained by Evan Wallace) bundles that pin into one classic script. The Android WebView loads the reader page as a script file, and the engine's source is a graph of ES modules with dynamic `import()`. PDF, MOBI, comic, and FB2 are not in the bundle.

## Reading position and scroll

v1 scroll mode is vertical scrolling inside the current chapter. Whole-book continuous scroll is P2. The checklist records what each engine does at a chapter boundary.

Milestone 2: the saved position is the CFI plus a fallback of spine index and the offset inside that section, plus the book fraction. Progress is foliate's fraction, which is cumulative over the uncompressed byte size of linear sections. That is a stand-in for cumulative text length: it does not change with font or layout, which is what the spec needs, but markup-heavy sections weigh a little more than their text. Counting text would mean loading every section on open; not worth it until a book shows a visible skew. Page numbers from a `page-list` stay a separate label.

The back stack is Quire's own (`src/reader-page/back-stack.js`), not foliate's `History`. foliate pushes on every `goTo` and rewrites the current entry as pages turn, and its entries are private, so the host could not show where Back goes or how deep it is. Jumps push before they move, and only when the move succeeds and lands somewhere new. The note popup keeps foliate's history for its own chip; merging the two is left for the footnote work.

The progress slider is a PanResponder over a measured track, not `@react-native-community/slider`, to avoid a native dependency for one control and to draw chapter ticks and the preview bubble ourselves.

## iOS is untested

Milestone 0 does not run on iOS. There is no Xcode on this machine. These WebKit risks are known and unchecked:

1. foliate-js documents WebKit bug 218086. WKWebView needs `allow-scripts` on the book frame, which makes the iframe sandbox useless. A Content Security Policy has to do the blocking. Android's WebView is Chromium, so this bug may not apply there. iOS is the platform it applies to.
2. IDPF font deobfuscation uses Web Crypto SHA-1. That API requires a secure context. A `file://` or non-secure WKWebView page can fail to deobfuscate publisher fonts unless the app supplies its own SHA-1.
3. foliate-js has an open report that on iOS a text-selection gesture is handled as a swipe to the next page.
4. Both engines paginate with CSS multi-column. WebKit and Blink disagree on column breaks, image sizing, and viewport units. A page that is correct on the Android phone can be wrong on iOS.
5. WKWebView is stricter about ES module imports and `blob:` URLs from local files. The loader that works in Firefox and in Android WebView can fail on iOS.
6. iOS overscroll can take the gesture that should cross a chapter boundary.
7. Safe-area and toolbar inset changes resize the page. A saved CFI can be correct and still show a different screenful of text after a rotation or a status-bar change.

## Security of book content

The reader page's own policy allows its bundled script and blob frames. Book HTML gets a second policy, `script-src 'none'`, inserted before any script in the chapter. foliate serves chapters as `application/xhtml+xml`, and a meta policy is ignored in an XML document, so the bridge rewrites those responses to `text/html` before the iframe loads them. Script tags are left in the file. The scripted fixture is the proof: the chapter text shows, and `data-script-ran` stays unset. External script resources are also refused on the loader's `load` event.

A `<link rel="stylesheet">` pointing at a blob URL does not load under that book policy. The bridge reads the blob from the parent page and inlines the CSS, which `style-src 'unsafe-inline'` already allows. Publisher rules stay in force. A table wider than the page is wrapped in `.quire-table-scroll` (`overflow-x: auto`, `max-width: none` on the table). See "Wide tables" below for paginated flow.

`classifyEncryption` runs in the React Native side before `view.open`. IDPF and Adobe font obfuscation are allowed. Any other algorithm is DRM. The DRM fixture's chapter bytes are still plaintext, so an engine that ignores `encryption.xml` will still show the text. The page only extracts `META-INF/encryption.xml` with zip.js and waits for the decision.

The step 5 phone proof served the reader page and the books from `127.0.0.1:8765`, forwarded with `adb reverse`. M1a serves that same origin from the in-app loopback and does not reverse port 8765. The 81 MB file is not packed into the APK. `plugins/withLocalCleartext.js` allows cleartext only for `127.0.0.1` and `localhost`, which is also a secure context, so Web Crypto SHA-1 can run for font obfuscation. `allowUniversalAccessFromFileURLs` stays off.

## Test books

Hand-built fixtures are generated by `scripts/build-fixtures.mjs` and committed as source plus the built EPUBs. Public-domain books are downloaded by `scripts/download-test-books.mjs`, checked against pinned SHA-256 hashes, and gitignored. Tests that need those files skip when the files are absent.

Gutenberg's own host returned 503, so the script uses `gutenberg.pglaf.org`. Standard Ebooks needs `?source=download` on the EPUB URL. The bare URL is an HTML interstitial.

The six IDPF EPUB 3 samples come from the final release of `IDPF/epub3-samples` (tag 20230704) and are CC-BY-SA 3.0. Their hashes are pinned. A download that stalls for 60 seconds is aborted, so one slow host does not hang the script.

`test-books/mine/` holds personal books for the phone runs and is gitignored. The M1b run used the two Power Moby-Dick editions (foot and link), whose notes are licensed for personal use only. They are never committed.

## Engine comparison

Desktop only, Firefox 149, headless, 400×640. These timings compare the engines. They are not the phone numbers. After a pick is confirmed, time to first page and page-turn time for the large book get measured again inside the app WebView on the phone.

foliate-js is pinned at `78914aef4466eb960965702401634c2cb348e9b1`. epub.js is the published `epubjs@0.3.93` build, with JSZip loaded first because that build expects `window.JSZip`. The raw checklist is `spike/results/checklist.json` and is gitignored.

Recommendation, not yet adopted: foliate-js. It already classifies noterefs, including the default that leaves aggressive detection off, and it can extract the note. epub.js can open the same books and turn pages, and it has no note API. A note popup on epub.js would be new code. foliate still has note bugs, and its default settings run script inside the book, so the app has to supply a Content Security Policy before any book is shown.

| Check | foliate-js | epub.js |
|---|---|---|
| Opens the noteref fixture and reports a CFI | Yes, 28 ms | Yes, 118 ms. `srcdoc` loading worked |
| Same-file footnote, two paragraphs | Yes | No extractor. `footnoteApi` is false |
| Cross-file endnote | Yes, type `endnote` | `display()` of the href shows the whole endnotes file |
| Note with a link and an image | Yes, 1 image and 2 links | No extractor |
| Note that contains another noteref | Text extracted. Chaining is not built | No extractor |
| Plain `<sup>` link, detection off | Not treated as a note | No classifier |
| Plain `<sup>` link, detection on | Extracted | No classifier |
| Numeric link that is not a note, and a chapter link | Not treated in either mode | No classifier |
| Empty anchor, semantic noteref | Treated as a note. Extracted text is empty | No extractor |
| Empty anchor, heuristic | Treated only when detection is on. The text includes the following paragraph and the rest of the endnotes file | No extractor |
| User style beats publisher `!important` | Georgia, `rgb(0, 0, 128)` | Same |
| Image and SVG | Chapter image is 1×1. Chapter 2 SVG renders. The table kept its declared width | Same |
| Scripted fixture | The embedded script ran. `data-script-ran` became `yes` | The embedded script did not run |
| Malformed book | Title missing. The readable chapter is shown | Title empty. A resource-rewrite error is logged for the missing cover. The readable chapter is shown |
| DRM fixture | Plaintext chapter is shown. The app must refuse first | Same |
| Scroll mode at a chapter boundary | From the end of chapter 1, `next()` loads chapter 2 at `CHAPTER-TWO-START`. The next chapter is not already in the scroll | Scrolling the iframe did not change the reported CFI, which stayed at the start of chapter 1. One `next()` then loaded chapter 2 at `CHAPTER-TWO-START` |
| Flow switch | Kept the same CFI when set to `scrolled` | Kept the same CFI |

Real books, still desktop Firefox:

| Book | foliate open | foliate turns | epub.js open | epub.js turns |
|---|---|---|---|---|
| Frankenstein (Standard Ebooks, 38 sections) | 26 ms, first text is Letter I | 100–102 ms, median 101 | 118 ms, first spine item is the title page | 66–76 ms, then one turn timed out at 8 s |
| Pride and Prejudice (17 sections) | 30 ms, cover, no body text | 99–131 ms, median 100 | 119 ms | 66–88 ms, median 83 |
| War and Peace (367 sections, 1.8 MB) | 32 ms, cover | 100–129 ms, median 101 | 118 ms | 60–79 ms, median 67 |
| Monte Cristo with images (124 sections, 81 MB) | 35 ms, cover | 100–127 ms, median 101 | 384 ms | 66–69 ms, median 67 |

foliate's turn samples sit on a 100 ms wait inside its paginator when animation is off. Gutenberg books have no bodymatter landmark, so foliate's text-start open stays on the cover. Standard Ebooks Frankenstein does have one, and foliate opened on the letter. The first semantic noteref in that file is spine index 15, past the 12-section scan, so the scan shows nothing for either engine. The fixture is the note evidence.

The phone WebView re-measures the large book after this pick. Those numbers are recorded in `PROGRESS.md` next to this table. Desktop samples stay comparison-only, and the foliate turn column includes the 100 ms paginator wait.

## Loopback book URL

The installed app serves the reader page and the books from `modules/quire-loopback`, our own Kotlin Expo module. No NanoHTTPD, Ktor, or `react-native-static-server`. React Native cannot listen on a socket, and the surface is one loopback GET with ranges.

Book bytes are not copied into a byte array and are not sent across the React Native bridge. JavaScript registers a file name and later receives a URL. The WebView fetches it. `bookUrl(id)` in `src/renderer/book-url.ts` is the only function that names a book. A later Android `WebViewAssetLoader`, or an iOS `WKURLSchemeHandler`, replaces the module behind that function.

`file://` and a custom scheme are not secure contexts, so font deobfuscation would lose `crypto.subtle`. `react-native-webview` 14.0.1 does not expose `shouldInterceptRequest`. The origin stays `http://127.0.0.1` on an ephemeral port. Cleartext stays limited to `127.0.0.1` and `localhost`.

iOS is still untested. A further limit, separate from the seven WebKit risks above: a loopback server dies when iOS suspends the app, and background time is short. An iOS build must not copy this server. The `bookUrl` seam is the replacement point.

`view.open(url)` still downloads the whole body (`vendor/foliate-js/view.js`). That path is not patched. The reader page builds a zip.js reader and passes an already-built EPUB object to `view.open`. Vendored zip.js has no `HttpRangeReader`. The reader supplies `size`, `readUint8Array`, and the `readable` stream `getData` assigns an entry offset onto. Without `readable`, `getData` throws `TypeError: Cannot convert undefined or null to object`. The bytes from `readUint8Array` own their buffer, because zip.js wraps `e.buffer` in a `DataView`.

## Choice: range reads

`ZipReader` accepted that reader on the Xiaomi 15T. Every ranged response was 206 (`fullResponses` 0). The shipping open path is range. The blob path stays in the check harness so both number sets can be repeated. The 100 ms paginator wait was patched in M1b, as a separate file against the pinned commit, applied at bundle time. `paginator.js` stays the pinned bytes. See "Page turns" below.

PSS is `TOTAL PSS` in KB, from ready (the reader page is loaded and the book is not open) to the first page. Each launch was force-stopped. Hermes `js_heapSize` was 12,582,912 bytes at ready, at the first page, and at the result, in every check.

| Open | fetch | open | range reads | full responses | PSS ready | PSS first | PSS growth |
|---|---|---|---|---|---|---|---|
| Frankenstein range | 59 ms | 389 ms | 14 | 0 | 374,005 | 400,935 | 26,930 |
| Frankenstein blob | 47 ms | 120 ms | 0 | 0 | 373,682 | 397,295 | 23,613 |
| Monte Cristo range, 81 MB | 62 ms | 345 ms | 17 | 0 | 373,075 | 400,723 | 27,648 |
| Monte Cristo blob, 81 MB | 246 ms | 116 ms | 0 | 0 | 373,509 | 398,530 | 25,021 |

The range open of the 81 MB book did not GET the file. The blob open did, in 246 ms. PSS growth stayed in the same band, so the file was not resident as an extra 81 MB. Hermes did not grow in either mode.

Five turns on the large book, range mode, same section. `wallMs` includes foliate's hardcoded 100 ms wait. The first turn issued 18 range reads. The next four issued none.

| Turn | wallMs | relocateMs | range reads |
|---|---|---|---|
| 1 | 606 | 3 | 18 |
| 2 | 102 | 2 | 0 |
| 3 | 103 | 1 | 0 |
| 4 | 103 | 2 | 0 |
| 5 | 116 | 16 | 0 |

A block cache is not added. The open counts were 14 and 17, and the busiest turn was 18.

On the same origin, still through range reads: the scripted book showed `SCRIPTED-BOOK-TEXT` with `scriptRan` false and `script-src 'none'`. DRM was refused before open (`kind` `drm`). The font-obfuscation book opened with `secureContext` and `crypto.subtle` true, and the chapter text contained `FONT-OBFUSCATION-TEXT`.

## Notes are Quire's own code

foliate's `FootnoteHandler` is not bundled. It opened a hidden `<foliate-view>` per note, which raised the M1a `doc is null` errors when those views were removed, and it extracted empty-anchor notes wrong. `src/reader-page/notes.js` classifies and extracts notes, and `note-popup.js` shows the sanitized copy in a bottom sheet over the page. Sections read in the background come from `section.load()`, so images keep their blob URLs. foliate has already re-serialized that copy with `XMLSerializer`, so a self-closed empty anchor stays empty even when the copy is parsed as text/html. The note tests use jsdom, a dev dependency only.

## Known limits

Size caps, when import arrives in M1b, use the sizes a zip declares. A hostile zip can forge those numbers. The WebView read path has no byte cap of its own.

M1b parses metadata natively (see "Import and the library"), so the Milestone 5 directory import does not need a hidden WebView for it.

## Entry names, for M1b import

`src/domain/entry-names.ts` skips an entry only when the stored name has a `..` segment, is absolute, or contains a backslash. It does not percent-decode first. Non-ASCII and percent-encoded names stay, so they can still resolve against manifest hrefs. One skipped entry does not reject the book. Nothing in M1a extracts the archive. `kusamakura-japanese-vertical-writing.epub` is the M1b matrix row for that case. Its URL and checksum are not pinned yet. When M1b downloads the IDPF samples, verify each file's license on the EPUB 3 samples README (CC-BY-SA 3.0 unless that file's table says otherwise) and pin the hash after the download. Do not commit the files.

## Import and the library

Import copies the picked file into `filesDir/books/{id}.epub` in native code, hashing it with SHA-256 on the way. The id is the first 32 hex digits of that hash, so the same bytes imported twice are a duplicate and keep their reading position. The copy is capped at 1 GiB. A file that is not a zip with an OPF is refused as not an EPUB and deleted.

`EpubInspector.kt` reads the container, the OPF, and `encryption.xml` with `java.util.zip`, capped reads, and a `DocumentBuilder` with DTDs and external entities off. It returns title, authors, language, publisher, description, series, and the cover. The cover is downscaled with `BitmapFactory` to about 480 px wide and stored as a JPEG next to the book. React Native classifies `encryption.xml` with the same rule as the reader (`src/domain/import-outcome.ts`). A DRM book is refused, and its copy is deleted unless the same bytes were already in the library.

The series is the `belongs-to-collection` whose `collection-type` is `series`, or an untyped one. A `set` is not a series. Standard Ebooks marks its own imprint as a set, which made every one of its books show "Standard Ebooks" as the series.

The library is one `library.json` in `filesDir`, written whole by rename, one write at a time in the order of the changes. A damaged file reads as an empty library and does not throw. Bad rows are dropped one by one. SQLite replaces this in Milestone 2.

Two debug seams exist for the phone runs and are not in release builds. `files/quire-import` lists file names in the app's external files dir; a debug build imports them on launch and on return to the foreground. `files/quire-report.jsonl` gets one JSON line per library or reader event (import, opened, relocate, flow, note, foreground).

## Page turns

Taps split the page 30 / 40 / 30. The middle shows or hides the controls. A tap on a link, or a tap with text selected, never turns. By default the sides follow the book's direction, so in a right-to-left book the left side goes forward. Settings has one switch to make the right side always go forward. The value is `settings.tapZones` in the library, `reading` or `screen`.

foliate snaps to the nearest page one frame after every touchend. After a tap, that snap raced the turn the tap's click had started and could undo it, which showed as taps that did nothing after a chapter change. A touch that moves less than 10 px is kept from foliate's touchend in the capture phase; swipes still reach it. This is done in `app.js`, not as a foliate patch, because it is about how the app combines taps with foliate's own gestures.

`patches/foliate/paginator-turn-wait.mjs` replaces foliate's fixed `wait(100)` after a turn with one animation frame. The bundler applies it and fails the build unless the text matches exactly once, so a new foliate pin cannot drop it silently.

In a fixed-layout book the page is an iframe scaled down to the screen, so a tap's position inside it is multiplied by the frame's scale before the zone is picked. Without that, a tap in the middle of a scaled page counted as the right side and the controls never showed. Fixed-layout books have no Scroll mode, so the Pages and Scroll switch is hidden for them.

The Android back key closes an open note first. After the reader followed a link, it goes back to where the link was, using foliate's history, the way a browser's back button does. Only when there is nowhere to go back to does it leave the book.

Switching between Pages and Scroll keeps the reader on the same text. The page saves the current CFI, switches flow, waits two frames for layout, and goes back to the CFI. The shift is at most about one screen.

## Page layout

The reader page sets `width=device-width` in its viewport meta. Without it the Android WebView lays the page out 980 px wide and the text is tiny. Pinch zoom is off. Text size is a setting in Milestone 4.

The host passes the system bars' insets to the page as CSS variables (`--quire-inset-*`). The note sheet's buttons and the Back to text chip sit above the navigation bar, and foliate's header and footer band (48 px by default) grows when a bar is taller than it.

Fixed-layout books get no injected styles. foliate's fixed-layout renderer has no `setStyles`, and the app's reading CSS would fight the publisher's page.

### Wide tables

foliate sizes a paginated section from the bounding rectangles of its content. Those include overflow that a scroll wrapper clips, so a 4000 px table added eight blank pages after its chapter. A table that is still wider than its wrapper after layout is moved into a shadow root on the wrapper, with the book's CSS copied in, and the section is laid out again. The table scrolls sideways and the chapter has its real page count. A tap on a link inside such a table is found through the event's composed path. Search and CFIs do not see inside the shadow root; that is acceptable for tables and is revisited with search in Milestone 3.

## Notes

Notes were Milestone 3. They moved into M1b at the owner's request, modeled on Power Moby-Dick: a tap on a note reference opens the note in a sheet on the same page and never jumps away. The app uses its own extractor (`src/reader-page/notes.js`, `note-popup.js`) and not foliate's footnote popup. That also settles the two Milestone 3 items: the empty-anchor case, and the 67 `doc is null` errors, which came from foliate's popup view.

- A capture-phase click listener in each section document runs before foliate's link handler.
- `epub:type="noteref"` and `role="doc-noteref"` are notes unless they point at a chapter. A link in a superscript, or with note-like text such as `[1]`, `*` or `†`, is a note only when its target reads as one. Anything else is a normal link.
- A link with its own id, pointing at a fragment of the book, is a note when the target block links back to that id. This is how hyperlink editions such as Power Moby-Dick's link edition mark notes: `<a id="c001_src0001" href="…#c001_ref0001">` and a note that starts with `<a href="…#c001_src0001">◄</a>`. A cross-reference with no link back stays a normal link. Checking costs one parse of the target file, so past 200 links in a section only the cheaper kinds are counted for "N of M".
- The note is the target's `li`, `p` (with continuation paragraphs), `aside`, `dd`, or `blockquote`. An empty anchor takes its enclosing block, or the blocks that follow it up to the next id.
- Notes in another file are read with `section.load()` and `DOMParser`, and cached.
- The note HTML is rebuilt from an allow-list of tags and attributes, so event handlers never come across. Scripts, styles, frames and forms are dropped with their content. Images keep only `blob:` and `data:image` sources. Back-links are removed: `doc-backlink`, `epub:type="backlink"`, ↩-style text, or a short link back to the reference.
- A note reference inside a note opens that note on top, with Back. A web link goes to the host. A book link closes the sheet and goes there, with a "Back to text" chip.
- Footnote asides that a reference in the same document points at are hidden from the text, so the note is not read twice.
- Previous and Next walk the notes of the section. "N of M" counts a look-alike link only once its target is confirmed as a note.

## Phone matrix

`npm run phone-matrix` runs the book matrix on a phone from one command (`scripts/phone-matrix.mjs`). It replaced hand-written step lists after the first M1b run, where finding buttons on screen and judging screenshots by eye were the slow and fragile parts.

- Debug builds poll `files/quire-cmd/` for JSON commands. The host writes each one under a temporary name and renames it, so a half-written file is never read. The native side reads the folder only when the app is debuggable, and release builds never mount the channel. Answers go to `quire-report.jsonl` as `source: "matrix"` lines.
- The reader page measures what a person would judge from a screenshot (`src/reader-page/probe.js`): visible text and the font size most of it is set in, in dp; the page's layout width against the screen; images and broken images; pages of the chapter with no text and no image; whether a link sits under a tap zone; note references on screen with their positions; and the note sheet's state.
- Input is real: `adb shell input` taps, swipes, the back and home keys, rotation through `settings`, and `am force-stop`. A turn uses the › button only where a link sits under the tap zone, and says so.
- Book ids are the first 32 hex digits of each file's SHA-256, computed on the host, so the script finds books without depending on titles.
- The system file picker is the one step left to a person.

The script was first run against a simulated phone: the real reader page in Chromium behind a stand-in `adb`. That run found the tap and snap race above.

### Making runs short

The first scripted runs took 15 minutes. Most of it was overhead, not checks:

- Every command started a new `adb.exe`, which costs 100 to 300 ms on Windows, and a run sends over a thousand. The script now keeps two `adb shell` sessions open (one plain, one `run-as`) and cuts each command's output out by a marker that carries the exit code. It falls back to one process per command if the open shells do not work. Taps use `cmd input`, which talks to the input service directly instead of starting a Java VM for each tap.
- Fixed sleeps sized for the slowest case became waits on the app's own log lines: a relocate followed by a short quiet period, or a note sheet opening or closing. A turn at the first or last page of the book is not attempted.
- Screenshots come off the phone as raw frames, and the PNG is made on the computer in the background; a phone takes about a second to encode one.
- The app polls for commands every 100 ms instead of 250, and every command has a hard timeout in the app, so one stuck step cannot block the channel.
- `--quick` runs five books (Frankenstein, Arabic, Sous le vent, the noteref fixture, Power Moby-Dick link edition) with their notes and the tap setting, and no lifecycle. That checks a fix in a few minutes; the full matrix is for closing a milestone. `--fresh` is only for import changes, since a reinstall keeps the library.
- The reader page is bundled from the checkout and pushed to `files/quire-dev/` on every run. A debuggable build serves it instead of the APK's copy (`QuireLoopbackModule.materialize`), so reader-page changes need no gradle build; app code already comes from Metro. `--apk-reader` tests the APK's copy. Release builds ignore the folder.

The script also copes with the two things that wasted run 3 and the first try at run 4. When the app stops answering, it checks what is in front: if the app left the foreground (a tap on the navigation bar's Home), it brings it back; otherwise it restarts it. Commands queued meanwhile are dropped, the step that waited fails, and the run goes on. When the phone drops off USB, it waits up to five minutes for it, restores `adb reverse` and goes on. Three stuck steps in a row, or a phone that stays away, end the run early with whatever it got to.

For a blank page, the scan names what starts on it and what runs across it, and the script takes a screenshot of that page.

### Stalls

Runs used to sit silently when something was in the way: the notification shade, an install prompt, a sleeping PC, a phone off USB. Now the script says so at once:

- It prints a heartbeat after 30 s with no output, and keeps `status.json` in the output folder current.
- Before every tap or swipe it checks the window in front through a third open shell, so the check costs no time. While the shade, a prompt or another app is over Quire it pauses, with a `PAUSED` line. It closes the shade itself after a minute, and brings Quire back after 15 s.
- After `--stall-s` (90 s) with no progress it runs `scripts/phone-health.mjs` (also `npm run phone-doctor`), which checks adb, the phone, the screen and lock, prompts, the app, Metro and `adb reverse`. It fixes what a script can, gives up the stuck step and goes on. That is the one retry.
- A second stall before any check passes, a Metro problem, or a problem only a person can fix that is still there after `--wait-you-s`, ends the run. It prints `STALLED` with `NEEDS YOU` or `NEEDS PC` lines and exits with code 3.
- The PC is kept awake while a run is going: a hidden PowerShell holds `SetThreadExecutionState`, and no power settings change. `npm run awake -- <command>` does the same for a build.

### Phone tests on an emulator

The matrix taps a real screen, so a run on Omer's phone keeps him off it. By default it now drives an emulator on the PC. It uses one that is already running, or starts the `quire` AVD without a window on port 5584, waits for the boot and stops it again at the end. Its quick-boot snapshot makes the next start fast, and `--keep-emulator` leaves it running. A missing Quire Dev is installed from `android/app/build`. `--phone` drives the phone on USB, which is kept for a short final pass.

One-time setup with the SDK's command-line tools:

- `sdkmanager "emulator" "system-images;android-36;google_apis;x86_64"`. This is Android 16, like the phone. The debug APK carries x86_64.
- `emulator -accel-check` must report a working hypervisor (WHPX on Windows).
- `avdmanager create avd -n quire -k "system-images;android-36;google_apis;x86_64"`. In the AVD's `config.ini`, set `hw.lcd.width`, `hw.lcd.height` and `hw.lcd.density` to the phone's `wm size` and `wm density`, `hw.ramSize=4096` and `disk.dataPartition.size=8G`.


## Everyday app and dev build

- The everyday app is a release APK (`npm run apk`, or the `Android APK` GitHub workflow) with the JS bundle and reader page inside, so it opens from the launcher with no Metro. It is signed with the Expo template's debug key: fine for sideloading, to be replaced before any store upload.
- Debug builds get `applicationIdSuffix ".dev"` and the name "Quire Dev" (`plugins/withDevVariant.js`). Both apps install side by side, and the phone matrix (`PKG = app.quire.reader.dev`) never imports test books into, or clears, the reader's own library. `npm run android` passes `--app-id app.quire.reader.dev` so Expo launches the right package.
- Release builds ignore `files/quire-check` and the `quireCheck` extra, and write no `quire-report.jsonl`. The phone checks and matrix stay debug-only.
- "Open with" and Share for `application/epub+zip` (`plugins/withOpenBooks.js`): VIEW, SEND and SEND_MULTIPLE filters on MainActivity. `takeIncomingBooks()` returns the launch intent's books once (not when reopened from Recents) plus any from `OnNewIntent`, which also fires `onIncomingBooks`. The library imports them through the same path as the picker; a single book opens in the reader right away. `src/app/+native-intent.tsx` sends the content:// URL to the library so the router never shows "unmatched route".

## Library look

- The shelf's look lives in `library.look` (`src/domain/library-look.ts`), apart from the book rows, so the wider customization work can extend it without touching reading data. Unknown or damaged values fall back to the defaults.
- Default is **Minimal**: plain text rows, title with author and progress, each of which can be switched off. **Pills** are rounded cards; their background is the colour the reader picked (long-press a book), else the average colour of the cover (measured natively once, `averageColor`), else a neutral grey. Text is black or white by WCAG luminance. Covers on pills are optional and off by default.
- The two Power Moby-Dick entries were two different files (the footnote and the link edition from the phone matrix), not a failed dedupe: import dedupes by content hash. Books that share a title and authors now show the imported file name (else publisher, else "Copy N") so editions are told apart. The matrix now imports into Quire Dev, so the everyday library only holds what the reader adds.

## Customization storage, Milestone 4

The saved reading look (global values, profiles, per-book overrides) lives in the library index as `custom`, beside the books, so it is written in the same single ordered write as everything else. It moves to SQLite (`settings` and `book_settings`) with the rest of the index. Two sentinel values stand for "leave it to the book": line height 0 and paragraph spacing -1. They keep every setting a plain number in the registry instead of adding a nullable type for two entries.

## Reading fonts, Milestone 4

Four bundled fonts, all SIL OFL 1.1 from @fontsource 5.3.0: Literata (made for e-reading), EB Garamond (classic book face), Atkinson Hyperlegible (low vision) and OpenDyslexic. Few on purpose, matching the stripped-down default; anything else comes in through import. Subsets are Latin, Latin Extended, Cyrillic and Greek where a font has them, so Bosnian, Croatian, Serbian and Czech text never falls back mid-word. WOFF2 only, 1.4 MB in all. The files are committed, so builds stay offline.

Fonts reach the book as blob: URLs the reader page makes from its own fetch of the loopback `fonts/` route, not as http URLs, so the book CSP keeps `font-src blob: data:` and a book cannot use the route. CSS families are named "Quire <name>" so a book's own embedded "Literata" never collides. An imported font is one file used for every weight and style (the WebView synthesizes bold and italic); its type comes from the file's signature, not its name, and font collections (.ttc) are refused. Removing an imported font clears every layer that chose it.

## Brightness, dimmer and warmth, Milestone 4

`expo-brightness` 58.0.3 (MIT, maintained by Expo, matched to SDK 58) sets the reader window's brightness. It never writes the system setting, so it needs no permission, and "restore the previous brightness" holds by construction: leaving the reader, closing the app or going to the background hands the window back to the system value (`restoreSystemBrightnessAsync`). It is a native module, so the APK has to be rebuilt once. The hook loads it lazily and does nothing on an older APK.

The software dimmer and the warm filter are two veils in React Native over the WebView, under the controls. They take no touches and never restyle the book, so moving them costs no relayout.

## Header and footer lines, Milestone 4

The header and footer lines are drawn by the app over the page, not by foliate's own per-column header and footer cells. foliate drops those cells in scroll mode and rebuilds them on every layout, and the app already has the theme, the clock and the book's metadata. The page only makes room: the host sends a `band` with the look, and the page adds it to the margin it already sizes for the system bars. In scroll mode the text runs under the lines, so they get the page colour behind them. Fixed-layout books show no lines. The clock is 24-hour for now; battery needs a native module and time left needs reading speed (Milestone 7), so both wait.

## Keeping the place across look changes, Milestone 4

A look change goes back to the text the reader was at, and every later change goes back to that same text until the reader turns a page, swipes, scrolls or jumps. Re-anchoring on each relayout's landing page walked the place backwards: the page that holds the anchor starts before it, and quick changes on the phone overlapped, so the second one anchored on the first one's half-finished page (phone run 9; reproduced on the desktop by sending two looks 30 ms apart). foliate says why it moved (`page`, `snap`, `scroll`, `navigation`), so the page clears the kept anchor on those, except while a relayout of its own is running. Before going back, it waits up to 1.5 s for the new fonts to load, and goes back once more if one finished after the return.

## Gestures, Milestone 4

Gestures share one action catalog with the controls, so anything a button does a gesture can do, and no gesture runs anything outside it (the line in section 1 of the design). The page runs page turns itself, so a tap still turns with no round trip to the app; every other action goes to the app as an `action` message checked against a fixed list. Vertical swipes are free only in Pages mode and in horizontal text: in Scroll mode they scroll, and a vertical-writing book turns pages that way. Each finger is measured from where it landed, so a two-finger tap whose fingers land or lift at different moments still counts. Gestures are set for all books or a profile, not per book: muscle memory should not change between books.

## Battery and time left, Milestone 4

Battery uses `expo-battery` 58.0.4 (MIT, maintained by Expo, matched to SDK 58). It needs no permission. Like brightness, it is loaded lazily, so an APK built before it shows no battery instead of crashing, and it listens only while a slot shows the battery. Time left was planned for Milestone 7's reading statistics; a session-only estimate now costs little and needs no storage. It takes the median of recent one-page forward turns, so a jump, a chapter change, a skim or a break never skews it, and it stays blank until there are three samples rather than guessing.
