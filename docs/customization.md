# Customization design

Status: partly implemented as of 2026-11-23, through `m4-bars` at `cec1b25`. This document describes the target design for Milestones 4, 5, 7 and 8, not a list of shipped features. It covers Quire's appearance and behaviour, rearrangeable reader controls, and planned page-turn animations.

## Implementation status

| Area | Current implementation | Still planned |
|---|---|---|
| Settings and profiles | Typed registry; default/global/profile/book/session resolution; saved profiles; Settings > Reading look screen; Aa edits the active profile or book | Preset/profile export and import; settings search |
| Typography and light | Publisher-relative text scale, spacing, alignment, margins, bundled/imported fonts, brightness, dimmer and warmth | Further advanced typography controls described below |
| Themes | Seven built-in themes; themed reader chrome and footnote sheet | Custom theme editor and theme sharing |
| Information bands | Six header/footer slots; title, author, chapter, chapter page/count, pages left, percent and clock; Bare/Classic/Informative presets | Battery and reading-time elements; live drag editor |
| Control rows | Configurable top bar, quick row and bottom bar; Back, title, Contents, Aa, flow, chapter controls, slider and percent; wrapping on narrow screens | Bar styling, auto-hide options, additional actions and drag editing |
| Library | Minimal rows or cover-coloured pills; optional covers, authors and progress | Folders, tags and the broader library design |
| Page turns | Instant turns; registry placeholders for none/slide/fade, hidden from Reading look because effects are not implemented | Skia feasibility spike, overlay engine, effects, tunable packs and imports |
| Gestures | Existing page taps/swipes and tap-direction setting | Assignable action catalog, edge gestures, volume keys and 3-by-3 grid |

Layout presets currently replace only the six information slots; they do not replace the three control rows. The full preset descriptions below remain design targets. Reading-look changes preserve an anchor across repeated edits until the reader navigates. See [PROGRESS.md](../PROGRESS.md) for validation evidence and outstanding device checks.

## The short version

- **Minimal by default.** A fresh install shows the book's text and nothing else while reading. Controls appear on a tap in the middle of the page and are few. The library starts as plain book pills. Everything else is opt-in.
- **One settings model for everything.** Every option, from font size to where the clock sits to the page-turn style, is a typed setting in one registry. Settings stack in layers (built-in defaults, then global, then a reading profile, then this book), so per-book overrides and profiles come for free and work for every setting, not only typography.
- **Presets are bundles of settings.** A theme, a typography look, a reader layout and a page-turn style are each a named bundle of some settings. They can be saved, switched in one tap, exported as a small file and imported on another phone.
- **The reader layout is built from slots.** A fixed set of places around the page (header and footer lines, the top and bottom control bars, a quick row) each hold elements picked from a catalog. Editing happens on the live reader. No free pixel placement.
- **Page turns are a snapshot overlay with a shader.** The page turns instantly underneath, as it does today, and an image of the old page is animated away on top. Every style, built-in or user-made, is the same small package: a manifest of parameters plus one SkSL fragment shader.
- **Making your own animation has three depths.** Anyone can tune a style's sliders (duration, colour, curl size, ember glow) and save the result as a preset in seconds. Anyone can share or import presets. People who can write a few lines of shader code can make entirely new styles as packs. A keyframe editor and CSS packs were considered and rejected (see below).
- **The line we don't cross.** No plugins or scripts, no custom CSS for the app's own interface, no free-form layouts, no user-defined actions beyond the action catalog. That is what separates "customize the reader" from "build your own reader".

## 1. Principles

