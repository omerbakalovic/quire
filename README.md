# Quire

A local-first EPUB reader for Android and iOS. The name and package id are working values in `src/config/identity.json`.

Milestone 0 compared foliate-js and epub.js in a desktop browser. The adopted engine is foliate-js at commit `78914aef`, vendored under `vendor/foliate-js` and reached only through the WebView bridge. See `DECISIONS.md`.

## Install it on your phone

Quire runs on its own once installed. No computer, cable or Metro server is needed to read.

- **Without a computer:** open the latest run of the [Android APK workflow](../../actions/workflows/android-apk.yml), download the `Quire-apk` artifact, unzip it on the phone, and open `Quire-0.0.0.apk`. Android asks once to allow installs from that app.
- **From the PC with the phone on USB:** `npm run apk -- --install`. Without `--install` the APK is written to `dist/`.

Then open **Quire** from the app drawer and tap **Add books**, or open an `.epub` from Files, a browser download, or any app's Share menu and pick Quire. Tap a book to read; Settings is in the library's header.

The release app is `app.quire.reader`. Debug builds (`npm run android`, used by the phone matrix) install beside it as **Quire Dev** (`app.quire.reader.dev`) with their own library, so test runs never touch your books. On Xiaomi/HyperOS, the first USB install of each package (Quire and Quire Dev) waits for an "Install via USB" confirmation on the phone; without it adb reports `INSTALL_FAILED_USER_RESTRICTED`.

## Development

- `npm run android` builds and installs Quire Dev; it loads its code from Metro (`npx expo start`).
- `npm test` runs the domain tests.
- `npm run fixtures` rebuilds the hand-built EPUBs.
- `npm run books` downloads the public-domain test books. They are not committed.
- `python3 spike/run_spike.py` repeats the browser checklist.

See `DECISIONS.md` and `PROGRESS.md`.
