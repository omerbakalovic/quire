# Customization overhaul: roadmap

Status: **plan only, nothing here is built yet.** Revised 2026-11-26 after Omer's first review (section 9 lists what changed). Written 2026-11-26 against `m1b-import-reading` at `4256b70` (PRs #1 to #9 merged; #10 and #11 open). It extends [the customization design](customization.md) (PR #4) and does not replace it: the registry, the layers, the slots, the presets and the turn packs stay. Where this plan changes a decision from that doc, it says so.

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
| Aa quick panel over the live page | Built | `src/reader/QuickPanel.tsx` | Arch: Aa opens the unified editor instead; the panel's contents become its fixed top (C1) |
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
| Which theme to use (`theme.id`, a reference, never colour values) | ✓ | ✓ | ✓ | A book with heavy illustrations may want Paper |
| App theme (library, settings, menus) | ✗ | ✓ | ✓ | Outside a book there is no book layer |
| Header/footer and bars | ✓ | ✓ | ✓ | Unchanged |
| Gestures, bookmark behaviour | ✗ | ✓ | ✓ | Muscle memory should not change per book |
| Library look | ✗ | ✓ | ✓ | A Night profile can carry a darker shelf |
| Theme colours themselves (the palettes) | ✗ | ✗ | ✗ | Kept in their own theme library (2.5), never in a layer |

### 2.3 Which theme a screen uses

