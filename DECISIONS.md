# Decisions

## Stack

Expo SDK 58 with TypeScript, a development build, and `react-native-webview`. One codebase for Android and iOS. The book will render in a WebView because both candidate engines are JavaScript.

Flutter and a pair of native apps were set aside. The hard work is pagination, CFI, footnotes, and user CSS, and that work already lives in JavaScript. Readium's mobile toolkits are separate Kotlin and Swift codebases, so they do not fit this app. Readium's user-style approach can still be borrowed later.

Navigation is Expo Router. Zustand is not added yet. There is no session state shared across screens. SQLite is not added yet. The first tables arrive with saved position.

The browser checklist is done. The recommendation below is foliate-js. It is not adopted, and nothing is vendored into the app until that pick is confirmed.

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

JDK 17, Android platforms 36 and 37, a current cmdline-tools package, and a matching build-tools package are not installed. They are the large pieces, and they wait for approval.

## Dependencies

Kept from the Expo SDK 58 default template, because the router needs them: `expo`, `expo-router`, `expo-constants`, `expo-linking`, `expo-splash-screen`, `expo-status-bar`, `react`, `react-native`, `react-dom`, `react-native-web`, `react-native-screens`, `react-native-safe-area-context`. All are MIT and current with SDK 58. `react-native-web` stays so the bridge page can be opened in a browser. `react-native-safe-area-context` is a required peer of Expo Router.

Removed from the template because the demo screens were the only users, and Expo Router marks them optional: `@expo/ui`, `expo-device`, `expo-font`, `expo-glass-effect`, `expo-image`, `expo-symbols`, `expo-system-ui`, `expo-web-browser`, `react-native-gesture-handler`, `react-native-reanimated`, `react-native-worklets`.

`expo-asset` (MIT, Expo, 58.0.21) loads the reader HTML as an app asset.

`@types/node` 22.20.5 is a devDependency only. The domain tests and `app.config.ts` import Node built-ins, and TypeScript 6 does not load those types unless `node` is listed. It is MIT, from DefinitelyTyped, and it is not shipped in the app.

`react-native-webview` 14.0.1 is the host for the reader page. MIT, maintained as the community WebView. `expo install` selected this version for SDK 58.

foliate-js and epub.js are not app dependencies. The spike pins foliate-js at `78914aef4466eb960965702401634c2cb348e9b1` (1 May 2026) and the published `epubjs@0.3.93` package. epub.js is FreeBSD-licensed. foliate-js is MIT, has no release, and its author says the API can break. That is why a pin is required if it is chosen.

## Reading position and scroll

v1 scroll mode is vertical scrolling inside the current chapter. Whole-book continuous scroll is P2. The checklist records what each engine does at a chapter boundary.

Progress will later use cumulative text length plus a CFI and a spine index. Page numbers from a `page-list` stay a separate label. That storage is not built in this milestone.

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

The reader page ships with a Content Security Policy that allows only its own inline bridge script. Book script blocking is not in the app yet. The checklist records whether each engine runs a script embedded in a fixture. Detection of DRM is separate from rendering: `classifyEncryption` treats IDPF and Adobe font obfuscation as allowed, and any other algorithm as DRM. The DRM fixture's chapter bytes are still plaintext, so an engine that ignores `encryption.xml` will still show the text. The app has to refuse the file before opening it.

## Test books

Hand-built fixtures are generated by `scripts/build-fixtures.mjs` and committed as source plus the built EPUBs. Public-domain books are downloaded by `scripts/download-test-books.mjs`, checked against pinned SHA-256 hashes, and gitignored. Tests that need those files skip when the files are absent.

Gutenberg's own host returned 503, so the script uses `gutenberg.pglaf.org`. Standard Ebooks needs `?source=download` on the EPUB URL. The bare URL is an HTML interstitial.

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
| Image and SVG | Chapter image is 1×1. Chapter 2 SVG renders. The 1200 px table stays 1200 px wide | Same |
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

Neither engine is in the app. The phone WebView has not run the bridge, and it has not re-measured the large book.
