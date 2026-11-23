import type { Resolved } from "./registry.ts";
import type { ThemeTokens } from "./themes.ts";

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
const FAMILY: Record<string, string> = {
  serif: 'Georgia, "Noto Serif", "Droid Serif", serif',
  "sans-serif": 'Roboto, "Noto Sans", Arial, sans-serif',
  monospace: '"Roboto Mono", "Droid Sans Mono", monospace',
};

// CJK, Arabic, Hebrew and symbol fallbacks, so a chosen family never shows missing-glyph boxes.
const FALLBACK = '"Noto Sans CJK SC", "Noto Sans Arabic", "Noto Sans Hebrew", "Noto Sans Symbols", "Noto Color Emoji"';

export function readingCss(settings: Resolved, theme: ThemeTokens): string {
  const force = !settings["type.publisherStyles"];
  const important = force ? " !important" : "";
  const rules: string[] = [];

  rules.push(
    `:root { color-scheme: ${theme.dark ? "dark" : "light"}; --quire-page: ${theme.page}; --quire-ink: ${theme.ink}; --quire-ink-muted: ${theme.inkMuted}; --quire-link: ${theme.link}; --quire-selection: ${theme.selection}; }`,
    `html, body { background: ${theme.page} !important; color: ${theme.ink} !important; }`,
    `::selection { background: ${theme.selection}; }`,
  );
  // On a dark theme, or with publisher styles off, the book's own colours would
  // fight the theme (black text on a black page), so every element follows it.
  // On light themes with publisher styles on, coloured callouts and tables keep their look.
  if (theme.dark || force) {
    rules.push(
      `body *:not(a):not(img):not(svg):not(svg *) { color: inherit !important; background-color: transparent !important; border-color: ${theme.inkMuted}; }`,
      `a, a * { color: ${theme.link} !important; }`,
    );
  }

  const size = settings["type.fontSize"];
  if (size !== 100) rules.push(`html { font-size: ${size}% !important; }`);

  const family = settings["type.fontFamily"];
  if (family !== "publisher" && FAMILY[family]) {
    rules.push(`html, body, p, div, span, li, td, th, blockquote, h1, h2, h3, h4, h5, h6 { font-family: ${FAMILY[family]}, ${FALLBACK} !important; }`);
  }

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
