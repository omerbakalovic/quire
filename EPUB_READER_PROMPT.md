# Build Prompt: Full-Featured Mobile EPUB Reader

> **For you (not the agent):** Paste everything below the line into Grok Build, or save it in your repo as a spec file and tell the agent to read it first. Items in [brackets] are decisions you can change before you start.

---

## 1. Role and goal

You are building a **mobile EPUB reader app** for [iOS and Android]. It should feel like a premium, dedicated reading app, not a demo. Priorities in order:

1. Reading quality (typography, pagination, reliable position restore)
2. Excellent footnote/noteref handling for annotated books
3. Deep customization (fonts, themes, brightness, layout)
4. Personal knowledge tools (bookmarks, highlights, quotes)
5. A well-organized local library with folders

The app is **local-first and offline**: no accounts, no analytics, no network calls except what the user explicitly triggers.

Priority tags used below: **P0** = must-have for v1, **P1** = should-have, **P2** = stretch.

---

## 2. Working agreement (read carefully)

This is a large project. **Do not try to build it all at once.**

- **Your first response must contain no code.** Reply with: (a) your stack decision and why, (b) the plan for evaluating the rendering engine, (c) a high-level architecture, (d) a detailed plan for Milestone 0 only, (e) at most five open questions for me.
- After I approve, work **one milestone at a time** (see section 7). For each milestone: write a short plan, wait for my approval, implement, run it, test it, summarize what works and what doesn't, commit, then **stop**.
- Never say something is done without verifying it. Show evidence: test output, a description of what you ran and saw, or the sample books it worked on.
- Maintain two files in the repo and keep them current:
  - `PROGRESS.md`: what's done, what's in progress, known bugs, what's next.
  - `DECISIONS.md`: each significant technical decision, alternatives considered, and why.
- Before adding any dependency, state why it's needed, its license, and how actively maintained it is. Prefer fewer, well-maintained dependencies.
- Keep code modular and typed. Separate: EPUB parsing/rendering bridge, storage, domain logic, UI. No file over ~400 lines without a good reason.
- Write unit tests for non-UI logic: note extraction, position/CFI handling, metadata parsing, folder operations, search indexing.
- If a requirement is ambiguous or two requirements conflict, ask me rather than guessing silently.

---

## 3. Technical decisions (defaults, editable)

- **Framework:** [React Native with Expo, TypeScript]. Use development builds if native modules are needed. If you believe Flutter or native is clearly better for this spec, say so in your first response with reasons.
- **Rendering:** Do **not** write an EPUB rendering engine from scratch. Evaluate **foliate-js** and **epub.js** (and any better option you find) in a hosted WebView. Compare on: EPUB 3 support, CFI support, pagination quality, custom styling injection, text selection and annotation hooks, performance on large books, maintenance, and license. Pick one in Milestone 0 and record it in `DECISIONS.md`.
- **Storage:** SQLite for library metadata, folders, bookmarks, annotations, settings, stats. File system for book files, covers, and imported fonts.
- **State/navigation:** your choice; justify it briefly.
- **Platforms:** [iOS and Android]. Use platform-appropriate behavior (for example, volume-key page turning on Android only).

---

## 4. Feature specification

### A. EPUB support and rendering

- **P0:** EPUB 2 and EPUB 3. Parse the OPF, spine, manifest, metadata, nav document (EPUB 3) and NCX (EPUB 2).
- **P0:** Two reading modes: **paginated** (horizontal page turns) and **continuous scroll**. Switchable at any time without losing position.
- **P0:** Images, tables (horizontal scroll when too wide), SVG, inline CSS, and embedded fonts. Handle embedded font obfuscation (IDPF/Adobe) so publisher fonts display correctly.
- **P0:** Robust against malformed EPUBs: missing metadata, bad paths, wrong media types, broken TOCs. Fail soft; show something readable rather than an error wherever possible.
- **P0:** Detect DRM-protected files (encryption beyond font obfuscation) and show a clear message. Do **not** attempt to bypass DRM.
- **P1:** Fixed-layout EPUBs at least gracefully (scaled single page view).
- **P1:** RTL languages (Arabic, Hebrew) and correct handling of CJK text. Vertical writing is P2.
- **P1:** Image viewer: tap an image to open it fullscreen with pinch-zoom.
- **P1:** Print-page numbers from the EPUB `page-list` when present, shown as an optional "Page X" label (valuable for academic/annotated editions).
- **P2:** Two-page spread in landscape and on tablets.

