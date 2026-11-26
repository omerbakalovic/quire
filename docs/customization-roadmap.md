# Customization overhaul: roadmap

Status: **plan only, nothing here is built yet.** Written 2026-11-26 against `m1b-import-reading` at `4256b70` (PRs #1 to #9 merged; #10 and #11 open). It extends [the customization design](customization.md) (PR #4) and does not replace it: the registry, the layers, the slots, the presets and the turn packs stay. Where this plan changes a decision from that doc, it says so.

Every milestone below is one reviewable PR (or a short stack of them) into `m1b-import-reading`, behind the same rules: no rewrite, existing libraries, positions, profiles, fonts and overrides survive every step, and each milestone ends with its tests, an emulator run and an update to this file saying what was built, what was verified and what was not.

Labels used below: **Built** (in `m1b` today), **Extend** (exists, grows), **New** (does not exist), **Arch** (needs a structural change, not only new settings).

---

## 1. What exists today

| Area | State | Where | Verdict |
|---|---|---|---|
| Settings registry (typed, clamped, unknown values dropped) | Built | `src/settings/registry.ts` | Extend: new types `color`, `theme`; new groups `library`, `bars`, `bookmark` |
| Layers session > book > profile > global > default | Built | `src/settings/layers.ts` | Keep. Make the editing target explicit in the UI (section 2) |
| Profiles (create, switch, delete; Aa edits the active one) | Built | `src/settings/customization.ts`, `src/app/customize.tsx` | Extend: rename, duplicate, switch from the in-book flow |
| Per-book overrides with "•" marks | Built | Aa panel scope switch | Extend: shown in Reading Look with "from this book" and reset |
| Reading Look screen generated from the registry | Built | `src/app/customize.tsx` (route `/customize`) | Arch: becomes a tabbed editor with a live preview, reachable from a book |
| Aa quick panel over the live page | Built | `src/reader/QuickPanel.tsx` | Extend: profile row, "Reading look ›" entry, font-size slider |
| Font size as − / + steps (60 to 300 %, step 5) | Built | registry `type.fontSize` | Extend: slider with number, fine steps, typed entry |
| Seven built-in themes, 8 tokens each, contrast check function | Built | `src/settings/themes.ts` | Arch: more tokens, user themes, app-wide use |
| Theme applies to book content and reader bars | Built (partly) | `reading-css.ts`, `ControlBars`, `AmbientBands` | Arch: library, settings, Contents panel, sheets, Back pill and dialogs are hard-coded (`#1F3A5F`, `#2c2c2e` pill, `#1c1c1e` Contents, `Alert.alert`) |
| Header/footer bands, 6 slots × up to 3 elements, 3 presets | Built | `src/settings/layout.ts`, `AmbientBands.tsx` | Extend: band height, padding, per-element size |
| Control bars: top bar, quick row, bottom bar as ordered lists | Built | `ControlBars.tsx` | Arch: lists become start/center/end zones; bar size, width, placement |
| Gesture → action catalog | Built | registry `gesture.*`, `ACTIONS` | Extend: bookmark actions |
| Page-turn overlay (Skia), Fade and Slide packs | Built | `src/turns`, `TurnOverlay.tsx` | Untouched by this plan |
| Library look: minimal or pills, covers, author, progress, per-book pill colour (12 swatches), cover average | Built | `src/domain/library-look.ts`, Settings screen | Arch: move look options into the registry; pill geometry, typography, full colour picker, preview |
| Colour picker | New | | Skia (already a dependency) draws the gradients |
| Live sample-page preview | New | | Uses the real reader page (section 4) |
| Reading bookmark | New | | One per book, stored on the book row |
| Storage | Built | one JSON file, `version: 1`, written whole by the native store | Extend: `version: 2` with a backup before the first upgrade (section 3) |

Two facts that shape the plan:

1. **`parseLibrary` keeps only what it knows.** An older build opening a newer file drops the new fields and writes the file back. Quire and Quire Dev have separate storage, so testing on Dev is safe, but installing an older Quire over a newer one would lose custom themes and bookmarks. Section 3 handles this with a backup file.
2. **The reader page is the only renderer.** foliate-js in the WebView paginates, applies `readingCss` and the band margins. Anything that previews "what reading will look like" has to run that page, or it will drift from it.

---

## 2. Global settings, profiles and per-book overrides

This keeps the layer model from `customization.md` 2.2 and makes it visible.

### 2.1 Precedence (unchanged)

```
session  >  this book  >  active profile  >  global  >  built-in default
```

The first layer that holds a value wins, per setting. A layer that holds nothing for a setting is transparent, so a profile that only sets the theme still uses the global font.

| Layer | What it is | Saved | Who writes it |
|---|---|---|---|
| Session | Temporary values while a book is open (today only brightness-style quick changes) | No | The reader |
| This book | Overrides for one book only | Yes, `custom.books[bookId]` | Reading Look opened from that book, target "This book" |
| Active profile | A named bundle ("Night", "Commute"). One is active at a time, for the whole app | Yes, `custom.profiles[]`, `custom.activeProfile` | Reading Look, target "Profile: Night" |
| Global | Your normal settings | Yes, `custom.global` | Reading Look, target "Everywhere" |
| Default | Built into the app, minimal | No | Nobody |

### 2.2 What each setting family may hold

| Family | Book | Profile | Global | Why |
|---|---|---|---|---|
| Typography, margins, page | ✓ | ✓ | ✓ | Books differ |
| Reading theme (`theme.id`) | ✓ | ✓ | ✓ | A book with heavy illustrations may want Paper |
| App theme (library, settings, menus) | ✗ | ✓ | ✓ | Outside a book there is no book layer |
| Header/footer and bars | ✓ | ✓ | ✓ | Unchanged |
| Gestures, bookmark behaviour | ✗ | ✓ | ✓ | Muscle memory should not change per book |
| Library look | ✗ | ✓ | ✓ | A Night profile can carry a darker shelf |
| Custom themes themselves (the palettes) | | | Library of themes | A theme is a named palette; layers only pick which one is used |

### 2.3 Which theme a screen uses

- **Inside a book** (page, bars, Contents, Aa, note sheet, Reading Look opened from the book, its dialogs): the theme resolved for that book, including the book layer.
- **Everywhere else** (library, Settings, Reading Look opened from Settings, the library's sheets and dialogs): the app theme, resolved from profile and global only.
- **App theme default: "Same as reading theme."** The new setting `app.theme` defaults to `follow`, meaning the global/profile reading theme. So by default one choice themes everything, and a user who wants a dark library with a paper reader can split them.

### 2.4 Editing target, made explicit

Reading Look shows one line at the top: **"Saving to: [Night ▾]"**. The choices are:

- **Profile: <name>**, when a profile is active (the default target then, as today).
- **Everywhere** (global). When a profile is active and holds the same setting, the control says "Night overrides this" with a one-tap jump to the profile.
- **This book: <title>**, only when Reading Look was opened from a book.

Every control shows where its value comes from (`from this book`, `from Night`, `default`) and a reset that clears only the targeted layer. This replaces the Aa panel's two-way "All books / This book" switch with the same three-way choice, worded the same way in both places.

Switching profiles never edits anything; it only changes which profile is active. Book overrides still win over the new profile, and the Reading Look header says so when a book has any ("This book overrides 3 settings · Show").

---

## 3. Storage and migration rules

These apply to every milestone.

1. **One schema bump, `version: 2`, in the first milestone that adds stored data (C1).** `parseLibrary` accepts 1 and 2 and always writes 2. New fields are optional with defaults, so a v1 file parses into a valid v2 library with no visible change.
2. **Backup before the first v2 write.** The native store copies `library.json` to `library.v1.backup.json` once, before writing version 2, and never overwrites that backup. A debug-only matrix command restores it, so a migration can be rolled back in a test.
3. **Never re-key existing data.** Book ids, profile ids, font ids, CFIs and positions keep their values. New things get new keys.
4. **Moves keep the meaning.** When a setting moves (library look into the registry, control-bar lists into zones), the migration writes the value that renders the same as before, and a unit test renders old and new and compares.
5. **Deleting a user theme or a profile never leaves a dangling reference.** Layers that chose a deleted theme fall back to that theme's base built-in, the way removing a font already falls back to the book's fonts.
6. **Downgrades.** An older build drops v2 fields. That is documented in PROGRESS.md and README; the backup restores v1 state. No milestone depends on an older build reading v2.
7. **Every migration has a fixture test**: a saved v1 library from the current build (`src/domain/fixtures/library-v1.json`, with profiles, book overrides, an imported font, pill colours and positions) parses, migrates, and the resolved settings for each book equal the v1 resolution.

---

## 4. The live preview: how it works

**Decision: the preview is the real reader page, in a second WebView, opening a bundled sample book.**

- A small EPUB, `quire-sample.epub`, is built by `scripts/build-fixtures.mjs` and shipped as an asset. It is a single short chapter with an h1, h2 and h3, plain and justified paragraphs, italic, bold and small caps, an internal and an external link, a footnote reference, an ordered and an unordered list, a block quotation, a poem with indents, a small table, and a figure with an image, a border and a caption. Its text is original (written for Quire) so there are no licence questions.
- The loopback server serves it under a reserved id (`__sample`). It is not a library book: it never shows on the shelf, has no saved position and no overrides.
- The preview WebView loads the same `assets/reader/index.html` with a `preview` flag: no gestures, no position reports, no back stack, no turn overlay. It receives the same `look` message the reader does, so CSS, fonts, theme tokens and band margins are computed by the same code (`readingCss`, `layoutAttributes`, `bandsOf`).
- The app draws the header/footer bands and the control bars over the preview with the same components the reader uses (`AmbientBands`, `ControlBars`), fed with sample values ("Chapter 3 · The Lighthouse", "12 of 40", the real clock and battery).
- **Speed rules.** Colour and bar changes do not repaginate (the registry already marks `relayout: false`), so they apply in one frame. Relayout changes (size, font, margins, spacing) are sent at most every 120 ms while a slider moves and once more on release. Target: a colour change visible in under 50 ms, a font-size step in under 250 ms on the emulator, measured in C2.
- **Fallback if a second WebView is too heavy** (memory or start time over the C2 budget): the preview pane becomes a static snapshot of the sample page refreshed after each change, and the "Show on my book" button (below) remains the exact check. This is decided by the C2 measurements, not up front.
- **"Show on my book."** When Reading Look was opened from a book, a button closes the editor back to the book, where every change is already live. The preview is the representative sample; the book is the truth.

---

## 5. Milestones

Seven milestones, called **C1 to C7** to keep them apart from the spec's Milestones 0 to 9 (they sit inside spec Milestone 4, except C6, which is the look part of spec Milestone 5 without folders, and C7, the first slice of spec Milestone 6).

```
C1 Reading Look hub ──► C2 Live preview ──► C4 Colours + custom themes ──► C6 Library look
        │                     │                      ▲
        │                     └──► C5 Bars editor ───┘(uses picker for bar colours)
        │                              └──► C5b Drag in preview
        ├──► C3 App-wide theme plumbing ─────────────┘
        └──► C7 Reading bookmark (independent after C1)
```

C3 and C7 can run in parallel threads after C1; nothing else needs to.

### C1. Reading Look hub, in-book access, profiles, size slider ← recommended first

**Why first:** everything else plugs into this screen, it changes little stored data, and it fixes a daily pain (leaving the book to switch profiles).

Scope:
- Route `/look` replaces `/customize` (the old route redirects). Params: `book` (optional), `tab` (optional).
- Tabs: **Text**, **Page**, **Colours** (theme choice only until C4), **Bars** (current slot editors until C5), **Turns**, **Gestures**. Library settings stay in Settings until C6. Each tab is still generated from the registry, grouped as today.
- **Saving to** selector (section 2.4) and "from …" source labels on every control.
- **Profiles row** at the top: chips to switch (no "save" needed to switch), "+ New from current", and a ⋯ menu per profile: Rename, Duplicate, Update from current, Delete. Built-in "None" stays.
- **From a book:** the Aa panel gets a profile row (same chips) and a "Reading look ›" button. That pushes `/look?book=<id>` on top of the reader; the reader screen stays mounted under it, so the WebView and the place are kept. Back (system back, the header's back arrow, or "Back to book") pops to the book, which applies any change with its existing anchor logic. As a safety net the reader saves its position when it loses focus.
- **Font size slider** (a shared `SettingSlider` component, also used for line height, margins, duration later): track with the value shown above the thumb ("115 %"), − and + buttons for one step, tap the value to type a number, and Android accessibility `adjustable` with increment/decrement actions. Fine step becomes 1 % on the slider (registry step for `type.fontSize` goes from 5 to 1; old saved multiples of 5 stay valid).
- Library schema `version: 2` and the backup (section 3), with no new fields used yet, so the mechanism ships alone.

Data model: `Profile` gains nothing; rename and duplicate use existing fields. `type.fontSize.step` 5 → 1.

Acceptance:
- From a book, Aa → Reading look → change size → Back returns to the same page (same CFI, or within the same page after relayout) on Moby-Dick and Frankenstein, in Pages and Scroll modes.
- A profile can be switched, created, renamed, duplicated and deleted from inside a book without visiting Settings.
- Saving to "This book" changes only that book; opening another book shows the global/profile value.
- The slider reaches every value 60 to 300 with − / + and with TalkBack swipe up/down; the typed value is clamped.
- v1 fixture library migrates with identical resolved settings for every book; the backup file exists and is not rewritten on later saves.

Tests: unit (target selector writes, profile rename/duplicate, slider clamping and stepping, migration fixture), reader-page anchor tests as today, matrix commands `open-look`, `look-back` on the emulator; one short phone pass at the end.

### C2. Live sample-page preview

Scope: section 4. Sample EPUB, preview mode of the reader page, preview pane at the top of Reading Look (about 45 % of the height in portrait, a side pane in landscape), sample header/footer and bars toggle ("Show bars"), "Show on my book" from a book.

Acceptance:
- Every Text, Page and Colours control changes the preview with no reload of the screen.
- Pixel test on desktop Chromium: the preview page and the reader opening the same sample book with the same settings produce the same layout (same line breaks on the first page).
- Budgets measured on the emulator and recorded here: preview first paint, colour-change latency, relayout latency, extra memory of the second WebView. If memory or first paint is over budget (proposed: +60 MB, 800 ms), switch to the snapshot fallback and say so.
- Opening and closing Reading Look 20 times from a book leaves no WebView leak (memory back within 10 %).

### C3. App-wide theme plumbing

Scope:
- An `AppTheme` React context built from the resolved theme (section 2.3) and used by every screen: library, book sheet, Settings, Reading Look, Contents panel, Back pill, progress slider bubble, note sheet chrome, import summary, busy overlay, status bar and navigation bar.
- `Alert.alert` (system dialog, ignores the app theme) is replaced by a themed `ConfirmSheet` for delete-book, delete-profile, delete-font and external-link confirmations.
- Theme tokens grow from 8 to the set below. Built-in themes get values for the new tokens derived from their current ones, so the reader looks the same and the library takes the theme's colours. The black Back pill becomes the `control` token.
- New `app.theme` setting (`follow` by default).

Theme tokens v2 (colours are `#rrggbb` or `#rrggbbaa`):

| Group | Tokens |
|---|---|
| Page | `page`, `ink`, `inkMuted`, `heading`, `link`, `linkVisited`, `selection`, `highlight`, `rule` (borders, table lines), `imageFrame`, `imageCaption` |
| Reader chrome | `chrome`, `chromeInk`, `chromeDivider`, `accent`, `accentInk` |
| Controls | `control` (pills, chips, the Back pill), `controlInk`, `controlOn`, `controlOnInk`, `sliderTrack`, `sliderFill`, `sliderThumb` |
| Sheets and menus | `sheet`, `sheetInk`, `scrim`, `danger` |
| App | `appBackground`, `appInk`, `appInkMuted`, `appDivider`, `pillDefault` (library pill with no cover colour) |
| Flags | `dark` (system bars and form controls) |

Acceptance: with each built-in theme, screenshot every screen and sheet listed above on the emulator; no hard-coded colour remains (a lint test greps `src/app` and `src/reader` for hex literals outside `themes.ts`); the reader page renders byte-identical CSS for a book on Light and on Night before and after C3, except the new variables.

### C4. Colour picker, custom themes, Colours tab

Scope:
- **Colour picker** (`ColorPicker` component, Skia gradients): saturation/brightness square plus hue strip, optional opacity strip, hex field (`#rgb`, `#rrggbb`, `#rrggbbaa`), RGB and HSL fields, the current theme's colours and the last 8 picked as swatches, an eyedropper is out of scope. Every handle has 1-step accessibility actions and the fields allow exact entry.
- **Custom themes**: a stored list `custom.themes: UserTheme[]` with `{ id, name, base, tokens }`. `base` is a built-in id; `tokens` holds only the changed tokens, so a theme follows improvements to its base. Actions: New (from current), Duplicate (also of a built-in), Rename, Edit, Delete. Built-ins can't be edited or deleted, only duplicated. `theme.id` becomes a `theme` setting type accepting built-in ids and user theme ids (as `font` already does).
- **Colours tab**: the theme list on top, then token groups (section C3 table) with a labelled example of each element next to its swatch ("Link", "Image frame", "Back pill", "Slider thumb"…). Tapping an element in the preview selects its token. Editing a built-in creates "<Name> (copy)" first and says so.
- **Contrast flags, never blocks**: ink/page, link/page, heading/page, chromeInk/chrome, controlInk/control, sheetInk/sheet, appInk/appBackground. Below 4.5:1 (3:1 for links and muted text) the swatch shows a "Low contrast 2.8:1" tag; the theme list shows a small mark. Night-style low-glare themes stay allowed.
- **Publisher colours**: new setting `theme.bookColors` with `auto` (today's behaviour: keep the book's colours on light themes, replace them on dark themes), `keep`, `replace`. In all modes the page background, the default text colour and selection are Quire's. With `keep`, a book colour that has under 3:1 contrast on the page is replaced (that rule exists so a dark theme never shows black-on-black).

Data model: `UserTheme = { id, name, base: ThemeId, tokens: Partial<ThemeTokensV2> }`, max 50, ids like profiles. Deleting a theme resets layers that use it to its base (rule 3.5).

Acceptance: create, edit, rename, duplicate, delete a theme; it applies to reader and app; survives restart; built-ins unchanged. Sharing themes as `.quire` files stays in spec Milestone 7. Picker round-trips hex ↔ HSV without drift (unit test over 10 000 random colours).

### C5. Header, footer and bar editor (list and position controls)

Scope:
- **Model change (Arch)**: each control bar (top, quick row, bottom) becomes three zones, `start`, `center`, `end`, like the header and footer already are. Migration puts the current lists where they render today: top bar `[back, title]` → start; quick row `[prevChapter, slider, nextChapter, percent]` → center; bottom bar `[contents, look, flow]` → center (matching today's spread, confirmed by a render test).
- **Bar style settings** per bar (top, bottom, header band, footer band): height (compact / comfortable / custom 32 to 96 dp), width (50 to 100 % of the screen, centred), horizontal and vertical padding, corner radius, placement (`attached` to the edge, or `floating` with a gap), background (theme chrome, translucent, none).
- **Per-element**: size (S, M, L), gap between elements per zone, label or icon for controls, text truncation for long titles (ellipsis in the middle for titles, end for chapters).
- **Editor in the preview** (Bars tab): the preview shows both bars and both bands with zone outlines. Selecting an element shows a small toolbar: ◀ ▶ (move within or across zones), ▲ ▼ (move to another bar), alignment, size, remove. A list editor under the preview shows the same structure for screen readers, with the same actions as accessibility actions.
- **Boundaries and collisions**: bars stay inside the system safe area. A zone takes elements up to its `max`; elements keep their minimum touch size (44 dp) whatever the size setting. When a bar's zones overflow, the centre zone shrinks first (the slider is flexible), then text elements truncate, then the row wraps (today's rule, `cec1b25`). An element can't be in two places; moving it into a full zone is refused with a short message.

Acceptance: every layout reachable by drag (C5b) is reachable with the buttons and the list; the reader and the preview agree (screenshot of the same layout in both on the emulator, same element positions within 2 dp); the three presets render as before; migrated layouts render identically.

### C5b. Long press and drag in the preview

Scope: long press an element in the preview to pick it up (haptic tick), drag over zones (the target zone highlights; a full zone shows red), drop to place, drop outside to cancel. Built with `react-native-gesture-handler` and Reanimated (already installed with Skia). Kept as a separate PR because gesture code is the riskiest UI code here.

Acceptance: drag works on 360 dp wide screens; scroll of the editor does not start a drag; TalkBack users never need it.

### C6. Library look

Scope:
- Move `look.style`, `showCovers`, `showAuthor`, `showProgress` into registry settings `library.*` (profile and global). Per-book colours, cover colours and file names stay in `look` because they are data about books, not look. Migration copies the four values to global.
- New library settings: pill height (auto or fixed), padding, spacing between pills, corner radius (0 = square to full pill), cover size and side, title font (any reading font), title size and weight, author size, lines of title before truncation, pill colour source (cover average, theme `pillDefault`, or one colour for all), text on pills (auto contrast, light, dark), background (`appBackground` or a custom colour).
- The full colour picker (C4) for per-book pill colours, replacing the 12-swatch row (the swatches stay as quick picks).
- **Library tab** in Reading Look and a "Library look" entry in Settings, both with a live preview: three sample pills (one with a cover colour, one with a chosen colour, one plain) drawn with the real `BookRow` component.
- The settings list says which settings are shared (theme, fonts) and which are library-only, with a small "Shared with reading" label on the shared ones.

Acceptance: existing pill colours, covers and options look the same after migration; every new setting shows in the preview and on the shelf; 200-book library scrolls at 60 fps on the emulator (FlatList unchanged); small-screen check at 360 dp and font scale 1.3.

### C7. Reading bookmark (one per book)

Scope (answers the questions asked):

- **What it is.** A deliberate return point, one per book, separate from the last-read position (saved automatically on every move) and from the jump-back history (the Back pill, temporary, cleared when the book closes). Called "Reading bookmark" in the UI to keep it apart from the spec's multiple bookmarks (spec G, later in Milestone 6), which will be a separate list.
- **Off by default** (`bookmark.enabled`, profile and global), so the minimal UI stays minimal. Turning it on adds a "Bookmark" control to the bottom bar and the actions below to the catalog.
- **Create and update.** The `bookmarkSet` action (a bar control, or a gesture) places it on the current page. If one exists, it moves it, and a toast says "Bookmark moved · Undo" for 5 s. Saved: the page's start CFI, fraction, section index and section fraction (same shape as `SavedPosition`), chapter label, a 60-character excerpt, and the time.
- **Remove.** Long press the Bookmark control → "Remove bookmark"; also in the book's library actions. No confirm, an Undo toast instead.
- **Go to bookmark.** The `bookmarkGo` action jumps there and pushes the current place onto the existing jump-back history, so the Back pill brings the reader back to where they were browsing. Going to the bookmark never moves it. The last-read position follows the reader as usual.
- **When no bookmark exists.** The Go control is drawn dimmed; tapping it says "No bookmark yet. Tap Bookmark to set one." A gesture assigned to `bookmarkGo` shows the same toast. "Open at bookmark" is hidden in the library sheet.
- **Survives restarts and layout changes.** Stored on the book row (`LibraryBook.readingMark`), written with the library. A CFI doesn't depend on fonts or margins; after any relayout "Go" lands on the page containing the CFI. If the CFI stops resolving (re-imported file), the section index and fraction are used, as the last-read position does today. Removing the book removes it.
- **Placement and activation.** The Go control can sit in any bar zone (C5) or in a header/footer slot as a small ribbon element (`bookmarkRibbon`, shows a ribbon icon and the chapter). Setting `bookmark.goActivation`: `tap` (default) or `doubleTap`. Double tap applies only to the Go control and ribbon, never to the page's tap zones, so page turns keep their instant single tap. With `doubleTap`, a single tap on the control shows "Double-tap to go to your bookmark" for 2 s. Tap zones never extend under a bar or band, so the ribbon can't turn a page; links in the text always take a tap first (today's rule).
- **Open at bookmark.** Always an explicit action in the book's library sheet. Optional default via `bookmark.openAt`: `lastRead` (default) or `bookmark` (falls back to last read when there is no bookmark). The library row shows a small ribbon mark when a book has a bookmark.

Data model: `LibraryBook.readingMark: { cfi, fraction, sectionIndex, sectionFraction, chapter, excerpt, setAt } | null`, parsed with `cleanPosition`. Settings `bookmark.enabled`, `bookmark.goActivation`, `bookmark.openAt`. Actions `bookmarkSet`, `bookmarkGo`, `bookmarkRemove`. Elements `bookmark` (control) and `bookmarkRibbon` (ambient).

Acceptance: set → browse via Contents and the slider → Go returns to the exact page, Back pill returns to the browsing place; set → change font size, margins, theme and flow → Go lands on the page containing the excerpt; restart and Go; Open at bookmark from the library; default open behaviour switch; double tap mode doesn't delay page-turn taps (turn latency unchanged in the matrix).

---

## 6. Testing, per milestone

| Layer | What | Where it runs |
|---|---|---|
| Unit (`npm test`, node test runner) | registry, layers, migration fixtures, theme math, picker conversions, zone moves and collisions, bookmark logic | Cloud, every push |
| Reader page (jsdom / CanvasKit) | CSS from tokens, preview mode messages, anchor kept across looks | Cloud |
| Desktop Chromium harness | preview vs reader layout parity, bookmark CFI after relayout | Cloud |
| Emulator matrix (`npm run phone-matrix --quick`, new commands per milestone) | flows, persistence across restart, screenshots per theme, timings | Omer's PC, in the background |
| Phone | one short final pass per milestone, with a heads-up first | Omer's phone |

Every milestone also checks: existing positions, profiles, overrides, fonts and pill colours unchanged (the migration fixture plus opening three real books); TalkBack labels on every new control; 360 dp width and system font scale 1.3; and it updates this file's status section.

---

## 7. Status

| Milestone | Status | Branch / PR | Verified |
|---|---|---|---|
| C1 Reading Look hub | Planned | | |
| C2 Live preview | Planned | | |
| C3 App-wide theme | Planned | | |
| C4 Colours and custom themes | Planned | | |
| C5 Bars editor | Planned | | |
| C5b Drag in preview | Planned | | |
| C6 Library look | Planned | | |
| C7 Reading bookmark | Planned | | |

Open before this plan starts: PR #11 (touch reset, unmerged, waiting on an emulator rerun) and PR #10 (matrix text size). Neither blocks C1.

---

## 8. Open questions, with the default used if there is no answer

1. **What does Aa open?** Default: Aa keeps the quick sheet over the live page (size slider, theme, font, profile chips) with a "Reading look ›" button for everything else. A setting lets Aa open the full editor directly. Alternative: Aa always opens the full editor.
2. **App theme separate from reading theme?** Default: one theme for both ("Same as reading theme"), with the option to pick a different app theme.
3. **Should a profile be able to carry library look settings?** Default: yes, so Night can darken the shelf too.
4. **Bookmark defaults.** Default: feature off; Go activation single tap; opening a book goes to the last-read place; Go control in the bottom bar when turned on.
5. **Custom bar sizes: presets or free numbers?** Default: Compact / Comfortable plus a custom slider in an "Advanced" fold.
6. **Publisher colours.** Default: `auto` (today's behaviour).
7. **Preview content.** Default: the original sample chapter only. Option to also preview the open book's current page is the "Show on my book" button, not a second preview.
