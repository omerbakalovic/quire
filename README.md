# Quire

A local-first EPUB reader, currently implemented for Android. iOS is planned; the native loopback module is Android-only. Quire is the working name, with identity values in `src/config/identity.json`.

Milestone 0 compared foliate-js and epub.js in a desktop browser. The adopted engine is foliate-js at commit `78914aef`, vendored under `vendor/foliate-js` and reached only through the WebView bridge. See `DECISIONS.md`.

## Current state

The November 23, 2026 checkpoint includes the work integrated on `m4-bars` through `cec1b25`. It is a development build, with Milestone 4 customization partly implemented.

- Import EPUBs from the file picker or Android Open/Share, keep a local library, and resume reading. The library supports minimal rows or cover-coloured pills and optional author, cover and progress details.
- Read in pages or scroll mode, navigate the contents and chapter slider, return through a jump history, and open footnotes in a themed sheet. Fixed-layout books keep their own layout.
- Change typography, seven built-in themes, brightness, dimming and warmth. Choose bundled reading fonts or import TTF, OTF, WOFF and WOFF2 fonts.
- Save and switch reading profiles in **Settings > Reading look**. The reader's **Aa** panel edits the active profile (or global defaults), or just the current book.
- Configure header/footer information and the three control rows. Bare, Classic and Informative presets set the information bands; crowded control rows wrap to keep buttons reachable.
- Repeated typography changes retain the reading anchor until the reader moves, including when fonts finish loading.

Page-turn shader effects, turn-pack imports, a theme editor, preset sharing and the full customization design are still planned. Page-turn settings in the registry are not active effects. See [current progress and remaining checks](PROGRESS.md) and the [customization implementation status](docs/customization.md).

## Install it on your phone

Quire runs on its own once installed. No computer, cable or Metro server is needed to read.

- **Without a computer:** sign in to GitHub, open a successful run for the desired branch in the [Android APK workflow](https://github.com/omerbakalovic/quire/actions/workflows/android-apk.yml), download the `Quire-apk` artifact, unzip it on the phone, and open `Quire-0.0.0.apk`. Android asks once to allow installs from that app. A newly pushed commit must finish building before its APK is available.
- **From the PC with the phone on USB:** `npm run apk -- --install`. Without `--install` the APK is written to `dist/`.

Then open **Quire** from the app drawer and tap **Add books**, or open an `.epub` from Files, a browser download, or any app's Share menu and pick Quire. Tap a book to read; Settings is in the library's header.

The release app is `app.quire.reader`. Debug builds (`npm run android`, used by the phone matrix) install beside it as **Quire Dev** (`app.quire.reader.dev`) with their own library, so test runs never touch your books. On Xiaomi/HyperOS, the first USB install of each package (Quire and Quire Dev) waits for an "Install via USB" confirmation on the phone; without it adb reports `INSTALL_FAILED_USER_RESTRICTED`.

The APK script produces a standalone release-mode build signed with the Expo template's debug key. It is for development and personal installation, not a store-signed release.

## Development

Use Node.js 22, install the locked dependencies with `npm ci`, and use JDK 17 plus the Android SDK for native builds. The app uses Expo SDK 58 and a custom Kotlin module, so use a native development build rather than Expo Go.

- `npm run android` builds and installs Quire Dev; it loads its code from Metro (`npx expo start`).
- `npm test` runs the domain, bridge, debug-command, reader-page and settings tests. Four downloaded-book checks skip when their files are absent.
- `npx tsc --noEmit` checks TypeScript.
- `npm run reader` bundles the WebView reader and applies the checked paginator patch without editing the vendored engine.
- `npm run fixtures` rebuilds the hand-built EPUBs.
- `npm run books` downloads the public-domain test books. They are not committed.
- `npm run phone-doctor` checks the Android test environment; `npm run phone-matrix` runs the device matrix (emulator by default; see the script's options for a physical phone).
- `python3 spike/run_spike.py` repeats the browser checklist.

## Code and documentation

| Path | Purpose |
|---|---|
| `src/app/`, `src/reader/` | Expo screens and native reader controls |
| `src/reader-page/`, `src/renderer/` | WebView reader, security and typed bridge |
| `src/settings/` | Settings registry, profiles, themes, fonts and layout |
| `src/domain/`, `src/library/` | Library model, navigation, saved positions and persistence |
| `modules/quire-loopback/` | Android storage, EPUB inspection and token-protected local HTTP server |
| `vendor/foliate-js/`, `patches/foliate/` | Pinned reading engine and build-time patches |
| [PROGRESS.md](PROGRESS.md) | Current checkpoint, open checks and historical test evidence |
| [DECISIONS.md](DECISIONS.md) | Architecture decisions and engine measurements |
| [docs/customization.md](docs/customization.md) | Implemented customization versus the longer-term design |
| [EPUB_READER_PROMPT.md](EPUB_READER_PROMPT.md) | Product requirements and milestone plan |
