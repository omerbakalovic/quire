import type { THEME_IDS } from "./registry.ts";

/**
 * Theme tokens (docs/customization.md, section 2.5). A theme is a small
 * palette, not a stylesheet. The reader page turns it into CSS variables for
 * the book and the note sheet; the app turns it into styles for its bars.
 */
export type ThemeId = (typeof THEME_IDS)[number];

/** The colours a built-in theme states; everything else in ThemeTokens is derived from them. */
export type BaseTokens = {
  page: string;
  ink: string;
  inkMuted: string;
  link: string;
  selection: string;
  chrome: string;
  chromeInk: string;
  accent: string;
  /** Whether the system bars and form controls should be drawn dark. */
  dark: boolean;
};

/**
 * Theme tokens v2 (docs/customization-roadmap.md, C3). Colours are #rrggbb or
 * #rrggbbaa. The reader page only reads the page group; the rest colour the
 * reader's controls, sheets and the app's own screens.
 */
export type ThemeTokens = BaseTokens & {
  // Page
  heading: string;
  linkVisited: string;
  highlight: string;
  rule: string;
  imageFrame: string;
  imageCaption: string;
  // Reader chrome
  chromeDivider: string;
  accentInk: string;
  // Controls
  control: string;
  controlInk: string;
  controlOn: string;
  controlOnInk: string;
  sliderTrack: string;
  sliderFill: string;
  sliderThumb: string;
  // Sheets and menus
  sheet: string;
  sheetInk: string;
  scrim: string;
  danger: string;
  // App
  appBackground: string;
  appInk: string;
  appInkMuted: string;
  appDivider: string;
  pillDefault: string;
};

/** #rrggbb with an alpha byte. Anything else comes back unchanged. */
export function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${hex}${byte.toString(16).padStart(2, "0")}`;
}

/**
 * Fills the v2 tokens from a theme's stated colours, so a built-in theme keeps
 * its look and the values its controls already used. Anything stated wins.
 */
export function expandTokens(base: BaseTokens & Partial<ThemeTokens>): ThemeTokens {
  return {
    heading: base.ink,
    linkVisited: base.link,
    highlight: base.selection,
    rule: withAlpha(base.inkMuted, 0.5),
    imageFrame: withAlpha(base.inkMuted, 0.5),
    imageCaption: base.inkMuted,
    chromeDivider: withAlpha(base.chromeInk, 0.35),
    accentInk: base.page,
    control: base.chrome,
    controlInk: base.chromeInk,
    controlOn: base.accent,
    controlOnInk: base.page,
    sliderTrack: withAlpha(base.chromeInk, 0.25),
    sliderFill: base.accent,
    sliderThumb: base.accent,
    sheet: base.chrome,
    sheetInk: base.chromeInk,
    scrim: base.dark ? "#000000aa" : "#00000066",
    danger: base.dark ? "#ff7a6e" : "#b3261e",
    appBackground: base.page,
    appInk: base.ink,
    appInkMuted: base.inkMuted,
    appDivider: withAlpha(base.ink, 0.15),
    pillDefault: base.chrome,
    ...base,
  };
}

const BASE: Record<ThemeId, BaseTokens> = {
  light: { page: "#fdfdfb", ink: "#1a1a1a", inkMuted: "#5f5f5f", link: "#1f5fbf", selection: "#b5d3ff", chrome: "#f2f2f0", chromeInk: "#1a1a1a", accent: "#1f5fbf", dark: false },
  paper: { page: "#f4ecd8", ink: "#3b2f1e", inkMuted: "#6e5d45", link: "#7a4a12", selection: "#e3cfa0", chrome: "#ebe1c8", chromeInk: "#3b2f1e", accent: "#9a5b16", dark: false },
  gray: { page: "#d8d8d6", ink: "#1e1e1e", inkMuted: "#4a4a4a", link: "#1d4f9a", selection: "#a9c3e8", chrome: "#cacac8", chromeInk: "#1e1e1e", accent: "#1d4f9a", dark: false },
  dark: { page: "#1f1f21", ink: "#dedcd6", inkMuted: "#9b9993", link: "#8ab4f8", selection: "#3d5a80", chrome: "#2a2a2d", chromeInk: "#eeeeee", accent: "#8ab4f8", dark: true },
  black: { page: "#000000", ink: "#cfcfcf", inkMuted: "#8a8a8a", link: "#7fa7e8", selection: "#2e4566", chrome: "#0d0d0d", chromeInk: "#e0e0e0", accent: "#7fa7e8", dark: true },
  night: { page: "#0b0906", ink: "#a8875a", inkMuted: "#6e5a3e", link: "#c08a4a", selection: "#3a2a14", chrome: "#120e09", chromeInk: "#a8875a", accent: "#c08a4a", dark: true },
  // White bars with black ink, so the blue accent reads on them too (emulator run 24: blue on black bars was 1.9:1).
  contrast: { page: "#ffffff", ink: "#000000", inkMuted: "#222222", link: "#0000cc", selection: "#ffe066", chrome: "#ffffff", chromeInk: "#000000", accent: "#0000cc", dark: false },
};

/** Tokens a built-in theme states beyond the base, where the derived value doesn't suit it. */
const EXTRA: Partial<Record<ThemeId, Partial<ThemeTokens>>> = {
  // A full black line between white bars and the white page, and black pills for books without a colour.
  contrast: { chromeDivider: "#000000", pillDefault: "#000000" },
};

export const THEMES: Record<ThemeId, ThemeTokens> = Object.fromEntries(
  Object.entries(BASE).map(([id, base]) => [id, expandTokens({ ...base, ...EXTRA[id as ThemeId] })]),
) as Record<ThemeId, ThemeTokens>;

export function themeFor(id: string): ThemeTokens {
  return (THEMES as Record<string, ThemeTokens>)[id] ?? THEMES.light;
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a #rrggbb colour; null for anything else. */
export function luminance(hex: string): number | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return null;
  const n = Number.parseInt(match[1], 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrast(a: string, b: string): number | null {
  const la = luminance(a);
  const lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export type ContrastWarning = { pair: "ink" | "link" | "chromeInk"; ratio: number; minimum: number };

/**
 * The theme editor's warnings. Text needs 4.5:1 (WCAG AA). Night is a
 * deliberate low-glare theme, so the editor asks for at least 3:1 there.
 */
export function contrastWarnings(tokens: ThemeTokens, minimum = 4.5): ContrastWarning[] {
  const out: ContrastWarning[] = [];
  const check = (pair: ContrastWarning["pair"], fg: string, bg: string, min: number) => {
    const ratio = contrast(fg, bg);
    if (ratio !== null && ratio < min) out.push({ pair, ratio: Math.round(ratio * 100) / 100, minimum: min });
  };
  check("ink", tokens.ink, tokens.page, minimum);
  check("link", tokens.link, tokens.page, Math.min(minimum, 3));
  check("chromeInk", tokens.chromeInk, tokens.chrome, minimum);
  return out;
}