1. **Nothing on screen that the reader didn't ask for.** Defaults are the bare minimum that still lets a first-time user find their way: tap the middle for controls, tap the sides to turn.
2. **Every option is reachable in two taps from the reader, and none is required.** A quick panel holds the handful that people change while reading. Everything else lives in Customize, grouped, with search.
3. **Live preview, always.** Every change applies to the open page immediately and keeps the reading position. Every group has a one-tap reset.
4. **Depth is layered, not mixed.** Normal settings, presets, and the power-user layer (animation packs, a book CSS snippet) are visibly separate, so the simple path never shows code.
5. **Safe to share.** Anything that can be imported from a stranger (presets, themes, animation packs) is data or sandboxed GPU code. It can't read files, reach the network, or run JavaScript.
6. **Fast stays fast.** Customization never slows page turns past the spec's 100 ms, never drops frames in scroll mode, and never re-lays out the book for a change that doesn't need it (colours and chrome changes don't repaginate).

## 2. Settings architecture

### 2.1 The registry

Every setting is declared once in a registry (`src/settings/registry.ts`), with:

| Field | Example |
|---|---|
| `key` | `type.fontSize`, `layout.footer.right`, `turn.style` |
| `type` | number with range and step, choice, colour, font, boolean, element list |
| `default` | `100`, `"none"`, `[]` |
| `group` | Typography, Theme, Layout, Page turns, Gestures, Library, Behaviour |
| `scopes` | which layers may override it (some, like the library layout, are global only) |
| `relayout` | whether changing it repaginates the book (font size yes, link colour no) |
| `depth` | `quick` (in the reader's quick panel), `standard`, or `advanced` |
| `label`, `help` | i18n keys |

The Customize screens, the quick panel, search in settings, reset buttons, backup, export and import are all generated from the registry, so adding a setting is one entry plus the code that honours it. Unknown or out-of-range values from a file or an old version are dropped, not trusted.

### 2.2 Layers

The value the reader uses is resolved from the top down, first match wins:

1. **Session**: a temporary change, such as the brightness slider moved while reading (not saved unless the reader says so).
2. **This book**: per-book overrides, saved in `book_settings`.
3. **Active reading profile**: a named bundle ("Day", "Night", "Commute"), switchable in one tap; it can switch on a schedule or with the system's dark mode.
4. **Global**: what the user set in Customize.
5. **Built-in defaults**: the minimal defaults.

Each setting control shows where its current value comes from ("from this book", "from Night") with a one-tap "use the global value". This is the spec's per-book overrides and reading profiles (4D, P1), raised to P0 because Omer's goals depend on them, and generalized to every setting.

### 2.3 Presets

A preset is a named partial bundle of settings limited to one group. Built-in presets ship with the app and can't be edited, only duplicated.

| Preset kind | What it holds | Built-ins |
|---|---|---|
| Theme | palette tokens (2.5) | Light, Paper, Gray, Dark, Black, Night, High contrast |
| Text look | font, size, spacing, alignment, hyphenation, margins | Default, Classic book, Large and airy, Dyslexia-friendly |
| Reader layout | slot contents, bar style, gestures | Bare (default), Classic, Informative |
| Page turn | style id plus its parameter values | None (default), Slide, Fade, Curl, Flip, Burn |
| Library look | pill style, density, shown fields | Pills (default), Covers grid, Compact list |

A reading profile is a set of presets plus loose settings, so "Night" can mean the Night theme, a dimmer, larger text and no animation at once.

### 2.4 Sharing format

Presets, profiles and themes export as a `.quire` file: JSON with a format version, the app version, a kind, and only registry keys. Animation packs are a separate `.quireturn` file (section 5.5). Sharing uses Android's share sheet, and import accepts the file from "Open with", Share or the picker, the same paths PR 3 added for books. Settings import/export was spec P1 (4L) and sits with backup in Milestone 7.

### 2.5 Theme tokens

A theme is a small palette, not a stylesheet: `page`, `ink`, `inkMuted`, `link`, `selection`, `highlight1..5`, `chrome` (bar background), `chromeInk`, `accent`, plus `chromeOpacity` and an optional paper texture choice. The reader page turns tokens into CSS variables for book content, the note sheet and popups; the app turns them into React Native styles for bars, panels, the library and the status bar. One palette drives everything, so the spec's "themes apply consistently" rule (4E) holds by construction. The custom theme editor edits tokens with live preview and contrast warnings.

### 2.6 What's in each group

- **Typography (4D):** font (bundled, imported, publisher, system), size, line height, paragraph spacing, first-line indent, letter and word spacing, weight boost, alignment, hyphenation, publisher-styles switch with granular overrides, max line width in scroll mode.
- **Page:** horizontal and vertical margins, the header and footer band height (follows the elements in it), columns on wide screens.
- **Theme and light (4E):** theme, brightness, software dimmer, warm filter, auto-switching, dark-mode image handling.
- **Layout (section 3):** slots, bar style, auto-hide.
- **Gestures (3.5):** tap zones, swipes, edge swipes, volume keys, long press.
- **Page turns (section 5):** on or off, style, its parameters, follow reduce motion.
- **Library (section 4):** view, pill style, shown fields, grouping, sort.
- **Advanced:** book CSS snippet (P2), animation packs, export and import.

## 3. Reader layout

### 3.1 Two layers on the page

- **Ambient elements** sit in the page's top and bottom margin bands and stay visible while reading, like a printed running head and folio. Default: none.
- **Controls** appear when the reader taps the middle of the page and hide again on the next tap or after a timeout. Default: a short top bar with Back, and a bottom bar with the progress slider and Contents.

### 3.2 Slots

The page has fixed slots. Each holds an ordered list of elements (zero or more).

```
��������������������������������������Ŀ
� [top bar: left ����������� right]    �  controls
� header:  left    center    right     �  ambient
�                                      �
�              book text               �
�                                      �
� footer:  left    center    right     �  ambient
� [quick row: �������������������]     �  controls
� [bottom bar: ��� slider ���]         �  controls
����������������������������������������
```

Slots, not free placement, because they keep every layout readable at any font size and screen width, they line up with foliate's header and footer margin bands (today `applyMargin` in `src/reader-page/app.js` sizes those bands for the system bars), and they are easy to edit with a thumb.

### 3.3 Element catalog

| Ambient (information) | Controls (actions) |
|---|---|
| Book title, author, chapter title | Back to library |
| Page in chapter, pages left in chapter | Contents (chapters) |
| Book percent, thin progress line | Previous and next chapter |
| Time left in chapter or book (from reading speed, Milestone 7) | Progress slider with chapter ticks |
| Clock, battery | Paged or scroll switch |
| Bookmark ribbon on bookmarked pages | Bookmark this page |
| | Search in book |
| | Quick panel (Aa): size, font, theme, brightness, spacing |
| | Annotations and quotes |
| | Profile switch |
| | Rotation lock, keep screen on |

Ambient elements take the theme's muted ink and the book's font size scaled down, so they read like part of the page. Controls follow the chrome tokens.

### 3.4 Editing the layout

- **Edit layout** (from Customize, or a long press on a bar) opens the live reader with every slot outlined, empty ones included. Tapping a slot opens a sheet with the catalog; elements can be dragged within and between slots, or removed. Changes show at once on the real page.
- The same layout is also editable as a plain list in Customize (slot by slot), for screen readers and for people who don't like drag and drop.
- **Bar style:** background (theme chrome, translucent, or none), size (compact or comfortable), labels or icons only, auto-hide after N seconds, and whether controls float over the text or the text shrinks to make room (float by default, so the page never reflows).
- Layout presets: **Bare** (default: nothing ambient; Back on top; slider and Contents at the bottom), **Classic** (title and chapter in the header, page and percent in the footer, full bars), **Informative** (adds clock, battery and time left).

### 3.5 Gestures and actions

Gestures map to the same action catalog the controls use, so anything a button does a gesture can do:

- Tap zones: left, middle and right by default (with the existing "reading" or "screen" direction setting); a 3�3 grid with an action per cell as P1, which also gives the spec's left-handed layout.
- Horizontal swipe turns pages (fixed). Vertical swipes, edge swipes (brightness on the left edge, font size on the right, spec 4E P1), a two-finger tap and volume keys are assignable.
- Chapter navigation from anywhere (a horizon goal): Contents is in the default bottom bar and can also be put on a gesture or in the header, so it is never more than one tap away.
- Long press stays reserved for text selection.

### 3.6 Margins

Margins are typography settings (page margins left and right, top and bottom), applied through foliate's `margin` and `gap` attributes and the reading CSS. The header and footer bands grow to fit the ambient elements in them and the system bars, so text never sits under a clock or a notch. Changing margins repaginates, so it is debounced while a slider moves.

## 4. Library

The library thread (PR 3, "Make Quire usable as a normal app") owns the library's look. This design gives it the same shape as the reader so the two stay consistent:

- **Default is stripped down:** book pills with title and author, the pill tinted with the average colour of its cover (a neutral tint from the title when there is no cover), and nothing else. The Power Moby-Dick duplicate goes away there.
- **Everything else is opt-in** through the same registry: show cover, progress, status, series, tags; pill colour from the cover, the theme, or a custom colour per book or folder; density; list pills, covers grid or compact list.
- **Organization (Milestone 5):** nested folders, plus tags. Genre and theme groupings start as tags seeded from the book's `dc:subject` and can be renamed, merged or added by hand. The library can group by folder, tag, author, series or status.
- Library looks are presets like any other (2.3), and the theme tokens colour the library too.

## 5. Page-turn animations

### 5.1 Requirements (from spec 4F)

An on/off toggle; built-in styles from simple (slide, fade) through pretty (curl, flip) to flashy (burning pages); turns that still land within about 100 ms with the effect playing over them; scroll mode only none or fade; reduce motion respected; styles self-contained so new ones can be added without touching the reader. Omer's addition: people should eventually be able to make their own.

### 5.2 How turns work today and why that matters

foliate's paginator lays a chapter out in CSS columns inside an iframe and turns a page by changing the scroll offset. Quire keeps foliate's own animation off and turns are instant. That means there is only ever one live page: the old page's DOM is gone the moment the offset changes. Any effect that shows the old page leaving (a curl, a burn) needs a picture of it. CSS can't animate something that no longer exists, which rules out CSS-based styles (5.6).

### 5.3 The engine: snapshot overlay

1. **Capture when idle.** After each relocate settles and nothing is open on top (note sheet, selection, controls), the app captures the reader view as a GPU image. It is ready before the next turn is asked for, so a tap costs no capture time. If the image is stale or missing, that one turn is simply instant.
2. **Turn underneath, at once.** On a tap or swipe, the overlay is shown with the snapshot at progress 0, which looks identical to the page, and the page turns instantly beneath it, exactly as today. The turn's timing (`turnMs` in the matrix) is unchanged.
3. **Animate the overlay away.** A fragment shader draws the old page at each progress value from 0 to 1. Wherever it outputs transparency, the real new page shows through. When it reaches 1 the overlay hides.
4. **Never block reading.** A tap during an animation finishes it immediately and starts the next turn. Fast readers are never slowed by a pretty effect.
5. **Swipes drive progress.** For styles that support it, a horizontal drag sets progress from the finger, so a curl follows the thumb. The turn happens underneath as soon as the drag's direction is clear; a cancelled drag turns back, instantly, underneath.
6. **Optional second image.** A style that needs the new page as a texture (a cross-dissolve with distortion, many published transitions) declares it, and the app captures the new page right after the turn. That holds the old page for a frame or two, which reads as the start of the effect.

Rendering: **react-native-skia** runtime effects (SkSL) on a canvas above the WebView, fed by a native capture of the WebView. Skia is MIT-licensed and actively maintained (Shopify); it is a new dependency, so Milestone 4 starts with a spike that records in `DECISIONS.md` its size cost, capture time on the Xiaomi 15T, first-frame latency and frame times at 120 Hz. The fallback, if capturing the WebView through Skia is unreliable, is a small Kotlin capture in the existing native module (`PixelCopy` or `WebView.draw` into a hardware bitmap) handed to Skia as an image. Android's own AGSL would avoid the dependency but needs Android 13 and a hand-written view; it stays the second option.

Scroll mode keeps none and fade, done with the same overlay. Reduce motion forces none unless the reader opts back in, and a style can declare a gentler reduced variant (for example, a burn that becomes a short fade).

### 5.4 What a style is

Every style, including the built-ins, is a **turn pack**:

- `manifest.json`: id, name, author, licence, format version, whether it supports drags, whether it needs the new page image, default duration and easing, and its parameters, each with a type (number with range, colour, on or off, choice), label and default.
- `turn.sksl`: one function that returns the overlay's colour and alpha at a point for a given progress.

The app supplies the inputs: the old page image (and the new one if declared), `progress` (0 to 1, eased, or from the finger), `direction` (forward or back, already mirrored for right-to-left books), `touch` (where the finger is, for drags), the canvas size, elapsed time, the theme's page, ink and accent colours, and the pack's parameters as uniforms.

A minimal fade is a handful of lines; a page curl or a burn with a noise mask and ember edge is 60 to 150. The built-ins are written in this format and nothing about them is special, which guarantees the format is complete and that "added later without touching the reader" (4F) is true.

Built-ins and their parameters:

| Style | Parameters |
|---|---|
| None | |
| Slide | duration, easing, shadow strength |
| Fade | duration |
| Curl (drag) | duration, curl radius, shadow, back-of-page tint, show text through the back |
| Flip (drag) | duration, page thickness, shadow |
| Burn | duration, edge glow colour, glow width, ember amount, smoke on or off, where it starts (corner, edge, random) |

### 5.5 Making your own: three depths

| Depth | Who | Effort | What they do |
|---|---|---|---|
| **Tune** | anyone | seconds | Pick a style, move its sliders and colour pickers with a live preview page, save as a preset ("Slow blue burn"). |
| **Share** | anyone | a tap | Send a preset as a `.quire` file or receive one. Presets of built-in styles are plain data. |
| **Create** | people comfortable with a little code | an hour or more | Write a new `turn.sksl` with a manifest, zip it as `.quireturn`, and import it. It then behaves like a built-in: tunable, shareable, usable in profiles and per book. |

For creators, the repo gets `docs/turn-packs.md` with the inputs, a template, the built-ins as worked examples, and how to preview a pack. Many existing open transitions (for example the MIT-licensed gl-transitions collection, written in GLSL) port to SkSL with small edits, so a creator rarely starts from nothing; each port keeps its own licence in its manifest. An in-app code editor with live preview is P2: writing on a phone is awkward and the import path already serves people who write on a computer.

Is it too much hassle? For most people the honest answer is that they will never write a shader, and they don't need to: tuning covers "make it mine" for nearly everyone and takes no learning. Creating is real work, comparable to making a theme for a code editor, which is why it lives behind import and documentation rather than in the main UI. The value is that the few who do it can share the result with everyone else as one file.

### 5.6 Approaches considered

- **Keyframe or parameter timeline editor** (positions, rotation, opacity over time): rejected. It can only move, rotate, scale and fade flat rectangles, which the sliders on Slide and Fade already cover; it can't express a curl or a burn, which are what people actually want; and a timeline editor is a lot of UI to build well on a phone. A simple "maker" that generates a pack from choices (motion, edge effect, colour) could come later on top of the pack format if people ask for it.
- **CSS animation packs:** rejected. The old page no longer exists to animate (5.2); keeping two live renderers to make it exist would double memory and break the turn timing; CSS can't do burns or curls convincingly; and injected CSS is a much bigger surface than a shader.
- **JavaScript animation scripts:** rejected. Arbitrary code from a shared file is exactly what the spec's security rules forbid.
- **Lottie or video overlays:** not for the turn itself, since they can't deform the page. They could add decorative layers later (sparks over a burn), but that isn't needed.
- **Shader packs (chosen):** one small, well-defined input, enough power for every style on Omer's list, GPU-fast, and safe to share. SkSL runtime effects only allow bounded loops and have no access to files or the network.

### 5.7 Safety and performance guards for packs

- Import checks the manifest against a schema, caps the shader at 64 KB, and compiles it once; a compile error shows the line and message and nothing is installed.
- The preview measures frame times. During real use, if a pack misses the frame budget on several frames in a row it is switched to Fade for the rest of the session and the reader is told once.
- A pack can't change the reading position, input handling or turn timing. It only draws the overlay.
- Imported packs are listed separately from built-ins with their author and licence, and can be removed.

## 6. Where the line is

Customizable: anything in the registry, any slot's contents, any preset, any animation through packs, the book's CSS through one advanced snippet (P2; book content only, under the existing CSP, so no network or scripts).

Not customizable, on purpose:

- No plugins, no scripts, no extension API.
- No custom CSS or layout for the app's own screens.
- No free placement of elements or new slots; no custom actions beyond the catalog.
- No changing how books are parsed, paginated or how notes are detected.

## 7. Milestone mapping

| Milestone | Customization work |
|---|---|
| **4: Customization foundation, typography, themes, page turns** | Settings registry with all five layers, reading profiles and per-book overrides; quick panel and Customize screens generated from the registry; typography and margins (4D); theme tokens, built-in themes and the theme editor (4E); brightness, dimmer; reader layout slots, element catalog, Edit layout mode and the three layout presets; gestures mapped to actions (3�3 grid stays P1); the turn-pack format, snapshot overlay engine and the six built-in styles with tunable parameters and saved presets. Starts with the Skia spike. |
| **5: Library and folders** | Library looks and fields through the registry, cover colour pills (from PR 3) as the default, folders, tags seeded from `dc:subject`, grouping. |
| **7: Search, stats, backup** | `.quire` export and import for presets, profiles and themes, alongside full backup; time-left elements use reading speed. |
| **8: Polish and hardening** | `.quireturn` import, `docs/turn-packs.md`, pack guards; layout list editor accessibility pass; 3�3 tap grid and left-handed layout. |
| **9 (stretch)** | In-app pack editor, book CSS snippet, a pack "maker" if wanted. |

## 8. Open questions for the Milestone 4 plan

- Skia capture of a WebView on Android: reliable on the Xiaomi 15T, and how long? Decides between `makeImageFromView` and a Kotlin capture.
- Memory cost of keeping one or two page images at full resolution on a 1.5K screen (about 10 MB each); may need half-resolution for styles that blur anyway.
- Whether the idle capture can be skipped while the controls are open without making the first turn after closing them instant-only.