- **Inside a book** (page, bars, Contents, Aa, note sheet, Reading Look opened from the book, its dialogs): the theme resolved for that book, including the book layer.
- **Everywhere else** (library, Settings, Reading Look opened from Settings, the library's sheets and dialogs): the app theme, resolved from profile and global only.
- **App theme default: "Same as reading theme."** The new setting `app.theme` defaults to `follow`, meaning the global/profile reading theme. So by default one choice themes everything, and a user who wants a dark library with a paper reader can split them.

### 2.4 Editing target, made explicit

Reading Look shows one line at the top: **"Saving to: [Night ▾]"**. The choices are:

- **Profile: <name>**, when a profile is active (the default target then, as today).
- **Everywhere** (global). When a profile is active and holds the same setting, the control says "Night overrides this" with a one-tap jump to the profile.
- **This book: <title>**, only when Reading Look was opened from a book.

Every control shows where its value comes from (`from this book`, `from Night`, `default`) and a reset that clears only the targeted layer. This replaces the Aa panel's two-way "All books / This book" switch.

Switching profiles never edits anything; it only changes which profile is active. Book overrides still win over the new profile, and the Reading Look header says so when a book has any ("This book overrides 3 settings · Show").

---

### 2.5 Themes and profiles are different things

- **A theme is colours only.** It is a named palette of the tokens in C3 (page, text, links, bars, pills, sheets…). It holds no fonts, sizes, margins or layout. Themes live in their own list: the seven built-ins plus your own (C4). Editing a theme changes those colours wherever that theme is used.
- **A profile is everything else.** Typography, font, size, spacing, margins, alignment, header/footer and bars, gestures, page turns, bookmark behaviour and library layout. A profile does not store colours; it may *pick* a theme by name (`theme.id`), just as it picks a font by name.
- So "Night" the profile can mean "larger text, no turn animation, use the Night theme", and editing the Night theme's link colour changes it for every profile and book that uses that theme.
- A theme and a profile can share a name; the UI always labels which one it is ("Theme: Night", "Profile: Night").

### 2.6 Editing safeguards: what is saved when

One rule for the whole editor:

- **Simple settings apply and save at once.** Moving the size slider, picking a font, a theme or a layout preset changes the preview, the book behind the editor (when opened from a book) and the saved layer immediately, exactly as Aa does today. There is no "Save" button for these, because quick changes must stay quick.
- **Every editor visit can be undone as a whole.** Reading Look remembers the saved state when it opened. A **Revert** button in its header ("Revert changes since opening") puts every layer, the active profile and the theme choice back to that state. It is shown only once something changed, and it is the "Cancel" for simple settings.
- **Making or editing a theme or a bar layout is a draft.** The theme editor (C4) and the bars editor (C5) work on a copy: the preview shows the draft, nothing else changes, and the header shows **Cancel** and **Save**. Leaving with unsaved changes asks "Save changes to <name>?" (Save / Discard / Keep editing). This is where many small, fiddly edits happen, so a draft is safer than live saving.
- **Built-ins are never edited.** Changing a built-in theme or a built-in layout preset makes a copy first ("Night (copy)"), says so in one line, and edits the copy. The same applies to any built-in profile added later. A copy can be renamed, duplicated or deleted; built-ins can only be duplicated.
- **Resets, from small to large:** a reset on each setting (clears it from the targeted layer), a reset per group ("Reset Text"), "Reset this book" (clears all its overrides), and "Reset everything to defaults" (global layer only, with a confirm and a one-time Undo). None of them touch themes, fonts or the library.

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

**Decision: the preview is the real reader page, in a second WebView, opening a bundled sample book, through the same code path as a real book.**

Accuracy rules (the preview must never look right while behaving differently):

1. **Same renderer.** The preview loads the same `assets/reader/index.html`, the same pinned foliate-js and the same paginator. There is no separate "preview stylesheet".
2. **Same settings logic.** The preview's look is computed by the same functions as the reader's: `resolvedFor` (with the book layer when opened from a book), `readingCss`, `layoutAttributes`, `bandsOf`, font loading and text-size scaling (`font-scale.js`). The sample book goes through the same open path; only a `preview` flag turns off gestures, position reports, the back stack and the turn overlay.
3. **Same chrome.** Header/footer bands and control bars over the preview are the reader's own `AmbientBands` and `ControlBars` components, fed with sample values ("Chapter 3 · The Lighthouse", "12 of 40", the real clock and battery).
4. **Parity is tested, not assumed.** A desktop Chromium test opens the sample book once as a normal book and once in preview mode, with the same settings, for every built-in theme and three text looks, and compares the first page's line boxes and computed colours. Any difference fails the build. The emulator run repeats one of these comparisons with screenshots.

The sample:

- `quire-sample.epub`, built by `scripts/build-fixtures.mjs` and shipped as an asset: one short chapter with h1, h2 and h3, plain and justified paragraphs, italic, bold and small caps, an internal and an external link, a footnote reference, ordered and unordered lists, a block quotation, a poem with indents, a small table, and a figure with an image, a border and a caption. Its text is original (written for Quire), so there are no licence questions.
- It also carries a few publisher styles of its own (a coloured callout, a fixed-px heading), so "publisher styles" and "book colours" settings visibly do something.
- The loopback server serves it under a reserved id (`__sample`). It is never on the shelf, has no saved position and no overrides.
- It is always the default preview, so comparisons between settings and between themes are predictable.

Speed:

- Colour and bar changes do not repaginate (`relayout: false` in the registry), so they apply in one frame. Relayout changes (size, font, margins, spacing) are sent at most every 120 ms while a slider moves and once more on release. Targets, measured in C2: colour change visible under 50 ms, font-size step under 250 ms on the emulator.
- **Fallback if a second WebView is too heavy** (memory or first paint over the C2 budget): the preview pane shows a snapshot of the sample page, refreshed after each change, still rendered by the real reader page offscreen. Decided by the C2 measurements, not up front.

Later, optional: **"Preview current book"** (milestone C8, below) switches the preview pane to the open book's current page. It is a mode of the same pane, off by default, and the standard sample stays one tap away.

## 5. Milestones

Eight milestones, called **C1 to C8** to keep them apart from the spec's Milestones 0 to 9 (they sit inside spec Milestone 4, except C6, which is the look part of spec Milestone 5 without folders, and C7, the first slice of spec Milestone 6).

```
C1 Reading Look hub ──► C2 Live preview ──► C4 Colours + custom themes ──► C6 Library look
        │                     │                      ▲
        │                     └──► C5 Bars editor ───┘(uses picker for bar colours)
        │                              └──► C5b Drag to reorder
        ├──► C3 App-wide theme plumbing ─────────────┘
        └──► C7 Reading bookmark (independent after C1)
C2 ──► C8 Preview current book (later, optional)
```

C3 and C7 can run in parallel threads after C1; nothing else needs to.

### C1. Reading Look hub, in-book access, profiles, size slider ← recommended first

**Why first:** everything else plugs into this screen, it changes little stored data, and it fixes a daily pain (leaving the book to switch profiles).

Scope:
- Route `/look` replaces `/customize` (the old route redirects). Params: `book` (optional), `tab` (optional).
- Tabs: **Text**, **Page**, **Colours** (theme choice only until C4), **Bars** (current slot editors until C5), **Turns**, **Gestures**. Library settings stay in Settings until C6. Each tab is still generated from the registry, grouped as today.
- **Saving to** selector (section 2.4) and "from …" source labels on every control.
- **Profiles**: the fixed profile row (above) switches. A long press or ⋯ on a chip offers Rename, Duplicate, Update from current, Delete (with Undo). "+ New" saves the current non-colour settings as a profile (2.5). Built-in "None" stays.
- **Aa opens this editor.** Tapping Aa in a book pushes `/look?book=<id>`. So quick changes stay quick, the top of the editor is fixed and always visible, above the tabs and the preview:
  1. **Profile row**: chips to switch profile in one tap, plus "+ New".
  2. **Text size**: the slider with its number.
  3. **Theme row**: the theme swatches (colours only, see 2.5).
  4. The **Saving to** selector and the **Revert** button (2.6), on one line.
  Everything deeper (fonts, spacing, margins, colours, bars, gestures, turns) is in the tabs below. A one-tap change is: Aa → change → Back.
- **The quick panel retires** as a separate component: its contents become the fixed top of the editor. Nothing it does today is lost.
- **Back to the book, same place.** The reader screen stays mounted under the editor, so the WebView and the place are kept. System back, the ✕ in the header, or swiping the editor down returns to the book, which applies changes with its existing anchor logic. As a safety net the reader saves its position when it loses focus, and on return it restores that position if the WebView was recycled.
- **Font size slider** (a shared `SettingSlider` component, also used for line height, margins, duration later): track with the value shown above the thumb ("115 %"), − and + buttons for one step, tap the value to type a number, and Android accessibility `adjustable` with increment/decrement actions. Fine step becomes 1 % on the slider (registry step for `type.fontSize` goes from 5 to 1; old saved multiples of 5 stay valid).
- Library schema `version: 2` and the backup (section 3), with no new fields used yet, so the mechanism ships alone.

Data model: `Profile` gains nothing; rename and duplicate use existing fields. `type.fontSize.step` 5 → 1.

Acceptance:
- Opening from Settings and from Aa shows the same editor; from Aa the profile row and size slider are visible without scrolling on a 360 × 640 dp screen.
- From a book, Aa → change size → Back returns to the same page (same CFI, or within the same page after relayout) on Moby-Dick and Frankenstein, in Pages and Scroll modes.
- A profile can be switched, created, renamed, duplicated and deleted from inside a book without visiting Settings.
- Revert after several changes restores the exact saved state from when the editor opened (unit test over layers, active profile and theme).
- Saving to "This book" changes only that book; opening another book shows the global/profile value.
- The slider reaches every value 60 to 300 with − / + and with TalkBack swipe up/down; the typed value is clamped.
- v1 fixture library migrates with identical resolved settings for every book; the backup file exists and is not rewritten on later saves.

Tests: unit (target selector writes, profile rename/duplicate, slider clamping and stepping, migration fixture), reader-page anchor tests as today, matrix commands `open-look`, `look-back` on the emulator; one short phone pass at the end.

### C2. Live sample-page preview

Scope: section 4. Sample EPUB, preview mode of the reader page, preview pane at the top of Reading Look (about 45 % of the height in portrait, a side pane in landscape), sample header/footer and bars toggle ("Show bars"), and the parity test from section 4.

Acceptance:
- Every Text, Page and Colours control changes the preview with no reload of the screen.
- Parity test (section 4, rule 4) passes for every built-in theme and three text looks.
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
- **Colours tab**: the theme list on top, then token groups (section C3 table) with a labelled example of each element next to its swatch ("Link", "Image frame", "Back pill", "Slider thumb"…). Tapping an element in the preview selects its token. Editing a built-in creates "<Name> (copy)" first and says so. The theme editor is a draft with Cancel and Save (2.6).
- **Contrast flags, never blocks**: ink/page, link/page, heading/page, chromeInk/chrome, controlInk/control, sheetInk/sheet, appInk/appBackground. Below 4.5:1 (3:1 for links and muted text) the swatch shows a "Low contrast 2.8:1" tag; the theme list shows a small mark. Night-style low-glare themes stay allowed.
- **Publisher colours**: new setting `theme.bookColors` with `auto` (today's behaviour: keep the book's colours on light themes, replace them on dark themes), `keep`, `replace`. In all modes the page background, the default text colour and selection are Quire's. With `keep`, a book colour that has under 3:1 contrast on the page is replaced (that rule exists so a dark theme never shows black-on-black).

Data model: `UserTheme = { id, name, base: ThemeId, tokens: Partial<ThemeTokensV2> }`, max 50, ids like profiles. Deleting a theme resets layers that use it to its base (rule 3.5).

Acceptance: create, edit, rename, duplicate, delete a theme; it applies to reader and app; survives restart; built-ins unchanged. Sharing themes as `.quire` files stays in spec Milestone 7. Picker round-trips hex ↔ HSV without drift (unit test over 10 000 random colours).

### C5. Header, footer and bar editor (list and position controls)

Scope:
- **Model change (Arch)**: each control bar (top, quick row, bottom) becomes three zones, `start`, `center`, `end`, like the header and footer already are. Migration puts the current lists where they render today: top bar `[back, title]` → start; quick row `[prevChapter, slider, nextChapter, percent]` → center; bottom bar `[contents, look, flow]` → center (matching today's spread, confirmed by a render test).
- **Bar style settings** per bar (top, bottom, header band, footer band): height (compact / comfortable / custom 32 to 96 dp), width (50 to 100 % of the screen, centred), horizontal and vertical padding, corner radius, placement (`attached` to the edge, or `floating` with a gap), background (theme chrome, translucent, none).
- **Per-element**: size (S, M, L), gap between elements per zone, label or icon for controls, text truncation for long titles (ellipsis in the middle for titles, end for chapters).
- **Editor in the preview** (Bars tab, a draft with Cancel and Save, 2.6): the preview shows both bars and both bands with zone outlines. Selecting an element shows a small toolbar: ◀ ▶ (move within its region, across its start/center/end zones), ▲ ▼ (move to another bar or band), alignment, size, remove. A list editor under the preview shows the same structure for screen readers, with the same actions as accessibility actions.
- **Boundaries and collisions**: bars stay inside the system safe area. A zone takes elements up to its `max`; elements keep their minimum touch size (44 dp) whatever the size setting. When a bar's zones overflow, the centre zone shrinks first (the slider is flexible), then text elements truncate, then the row wraps (today's rule, `cec1b25`). An element can't be in two places; moving it into a full zone is refused with a short message.

Acceptance: every layout reachable by drag (C5b) is reachable with the buttons and the list; the reader and the preview agree (screenshot of the same layout in both on the emulator, same element positions within 2 dp); the three presets render as before; migrated layouts render identically.

### C5b. Drag to reorder, within regions

Scope, deliberately bounded:
- Long press an element in the preview to pick it up (haptic tick), drag it **within its own region** (the header band, the footer band, the top bar, the quick row, the bottom bar), across that region's start/center/end zones, and drop it. The target slot highlights; a full zone shows red; dropping outside the region cancels.
- Alignment of each zone and each region stays a control (start, center, end, spread), not a drag.
- Moving an element to another region is done with the ▲ ▼ buttons and the list editor (C5), not by dragging, so a drag can never land something in a place with different rules.
- **No free positioning.** Elements always sit in zones, so there are no overlaps, nothing moves on rotation or another screen size, and every touch target keeps its 44 dp. Free placement is listed under "Later, only if still wanted" (section 5, end) and is not planned.
- Built with `react-native-gesture-handler` and Reanimated (already installed with Skia). A separate PR because gesture code is the riskiest UI code here.

As built (2026-11-27): the drag happens on the Bars tab's zone boxes, not on the preview. The header and footer lines are drawn inside the page's WebView and the tap bars in the preview are a picture, so the editor's boxes, which show the same zones, are where items are picked up. It uses React Native's PanResponder rather than gesture-handler, which is not a direct dependency, so no new native module and no APK rebuild are needed. There is no haptic tick yet.

Acceptance: reorder by drag works on 360 dp screens and in landscape; scrolling the editor does not start a drag; every result is also reachable with buttons and the list; TalkBack users never need dragging.

### C6. Library look

Scope:
- Move `look.style`, `showCovers`, `showAuthor`, `showProgress` into registry settings `library.*` (profile and global). Per-book colours, cover colours and file names stay in `look` because they are data about books, not look. Migration copies the four values to global.
- New library settings: pill height (auto or fixed), padding, spacing between pills, corner radius (0 = square to full pill), cover size and side, title font (any reading font), title size and weight, author size, lines of title before truncation, pill colour source (cover average, theme `pillDefault`, or one colour for all), text on pills (auto contrast, light, dark), background (`appBackground` or a custom colour).
- The full colour picker (C4) for per-book pill colours, replacing the 12-swatch row (the swatches stay as quick picks).
- **Library tab** in Reading Look and a "Library look" entry in Settings, both with a live preview: three sample pills (one with a cover colour, one with a chosen colour, one plain) drawn with the real `BookRow` component.
- The settings list says which settings are shared (theme, fonts) and which are library-only, with a small "Shared with reading" label on the shared ones.

As built (2026-11-28), C6 is split in two. **C6** moves the four options and adds the sizes, spacing, corners, cover size and side, title size, weight and lines, author and progress size, the pill colour source (cover or theme) and the text on pills, with a Library tab in Reading Look and a "Library look" entry in Settings. The preview shows the first three books of the library as they are, or three stand-ins when it is empty. **C6b** brings the settings that need a colour value (one colour for all pills, a custom library background), the full colour picker for a book's pill, the title font, and the "Shared with reading" labels.

Acceptance: existing pill colours, covers and options look the same after migration; every new setting shows in the preview and on the shelf; 200-book library scrolls at 60 fps on the emulator (FlatList unchanged); small-screen check at 360 dp and font scale 1.3.

### C7. Reading bookmark (one per book)

**What it is.** One manually set return point per book. It is separate from the last-read position (saved automatically on every move) and from the jump-back history (the Back pill, temporary, cleared when the book closes). Called "Reading bookmark" in the UI to keep it apart from the spec's multiple bookmarks (spec G, later in Milestone 6), which will be a separate list.

**The one invariant:** only an explicit "Set bookmark" (or "Remove bookmark") changes it. Browsing, page turns, Contents, the slider, links, footnotes, the jump-back history, flow changes, relayouts and the automatic position save never move it. A unit test drives each of those and checks the stored bookmark is byte-identical afterwards.

**Two separate actions, two separate controls:**

| Action | Control | What it does |
|---|---|---|
| `bookmarkSet` | "Set bookmark" | Puts the bookmark on the current page. If one already exists elsewhere, asks once: "Move your bookmark here? It's now at *Chapter 4*." (Move / Cancel). A setting can skip that question and show an Undo toast instead |
| `bookmarkGo` | "Go to bookmark" | Jumps to the bookmark. Never moves it. Pushes the current place onto the jump-back history, so the Back pill returns to where you were browsing |
| `bookmarkRemove` | In the Set control's long-press menu and the book's library actions | Removes it, with a 5 s Undo toast |

The two controls never share a button, so going back can't accidentally re-set the bookmark.

**Off by default** (`bookmark.enabled`, profile and global), so the minimal UI stays minimal. Turning it on puts "Set bookmark" and "Go to bookmark" in the bottom bar; both can be moved like any control (C5), and both actions can be assigned to gestures.

**What is saved.** The page's start CFI, fraction, section index and section fraction (the `SavedPosition` shape), the chapter label, a 60-character excerpt and the time, in `LibraryBook.readingMark`, written with the library.

**When no bookmark exists.** "Go to bookmark" is drawn dimmed; tapping it says "No bookmark yet. Use Set bookmark first." A gesture or region assigned to Go shows the same message. "Open at bookmark" is hidden in the library sheet.

**Survives restarts and layout changes.** A CFI doesn't depend on fonts or margins; after any relayout Go lands on the page containing the CFI. If the CFI stops resolving (a re-imported file), the section index and fraction are used, as the last-read position does today. Removing the book removes it.

**Where Go can be activated, and how (all in Settings → Bookmark):**

- **Go control**: in any bar zone (C5), or as a small ribbon element in a header/footer slot (`bookmarkRibbon`: a ribbon icon, optionally the chapter name).
- **Dedicated gesture region** (`bookmark.goRegion`): `none` (default), or a thin strip at the top-right corner, the top edge, or the right edge (size 24 to 48 dp). The region is cut out of the page's tap zones, so taps there never turn a page, and links under it can't be reached by a tap there (the strip is small and at the page edge, outside the text column by default).
- **Activation** (`bookmark.goActivation`): `tap` (default) or `doubleTap`, set separately for the control and for the region. It applies only to them, never to the page's tap zones, so page turns keep their instant single tap everywhere else. With `doubleTap`, a single tap shows "Double-tap to go to your bookmark" for 2 s.
- Links inside the text always take a tap first (today's rule); the bars and bands sit outside the text, so the controls never compete with links.

**Opening a book.** "Open at bookmark" is always an explicit action in the book's library sheet. Optional default via `bookmark.openAt`: `lastRead` (default) or `bookmark` (falls back to last read when there is none). The library row shows a small ribbon mark when a book has a bookmark.

Data model: `LibraryBook.readingMark: { cfi, fraction, sectionIndex, sectionFraction, chapter, excerpt, setAt } | null`, parsed with `cleanPosition`. Settings `bookmark.enabled`, `bookmark.confirmMove`, `bookmark.goRegion`, `bookmark.goRegionSize`, `bookmark.goActivation.control`, `bookmark.goActivation.region`, `bookmark.openAt`. Actions `bookmarkSet`, `bookmarkGo`, `bookmarkRemove`. Elements `bookmarkSet`, `bookmarkGo` (controls) and `bookmarkRibbon` (ambient).

Acceptance: set → browse via Contents, the slider, links and notes → bookmark unchanged and Go returns to the exact page, Back pill returns to the browsing place; set → change font size, margins, theme and flow → Go lands on the page containing the excerpt; replacing asks first; restart and Go; Open at bookmark from the library; the openAt default; with a region on, taps in the region never turn a page and taps outside it turn as before (turn latency unchanged in the matrix); double tap works on the control and the region only.

### C8. Preview current book (later, optional)

A mode switch on the preview pane, shown only when Reading Look was opened from a book: "Sample" (default) or "This book". "This book" renders the open book's current page in the preview WebView using the same rules as section 4; the standard sample stays one tap away for predictable comparisons. Planned after C2 has measured memory and speed, and only if those leave room.

### Later, only if still wanted

- Free positioning of bar elements (outside zones). Not planned: it brings collisions, rotation and screen-size problems and touch-target problems. Revisit after C5b if zone-based layout turns out too limiting.
- Multiple bookmarks (spec G) as their own list, separate from the reading bookmark.

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
| C1 Reading Look hub | Merged (PR #13); emulator and phone checked | PR #13 | Cloud: unit tests, type check, reader bundle, Android JS export. Emulator run 14 (x86_64 debug build, 2026-11-26): Kotlin 40/40 incl. the backup tests; quick matrix 134 checks, 2 failed (the known noteref turn stuck at 0.567, as in run 12, fixed by PR #11), all 6 Reading Look checks pass; `library.v1.backup.json` byte-identical to the old v1 file. Phone run 16 (arm64 Quire Dev, f08f5a9, Frankenstein): 36/36, backup made |
| C2 Live preview | Merged (PR #14); emulator checked | PR #14 | Cloud: unit tests incl. open-message parity and sample content, type check, Android JS export with the EPUB asset; desktop Chromium harness. Emulator run 17 (1e30d87, quick matrix): 135 checks, 2 failed (the same known noteref turns as run 14), all 7 Reading Look checks pass, preview opened in 1355 ms; memory +6.3 MB with the preview showing. Runs 18 to 22 (look step only): 8/8 each, preview 1.37 to 1.66 s |
| C3 App-wide theme | Merged (PR #16); emulator checked (runs 24, 25) | PR #16 | Cloud: unit tests (tokens v2 keep the built-in colours and the reader's control colours, page CSS unchanged on Light and Night, app theme resolution, no hard-coded colour in `src/app`, `src/reader`, `src/look`, `src/ui`), type check, reader bundle, Android JS export |
| C4 Colours and custom themes | Merged (PR #17); emulator checked (runs 27 to 32) | PR #17 | Cloud: unit tests (hex to HSV and back over 10 000 colours, user theme parsing, theme resolution from the base, delete falls back to the base in every layer, Revert with a deleted theme, contrast flags, the three book colour modes, the page's faint-text marking), type check |
| C5 Bars editor | Merged (PR #18); emulator checked (runs 33 to 37) | PR #18 | Cloud: unit tests (migration draws the same bars for old lists in every layer, zone layout, one place per control, editor moves and refusals, bar frames, default tap bars), type check, Android JS export. Emulator run 33 (14c6095): quick matrix 135 checks, 2 failed (the known noteref turns), default bars pixel-identical before and after; moves, add, Save, leave dialog and every bar style pass. Runs 34 and 35 recheck the fixes: panels scroll into view, a floating 80 % bar with large icons keeps one row in the book and the preview, see-through bars read cleanly, the last tab is remembered. Runs 36 and 37 check the Codex fixes: a crowded 50 % bar stacks its zones in the book and the preview with nothing overlapping, and an unsaved draft carried to another profile saves only its own edit |
| C5b Drag to reorder within regions | Merged (PR #19); emulator checked (run 38) | PR #19 | Cloud: unit tests (a drop reorders within a zone, crosses zones, never leaves its region, a full zone refuses), type check. Emulator run 38 (e002e89, injected long press and drag): reorder in a zone, into another zone, drop outside cancels, a swipe on a chip scrolls without dragging, long press alone and tap unchanged, landscape drag, Cancel leaves the bars pixel-identical |
| C6 Library look | Built; emulator check next | `claude/project-thread-jxy4a7` | Cloud: unit tests (the four shelf options move from the look to global once, a file saved since keeps its own values, the default shelf matches the old one, pill colour and text rules), type check |
| C6b Library colours and fonts | Planned | | |
| C7 Reading bookmark | Planned | | |
| C8 Preview current book | Later, optional | | |

Open before this plan starts: PR #11 (touch reset, unmerged, waiting on an emulator rerun) and PR #10 (matrix text size). Neither blocks C1.

---

### C5 notes (2026-11-27)

Built: each tap bar (top, the bottom panel's upper and lower rows) is three zones (`layout.<bar>.start|center|end`) plus an arrangement (`layout.<bar>.arrange`: in zones, or spread out). Saved single lists migrate in `cleanLayer` (`migrateBars`, src/settings/bars.ts) into the zone that draws them in the same place, with their old spread, in every layer; a test renders old and new for several lists. `barRow` lays out a row for the reader and the preview alike: start left, centre centred, end right, a zone with the slider or title takes the free width, and a control is drawn once, in the first place it appears. The Bars tab (src/look/BarsEditor.tsx) shows the header line, the three bars and the footer line as zones; tapping an item gives ◀ ▶ (along the row, across zones), ▲ ▼ (to the row above or below that takes it) and Remove, also as accessibility actions, and + adds what isn't placed anywhere else; full zones and edges are refused with a short message. It is a draft with Cancel and Save, sharing the header and leave dialog with the theme editor, and the preview draws the tap bars with zone outlines while the tab is open. Bar style (applies at once, like other simple settings): position (at the edge or floating), background (solid, see-through, none), width 50 to 100 %, corners, bar height, control size, labels or icons only, and the space between controls; titles truncate in the middle.

Not in this milestone: style settings for the header and footer lines, per-element sizes (one control size for all bars), and tapping an element in the preview to select it (the list editor does that); drag to reorder is C5b.

### C4 notes (2026-11-27)

Built: `custom.themes` (`UserTheme = { id, name, base, tokens }`, only changed tokens stored, so a theme follows its built-in) and `custom.recentColours` (last 8); `theme.id` and `app.theme` are a `theme` setting type taking built-in and user ids; deleting a theme moves every layer and the app theme to its base, with Undo for the theme itself. Colours tab: the theme list (choose, Edit or Edit a copy for built-ins, Duplicate, Delete, + New theme, a Low contrast mark) and the theme editor as a draft with Cancel and Save in the header, "Save changes to <name>?" (Keep editing, Discard, Save) on leaving, the preview showing the draft. Tokens are grouped (Page, Reading bars, Controls, Sheets and dialogs, Library and Settings), each with its swatch, hex, a drawn example on its background, a "Low contrast 2.8:1" tag and Reset. The picker (`src/look/ColorPicker.tsx`, Skia gradients): saturation and brightness square, hue strip, opacity strip for see-through tokens, hex, RGB and HSL fields, swatches of the theme's colours and recent ones, one-step accessibility actions on every handle. New setting **Book colours** (`theme.bookColors`): Auto (as before), Keep the book's (the page marks text under 3:1 on what is behind it and gives it the theme's ink, `src/reader-page/book-colors.js`), Use the theme's. The page now draws a theme's own heading, visited link, caption and rule colours when they differ from what they derive from, so the built-ins' CSS is unchanged. Slider fill and thumb have their own tokens.

Emulator run 27 (dfda88b): quick matrix 135 checks, only the 2 known noteref failures; every manual step passed (copy of Night, picker drags without the list scrolling, hex entry, Save/Discard/Keep editing on Back, red links in Frankenstein and the app following the theme, delete with fallback to Night, the three book colour modes on the sample's callout), no errors in logcat. After it: the opened picker and the editor's heading scroll into view, and the colour test reads its folder with `fileURLToPath` so it passes on Windows. The sample's first preview page has no link, so a link colour shows after turning a page. Runs 28 to 31 tuned the picker under the preview: gradients are view background images (a Skia canvas opened below the screen edge stayed half drawn), the square shrinks to fit, and in a short list the picker scrolls to the top with a one-line name of the colour, so the square, hue and opacity strips all sit above the gesture bar.

Not in this milestone: tapping an element in the preview to select its token (the preview's taps turn its pages; it needs a page-side hit test, kept for a follow-up). Highlight and image frame stay hidden in the editor until annotations and figure frames draw them.

### C3 notes (2026-11-27)

Built: tokens v2 in `src/settings/themes.ts` (built-ins state their 8 colours and `expandTokens()` derives the rest, so the reader looks the same); `Chrome` (src/reader/chrome.tsx) carries the control, sheet and app tokens; the root layout provides the **app theme** (`app.theme`, default "Same as reading theme", resolved from profile and global only, `appThemeId()`) to every screen outside a book, plus header, status bar and screen background; the library (rows, pills with `pillDefault`, book sheet, busy overlay, empty state), Settings (with a Library and Settings theme chooser), Reading Look opened from Settings, and the reader's opening/failed overlays and notices take theme colours; `confirm()` with a themed `ConfirmHost` replaces every `Alert.alert` (delete book, import summary, font errors and removal, the web link question), in the book's theme when asked from a book. Dead fixed colours in the Back pill, Contents and progress slider styles are gone. After emulator run 24 (screenshots of every screen and dialog in Light, Paper, Night and High contrast): High contrast's bars are now white with black ink and a black divider (blue on its old black bars was 1.9:1, and its status bar icons vanished), status bar icons follow the bar colour's lightness, the reader's bars are opaque (book text showed through), switches take the theme's accent, and a test checks every built-in theme's text and accent pairs (4.5:1 text, 3:1 accents). Run 25 confirmed: High contrast is all white with black text and an 11.2:1 accent, readable status bar icons, opaque bars in Light and Night, switches in the accent. Run 24's quick matrix: 135 checks, only the 2 known noteref failures. The dimmer and warmth veils keep their fixed colours on purpose (marked `colour-ok`).

Limitations: the new page tokens (heading, visited link, rule, image frame and caption) exist but the page doesn't use them yet; they become editable and reach the page with C4 (done, see C4 notes). The Android navigation bar isn't coloured separately (edge to edge, it shows the screen behind it).

### C1 notes (2026-11-26)

Built: `/look` route (old `/customize` redirects), fixed top with profile chips, text size slider, theme swatches and Saving to; Revert; tabs from the registry with "from …" labels; `SettingSlider` for every number setting; profile rename, duplicate, update from current and delete with Undo; Aa opens the editor over the mounted reader; the reader's back handler stands aside while another screen is on top and the place is saved on blur; library format 2 with the native one-time backup; text size in 1 % steps. The quick panel is removed.

Limitations: the Colours tab only picks a built-in theme (custom colours are C4). The editor uses the reading theme's colours; the rest of the app is still unthemed (C3). Revert does not bring back a font file deleted during the visit. No live sample preview yet (C2): from a book, the book under the editor shows the result after Back.

Verified on the emulator (run 14): Aa's editor opens over the book; closing it with the command or the back key returns to the same page; the backup is made once and matches the old file. Run 14 screenshots showed the fixed top taking about 45 % of a tall screen; the text size row was made a single line afterwards; run 15 (emulator, 1c6e8bf, Frankenstein only) passed 36/36 and the fixed top is now about 27 % of the screen with the size row on one line. Phone run 16 passed; during it a matrix tap hit a web link and a later tap confirmed the Open dialog (fixed in the matrix, 0befcd1). Not checked yet: TalkBack, a 360 dp screen, profile menu and Revert by hand.

### C2 notes (2026-11-26)

Built: `assets/sample/quire-sample.epub` (6.4 KB, made by `npm run sample` from `scripts/build-sample.mjs`, deterministic so it imports once with a stable id); `src/look/PreviewPane.tsx`, a second WebView with the real reader page, opening the sample through the reader's own open message (`src/reader/open-message.ts`, shared with the reader) and receiving the same `look` messages; colour changes go at once, relayouts at most every 120 ms; the page is laid out at the screen's width and drawn at 0.62 scale so lines break as in a book; the reader's own header and footer lines with sample info; side taps turn the sample's pages; Hide/Show above the pane (30 % of the screen height in portrait, 40 % in landscape). The matrix's Reading Look step waits for the preview's `opened` note.

Limitations: "Preview current book" is C8. The preview takes about 1.3 to 1.4 s to appear on the emulator (a spinner shows meanwhile); its first open per install also imports the sample.

Verified on the emulator (runs 17 to 22): the sample page fills the pane, centred, with whole lines; Dark applies to the preview and the editor; the Informative bar preset shows a header and footer inside the preview; dimmer and warmth veil the preview; Revert puts everything back. Fixes from those runs, all in this milestone: sliders only slide on a sideways drag and let vertical swipes scroll the list (15/15 swipes on tracks scrolled, no value changed); a tap on a track still jumps there; the preview gives way when the settings list would get under 160 dp, and in a short (landscape) window the top block scrolls with the list while the tabs stay fixed (list area ~141 px → ~760 px); while the keyboard is up the preview folds (still loaded, no reload) and the typed field scrolls above the keyboard; Back closing the keyboard keeps the typed value. Not checked yet: a phone pass, a 360 dp screen.

## 8. Checkpoints and handoff

Applies to every milestone and to every thread working on one.

- **Checkpoint early and often.** Each milestone is cut into steps that each end in a commit pushed to the fork with tests passing (or the failing ones named in the commit message). No step leaves work only in a working tree.
- **When usage information is available:** at roughly **85 to 90 %** of the session's capacity, stop starting substantial work (no new feature step, no full test suite). Spend the rest finishing the current step, running the essential checks, updating this file and PROGRESS.md, committing and pushing. The aim is a handoff that is **already complete by 95 %**. If several threads are active, they all use the same thresholds and each checkpoints its own branch; none discards another's changes.
- **When usage information is not available,** no thread claims to track a percentage. Instead it keeps steps small and pushes after each one.
- **Every handoff records:** the branch, the last commit and whether it is pushed; what is done and what is not (with an explicit status such as "in progress, does not build" rather than presenting it as finished); affected files; tests run and their results, including known failures; and the exact next step. It goes in this file's status table and in the PR description. A blocked commit or push is reported as blocked, with the error.

## 9. Changes after Omer's review (2026-11-26)

1. Aa now opens the unified editor, with the profile row, text size and theme fixed at the top and deeper settings in tabs; the separate quick panel retires (C1).
2. Preview accuracy is defined as rules and a parity test; "Preview current book" is a later optional mode (C8), and the sample stays the default (section 4).
3. Themes are colours only; profiles hold everything else and may pick a theme by name (2.5).
4. Dragging is bounded to reordering within a region plus alignment controls; free positioning is out of plan (C5b).
5. The bookmark has separate Set and Go actions and controls, an invariant that only Set or Remove changes it, and tap/double-tap configuration for its control and an optional dedicated gesture region only (C7).
6. Editing safeguards: simple settings save at once with a Revert for the whole visit; theme and bar editing are drafts with Cancel and Save; built-ins are copied before editing; resets from one setting up to everything (2.6).
7. Checkpointing starts at 85 to 90 % with a completed handoff by 95 %, only when usage information exists (section 8).

## 10. Open questions, with the default used if there is no answer

1. **May a profile pick a theme?** Default: yes, by name only (Night profile → Night theme), never by storing colours. Alternative: profiles never touch the theme, and theme is chosen separately.
2. **App theme separate from the reading theme?** Default: one theme for both ("Same as reading theme"), with an option to pick a different app theme.
3. **May a profile carry library layout (pill size, spacing, fonts)?** Default: yes; colours still come from the theme.
4. **Replacing a bookmark: confirm or Undo?** Default: ask once before moving it ("Move your bookmark here?"), with a setting to switch to an Undo toast.
5. **Bookmark defaults.** Default: feature off; Go by single tap; no gesture region; books open at the last-read place.
6. **Custom bar sizes: presets or free numbers?** Default: Compact and Comfortable, plus a custom slider in an "Advanced" fold.
7. **Publisher colours.** Default: `auto` (today's behaviour: keep the book's colours on light themes, replace them on dark ones).