### B. Navigation and reading position

- **P0:** **Chapter navigation:** nested table of contents panel, highlight the current chapter, tap to jump, previous/next chapter buttons.
- **P0:** **Progress bar/slider** at the bottom with chapter tick marks, scrubbing with a preview of the target chapter/location, and a percentage readout.
- **P0:** **Position restore:** save position continuously and restore exactly after app restart, rotation, font/layout change, and process death. Store an **EPUB CFI** plus a fallback (spine index + fraction). Because page counts change with font and layout, compute progress from cumulative text length, not page numbers.
- **P0:** **Link handling:** internal links work across spine documents. External links ask for confirmation before opening in the system browser.
- **P0:** **Back stack:** after following any internal link (including from the TOC, footnotes, or cross-references), show a floating "Back to where you were" control and support the system back gesture. Multiple levels deep.
- **P1:** Estimated time left in chapter and in book, based on the user's measured reading speed (fall back to a default).
- **P1:** "Where am I?" overlay showing chapter title, progress, and location on a single tap-hold.

### C. Noterefs and footnotes (high priority, build this well)

The goal is that annotated books (classics with scholarly notes, translations, textbooks, Standard Ebooks-style endnotes) are a pleasure to read, with no jumping to the back of the book and losing your place.

**Detection (P0):**
- Noterefs: elements/links with `epub:type="noteref"` or `role="doc-noteref"`.
- Note targets: `epub:type` of `footnote`, `endnote`, `rearnote`, `note`, or `role="doc-footnote"` / `"doc-endnote"`, and `<aside>` elements. Also notes that are items in a notes list (`<li>` inside an endnotes `<ol>`).
- **Heuristic fallback (P0)** for books with no semantic markup (common in older EPUBs): treat a link as a probable noteref when its text is a number, symbol, or bracketed number, **or** it is wrapped in `<sup>`, **and** its target is in a notes-like section/file, or the target contains a back-link to the origin. Do not mistake chapter/TOC links or heading links for notes. Provide a setting "Aggressive note detection" (off by default) that loosens the heuristic.

**Content extraction (P0):**
- Resolve the target file and fragment, including targets in a **different spine file** (load that file in the background and extract just the note).
- Extract the correct block: if the id lands on an empty anchor, use the nearest enclosing `<li>`, `<p>`, `<aside>`, or `<div>`. Handle multi-paragraph notes (an `<aside>`/`<li>` with several `<p>`s, or a note that continues until the next note id).
- Preserve inline formatting (italics, small caps), images, and links inside the note. Strip the back-link arrow ("↩") from the displayed text but remember it for the "back to text" action.
- Sanitize extracted HTML before displaying it. Style it with the current font, size, and theme.

