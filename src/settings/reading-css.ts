import type { Resolved } from "./registry.ts";
import { fontStack, type UserFont } from "./fonts.ts";
import { withAlpha, type ThemeTokens } from "./themes.ts";

/** The attribute book-colors.js puts on text too faint for the page; kept in step with it by a test. */
export const FAINT_ATTR = "data-quire-faint";

/**
 * The CSS the reader page injects into book content, from resolved settings
 * and a theme. Built here, outside the page, so it can be tested.
 *
 * With publisher styles on, only the settings the reader moved off their
 * "publisher" value are forced. With them off, Quire's values win everywhere,
 * because many books hard-code fonts and spacing (spec 4D).
 *
 * Sentinels: lineHeight 0 and paragraphSpacing -1 mean "leave it to the book".
 */
export function readingCss(settings: Resolved, theme: ThemeTokens, userFonts: readonly UserFont[] = []): string {
  const force = !settings["type.publisherStyles"];
  const important = force ? " !important" : "";
  const rules: string[] = [];

  rules.push(
    `:root { color-scheme: ${theme.dark ? "dark" : "light"}; --quire-page: ${theme.page}; --quire-ink: ${theme.ink}; --quire-ink-muted: ${theme.inkMuted}; --quire-link: ${theme.link}; --quire-selection: ${theme.selection}; }`,
    `html, body { background: ${theme.page} !important; color: ${theme.ink} !important; }`,
    `::selection { background: ${theme.selection}; }`,
  );
  // The book's own colours (theme.bookColors). Auto: on a dark theme, or with
  // publisher styles off, they would fight the theme (black text on a black page),
  // so every element follows it; on light themes with publisher styles on, coloured
  // callouts and tables keep their look. Keep never replaces them, except text the
  // page marks as too faint (src/reader-page/book-colors.js). Replace always does.
  const mode = settings["theme.bookColors"];
  const replace = mode === "replace" || (mode === "auto" && (theme.dark || force));
  if (replace) {
    rules.push(
      `body *:not(a):not(img):not(svg):not(svg *) { color: inherit !important; background-color: transparent !important; border-color: ${theme.inkMuted}; }`,
      `a, a * { color: ${theme.link} !important; }`,
    );
  }
  if (mode === "keep") {
    rules.push(
      `[${FAINT_ATTR}] { color: ${theme.ink} !important; }`,
      `a[${FAINT_ATTR}], a [${FAINT_ATTR}] { color: ${theme.link} !important; }`,
    );
  }
  // Page tokens beyond the base (C4). Only written when a theme sets them apart from
  // what they derive from, so the built-in themes' CSS stays as it was.
  const strong = replace ? " !important" : "";
  if (theme.heading && theme.heading !== theme.ink) rules.push(`h1, h2, h3, h4, h5, h6 { color: ${theme.heading}${strong}; }`);
  if (theme.linkVisited && theme.linkVisited !== theme.link) rules.push(`a:visited, a:visited * { color: ${theme.linkVisited}${strong}; }`);
  if (theme.imageCaption && theme.imageCaption !== theme.inkMuted) rules.push(`figcaption, figcaption * { color: ${theme.imageCaption}${strong}; }`);
  if (theme.rule && theme.rule !== withAlpha(theme.inkMuted, 0.5)) rules.push(`hr { border-color: ${theme.rule}${strong}; color: ${theme.rule}${strong}; }`);

  // Text size. With the book's styles on, the page measures the book's own html and body
  // sizes and sets these variables to them times the scale (src/reader-page/font-scale.js),
  // so px and pt books grow too. With them off, Quire's size wins everywhere: the root
  // follows the setting and running text is brought back to it.
  const size = settings["type.fontSize"];
  if (force) {
    if (size !== 100) rules.push(`html { font-size: ${size}% !important; }`);
    rules.push("body { font-size: 1rem !important; }", "p, li, blockquote, dd, dt, td, th { font-size: 1rem !important; }");
  } else {
    rules.push(
      "html[data-quire-size] { font-size: var(--quire-html-size) !important; }",
      "html[data-quire-size] body { font-size: var(--quire-body-size) !important; }",
    );
  }

  // Code keeps a monospace face whatever the reading font is.
  const family = fontStack(settings["type.fontFamily"], userFonts);
  if (family) rules.push(`html, body, p, div, span, li, td, th, blockquote, h1, h2, h3, h4, h5, h6 { font-family: ${family} !important; }`);

  const lineHeight = settings["type.lineHeight"];
  if (lineHeight > 0) rules.push(`html, body, p, li, blockquote, div { line-height: ${lineHeight} !important; }`);

  const spacing = settings["type.paragraphSpacing"];
  if (spacing >= 0) rules.push(`p { margin-top: 0 !important; margin-bottom: ${spacing}em !important; }`);

  const align = settings["type.alignment"];
  if (align !== "publisher") rules.push(`p, li, blockquote { text-align: ${align}${important}; }`);

  const hyphens = settings["type.hyphenation"] ? "auto" : "manual";
  rules.push(`p, li, blockquote { hyphens: ${hyphens}${important}; -webkit-hyphens: ${hyphens}${important}; }`);

  if (force) {
    rules.push(
      "p, li, blockquote, div { text-indent: inherit; letter-spacing: normal !important; word-spacing: normal !important; }",
      "body { margin: 0 !important; padding: 0 !important; }",
    );
  }
  return rules.join("\n");
}

/** foliate paginator attributes for the page settings: side gap and the widest text column. */
export function layoutAttributes(settings: Resolved): { gap: string; maxInlineSize: string } {
  return { gap: `${settings["page.marginX"]}%`, maxInlineSize: `${settings["page.maxWidth"]}px` };
}