**Presentation (P0):**
- Default: tapping a noteref opens a **bottom-sheet popup** with the note text, scrollable if long, themed to match the reader. Actions: **Go to note** (jumps to the note's real location and pushes onto the back stack), **Back to text**, **Copy**, and **Next/Previous note** within the chapter.
- Notes can contain their own noterefs or links; support chaining (stack of popups or in-popup navigation) without breaking out of the reader.
- Setting: noteref behavior = **Popup** (default) / **Expand inline** / **Jump to note**.
- **Tap targets:** noterefs are usually tiny superscripts. Expand their hit area to a comfortable minimum (about 44×44 dp equivalent) without changing the layout, and give an option to style them (color, subtle underline, bracketed).
- Long-press on a noteref must not start text selection.

**Extras:**
- **P1:** "Notes in this chapter" panel listing every noteref in the current chapter with a preview; tap to jump.
- **P1:** Note count indicator in the chapter list for notes-heavy books.
- **P2:** "Footnote tray" for paginated mode: a collapsible strip at the bottom showing all notes for the current page, like printed footnotes.

### D. Typography and custom fonts

- **P0:** **Adjustable font size** with fine granularity (for example 60% to 300%, finer steps near the default) via slider and +/- buttons. **P1:** pinch-to-zoom font size in the reader.
- **P0:** **Font selection:** a bundled set of fonts with redistribution-friendly licenses (for example OFL: Literata, Source Serif 4, Lora, EB Garamond, Merriweather, Inter, Atkinson Hyperlegible; also a dyslexia-friendly option if its license allows). **Verify and record the license of every bundled font.** Plus "Publisher's font" and "System font".
- **P0:** **Custom font import:** user can import TTF, OTF, WOFF, or WOFF2 files; the app detects the family name, previews it with sample text, stores it, and makes it selectable. Allow deleting imported fonts. Make sure imported fonts actually load inside the rendering WebView.
- **P0:** Font fallback chain so symbols, CJK, and RTL text never show missing-glyph boxes just because a custom font lacks them.
- **P0:** Layout controls: line height, paragraph spacing, page margins (horizontal/vertical), text alignment (left / justified / publisher default), hyphenation on/off (language-aware).
- **P1:** Letter spacing, word spacing, font weight boost, first-line indent override, max line width in scroll mode, multi-column text on tablets.
- **P0:** **"Use publisher styles" master switch**, with granular overrides (font, size, colors, alignment, spacing). Many books have hard-coded styles that fight user settings; the user must always be able to win.
- **P0:** **Reading profiles/presets:** save a named bundle of settings (font, size, spacing, theme, brightness, layout, page-turn style) and switch between them in one tap, for example "Day", "Night", "Commute". Raised from P1; see `docs/customization.md`.
- **P0:** Per-book overrides: any setting can be global or saved for just this book. Raised from P1.
- A live **preview** while changing settings, and a one-tap **reset to defaults**.

### E. Themes, night reading, and brightness

- **P0:** Built-in themes: **Light**, **Paper/Sepia**, **Gray**, **Dark**, **Black (OLED true black)**, and **Night** (very dim warm text on near-black for dark rooms, with low glare).
- **P0:** **Custom theme editor:** background, text, link, selection, highlight colors, with live preview and contrast warnings. Save multiple custom themes.
- **P0:** Themes apply consistently to book content, footnote popups, menus, dialogs, and the status bar.
- **P0:** **In-app brightness control:** a slider in the reader menu. Control system screen brightness while reading and **restore the previous brightness when leaving the reader or backgrounding the app**. Handle permission/limitations per platform gracefully.
- **P0:** **Software dimmer overlay** so the screen can go dimmer than the system minimum, for late-night reading.
- **P1:** **Warm/blue-light filter** with adjustable intensity (an amber overlay), independent of theme.
- **P1:** **Auto theme switching:** follow system dark mode, or switch at user-set times.
- **P1:** **Dark-mode image handling:** options for none, dim images, or smart-invert for line art/diagrams (off by default). Fix white-box artifacts around transparent images.
- **P1:** Edge-swipe gestures: vertical swipe on the left edge for brightness, on the right edge for font size (toggleable in settings).
- **P1:** Keep screen awake while reading (toggle), orientation lock, hide/show status bar, handle notches and cutouts.

### F. Reader UI and gestures

- **P0:** Tap center to show/hide controls; tap left/right zones to turn pages; swipe to turn pages. **P1:** configurable tap zones (and a left-handed layout).
- **P0:** Page-turn animation with an on/off toggle (off means an instant turn). Styles: none, slide, fade. Respect the system "reduce motion" setting, which forces none unless the reader opts back in.
- **P1:** **Choosable page-turn styles** in the customization settings, with a live preview: simple (slide, fade), pretty (realistic page curl, book-like flip), and flashy (for example pages burning away). Styles are self-contained, so new ones can be added later without touching the reader. Each style must keep page turns feeling instant (the turn itself still lands under about 100 ms; the effect plays over it) and must not drop frames in scroll mode, where only none and fade apply. Can be saved in reading profiles and per book.
- **P0:** Clean top bar (book title, chapter) and a bottom bar (progress). Both fully hideable for immersive reading.
- **P0:** **Adjustable reader layout** (`docs/customization.md`, section 3): the default is bare (only the text while reading; a few controls on a center tap). Header and footer slots hold optional information (title, chapter, page, percent, clock, battery, time left), and the top bar, quick row and bottom bar hold controls picked from a catalog. Edited on the live reader, with a list editor too, and saved as layout presets. Gestures map to the same actions.
- **P1:** **User-made page-turn animations** as turn packs (a manifest of parameters plus one SkSL shader, the same format as the built-in styles), importable and shareable. Anyone can tune a style's parameters and share the result as a preset. See `docs/customization.md`, section 5.
- **P1:** Volume-key page turning (Android).
- **P1:** Optional haptic feedback on page turns and actions.
- **P1:** Tablet layout: side-docked TOC/notes panel instead of sheets.
- **P2:** Reading ruler / line-focus mode that dims everything except the current lines.

### G. Bookmarks

- **P0:** Add or remove a bookmark at the current position with one tap. Show a visible indicator on bookmarked pages in paginated mode.
- **P0:** Bookmarks list per book: chapter name, text snippet, date, optional user-written title/note. Tap to jump; swipe to delete; sort by position or date.
- **P0:** Bookmarks re-anchor correctly when font size or layout changes (use CFI, not page numbers).
- **P1:** Bookmarks shown as markers on the progress slider.
- **P1:** Quick-jump "last position before jump" so exploring never loses your place.

### H. Highlights, notes, and quotes

- **P0:** **Text selection menu** with: highlight (choose color), add note, **save as quote**, copy, search, define/translate (hand off to system lookup/share sheet), share.
- **P0:** **Highlights:** at least five colors, plus underline style. Tap an existing highlight to edit color, add/edit a note, delete, or save as quote.
- **P0:** **Quotes:** a global, cross-book collection of saved passages, each with full attribution (book title, author, chapter, location). Quotes can be tagged, marked favorite, searched, and filtered by book or tag. A quote can optionally also display as a highlight in the text (default on).
- **P0:** **Copy with attribution:** copying a quote gives the passage plus a formatted citation (configurable template, for example "— Author, *Title*, Chapter").
- **P1:** **Share a quote as an image card:** a styled card with the passage and attribution, with a few templates and the ability to use the current theme and font.
- **P0:** **Annotations screen per book** (highlights, notes, bookmarks in one list, filterable) and a **global Quotes screen**.
- **P0:** **Robust re-anchoring:** store a CFI range **plus** the surrounding text (prefix/suffix, like the W3C TextQuoteSelector) so annotations can be re-attached if the CFI fails.
- **P1:** **Export** highlights/quotes/notes as Markdown (per book or everything), plus JSON. **P2:** CSV and a Readwise-compatible format.
- **Design note:** use one underlying annotation model (with a type and flags) rather than separate duplicated tables for highlights and quotes.

### I. Search and lookup

- **P0:** **In-book full-text search** with result snippets grouped by chapter, tap to jump and highlight the match, next/previous result. Index lazily and cache so it stays fast on large books.
- **P1:** **Library-wide search** across titles, authors, series, tags, and (separately) across all highlights/notes/quotes.
- **P1:** Dictionary lookup via the system dictionary/share sheet; **P2:** offline dictionary integration.
- **P2:** Text-to-speech read-aloud with sentence highlighting, speed control, and a sleep timer.

### J. Library and book folders

- **P0:** **Import:** file picker, "Open with"/share-sheet from other apps, multi-select import, and **import an entire directory** (recursively) with progress and a summary of failures.
- **P0:** Extract title, author(s), series and index, language, publisher, description, and cover. Generate an attractive fallback cover (title/author on a colored background) when none exists. Allow **manual metadata editing** and re-picking a cover.
- **P0:** **Duplicate detection** by content hash, with a "skip / keep both / replace" choice.
- **P0:** **Book folders:** create, rename, delete, and **nest** folders; move books between folders (multi-select and drag-and-drop where practical); breadcrumb navigation; an "Unfiled" view; a folder cover preview (mosaic of book covers). Deleting a folder must never silently delete books (ask: move them out, or delete).
- **P0:** Library views: **grid and list**, sort (title, author, recently read, date added, progress), filters (Unread / Reading / Finished), and a prominent **"Continue reading"** card.
- **P0:** Per-book reading status (Unread / Reading / Finished, set automatically with manual override) and a progress ring/bar on each cover.
- **P1:** **Tags** (many per book, separate from folders) and series grouping.
- **P1:** Multi-select actions: move, tag, mark finished, delete.
- **P1:** Book detail screen: cover, metadata, description, stats, annotations count.
- **P1:** Deleting a book asks whether to also delete its annotations, or keep them in case the book is re-imported (match by content hash).
- **P1:** Storage usage view and a cleanup tool.
- **P2:** OPDS catalog browsing to download free books (for example from public-domain sources).
- **P2:** App shortcut / home-screen quick action: "Continue reading".

### K. Reading stats and goals

- **P1:** Track time actually spent reading (only while the reader is in the foreground and the screen is active), words/pages read, and a rolling reading-speed estimate. Per-book and overall.
- **P1:** Daily reading goal, streaks, and a simple weekly/monthly chart.
- **P1:** All stats stay on-device; a setting to disable tracking entirely.

### L. Backup, export, and settings

- **P0:** Settings screen with global defaults for everything above; a clear separation between global and per-book settings.
- **P0:** **Full backup/restore:** one archive containing library metadata, folders, tags, bookmarks, highlights, quotes, notes, reading positions, themes, profiles, and settings. Optionally include book files and custom fonts. Restore with a clear merge/replace option. Make it easy to save the backup to a user-chosen location (so they can use their own cloud storage).
- **P1:** Import settings/themes from a file for sharing.
- **P2:** Optional sync via a user-chosen folder (file-based), with conflict handling. No server component.

### M. Accessibility

- **P0:** Screen reader compatibility for app UI (labels, focus order) and for book content where the platform supports it.
- **P0:** Respect system font scale in app UI (not the book text, which has its own setting), reduce-motion, and high-contrast needs. Minimum touch targets and sufficient color contrast in every built-in theme.
- **P1:** A built-in high-contrast theme and a dyslexia-friendly preset (font, spacing, left alignment).

---

## 5. Data model guidance

A sketch to start from. You may improve it, but explain changes in `DECISIONS.md`:

- `books`: id, content hash, file path, title, author(s), series, series index, language, publisher, description, cover path, added date, last opened, status, progress, last CFI
- `folders`: id, parent id, name, sort order, created
- `book_folder`: book id, folder id (a book lives in one folder or is unfiled)
- `tags` and `book_tags`
- `annotations`: id, book id, type (highlight / quote / note), CFI range, prefix text, selected text, suffix text, color, style, note text, chapter reference, is_quote, favorite, created, updated
- `annotation_tags`
- `bookmarks`: id, book id, CFI, snippet, chapter reference, title, note, created
- `fonts`: id, family name, file path, format, created
- `themes`, `reading_profiles`
- `settings` (global) and `book_settings` (per-book overrides)
- `reading_sessions`: book id, start, end, words read
- Migrations from day one, so the schema can evolve without wiping user data.

---

## 6. Non-functional requirements

- **Performance:** open a typical 5 MB book to the first rendered page in under about 1.5 seconds on a mid-range phone; page turns feel instant (under about 100 ms); no jank in scroll mode; library stays smooth with 1,000+ books (virtualized lists, cached thumbnails). Lazy-load spine items and preload the next chapter. Cache pagination results where possible.
- **Reliability:** never lose reading position, bookmarks, or annotations on a crash or force-quit. Write data transactionally. Handle app being killed in the background.
- **Security of book content:** extract EPUB archives safely (guard against zip-slip and decompression bombs). **Disable scripting inside book content by default.** Block book content from making network requests. Sanitize any HTML shown outside the main content frame (such as footnote popups).
- **Privacy:** no analytics, no tracking, no account. All data stays on the device unless the user exports it.
- **Battery:** avoid busy loops and unnecessary re-layouts; throttle position-saving writes.
- **Internationalization:** all UI strings externalized and ready for translation; correct handling of RTL book content.
- **Offline:** every feature works with no connection.

---

## 7. Milestones

Work through these in order, one at a time, stopping after each for my review. Each milestone must end with a runnable app, tests where applicable, an updated `PROGRESS.md`, and a commit.

**Milestone 0: Plan and spike.**
Scaffold the project. Evaluate the rendering engines against real EPUBs and pick one. Build the sample/test EPUB set (see section 8), including a hand-built noteref test EPUB. Write `DECISIONS.md`.
*Done when:* the chosen engine renders a chapter inside the app, and the decision is documented with evidence.

**Milestone 1: Open and render.**
Basic import of a single EPUB, parse metadata, render in paginated and scroll modes, page turning.
*Done when:* at least five varied real EPUBs open and read correctly in both modes.

**Milestone 2: Navigation and position.**
TOC panel, progress slider, chapter next/prev, link handling with the back stack, CFI-based position save and restore.
*Done when:* position survives restart, rotation, and font changes; the back stack works across TOC jumps and internal links.

**Milestone 3: Noterefs and footnotes.**
Everything in section 4C marked P0, plus the P1 notes-in-chapter panel.
*Done when:* the noteref test EPUB passes every case (see section 8) and real annotated books show correct popups, including cross-file notes.

**Milestone 4: Typography, themes, brightness.**
Font size, bundled and custom fonts, layout controls, publisher-styles switch, all built-in themes, custom theme editor, brightness slider with restore, software dimmer, page-turn animation toggle and choosable styles (section 4F).
*Done when:* every setting applies live without losing position, custom fonts load in the reader, and brightness is correctly restored on exit/background.
*Also in this milestone, as the customization foundation* (`docs/customization.md`, section 7): the settings registry with layered values (defaults, global, profile, this book, session), reading profiles and per-book overrides, theme tokens shared by the book, popups, bars and library, the reader layout slots with Edit layout mode and the Bare, Classic and Informative presets, gestures mapped to actions, and the turn-pack engine (snapshot overlay plus SkSL) with the built-in styles' tunable parameters saved as presets. It starts with a spike on capturing the reader view for the overlay.

**Milestone 5: Library and folders.**
Full library UI (minimal pills tinted from the cover by default, with fields and looks set through the settings registry), tags seeded from `dc:subject` for genre groupings, directory import, duplicate detection, metadata editing, nested folders, sort/filter, reading status.
*Done when:* a folder of 200+ EPUBs imports smoothly, and folder operations are safe and tested.

**Milestone 6: Bookmarks, highlights, and quotes.**
Section 4G and 4H.
*Done when:* annotations survive font/layout changes and app restarts, quotes work across books, and Markdown export is correct.

**Milestone 7: Search, stats, backup.**
In-book search, library search, reading stats, full backup/restore, export and import of presets, profiles and themes as `.quire` files.
*Done when:* a backup restored onto a fresh install reproduces the library, annotations, positions, and settings.

**Milestone 8: Polish and hardening.**
Accessibility pass, tablet layout, performance tuning on large books, edge-case EPUB fixes, the 3×3 tap grid and left-handed layout, turn-pack import with its guards and `docs/turn-packs.md`. (Reading profiles and per-book overrides moved to Milestone 4.)
*Done when:* the performance targets in section 6 are met and a manual accessibility checklist passes.

**Milestone 9 (stretch):**
Pick from the P2 items in order of value: in-app turn-pack editor, book CSS snippet, TTS with sleep timer, footnote tray, OPDS browsing, quote image cards if not done earlier, two-page spreads, reading ruler.

---

## 8. Test assets and verification

Build a test set early and keep it in the repo (only files that are legal to redistribute):

- Public-domain EPUBs from sources such as **Standard Ebooks** (excellent semantic markup, endnotes with `noteref`) and **Project Gutenberg** (older, plain-link footnotes: ideal for the heuristic fallback).
- A few EPUB 3 sample/feature-test files (for example the IDPF/W3C sample books) covering images, tables, fixed layout, RTL, and `page-list`.
- A **hand-built noteref test EPUB** with these cases: semantic `noteref` + `footnote` in the same file; endnotes in a separate file; `<aside>` notes; multi-paragraph notes; notes in an `<ol>`; a note containing a link and an image; a note that itself contains a noteref; non-semantic numeric `<sup>` links; a numeric link that is **not** a note (it must not trigger the popup); a chapter link that must not be treated as a note; back-links; notes with the id on an empty anchor.
- A very large book (5 MB+ and 1,000+ pages) for performance.
- A deliberately malformed EPUB (bad TOC, missing cover, wrong paths).

For every milestone, tell me exactly which books and cases you tested and what you observed. If you could not test something (for example, a device-specific behavior), say so plainly instead of implying it works.

---

## 9. Out of scope (for now)

- A cloud backend, user accounts, or built-in store.
- Circumventing DRM in any form.
- Editing EPUB files.
- Formats other than EPUB (PDF, MOBI, CBZ), though keep the architecture open to them.
- Social features.

---

## 10. Start now

Respond with the first-response items from section 2 (stack decision, rendering evaluation plan, architecture outline, Milestone 0 plan, and up to five questions). **Do not write code yet.**
