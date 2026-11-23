import { BUNDLED_FONTS } from "./font-catalog.ts";

/**
 * Reading fonts (spec 4D): the book's own, the system's generic families,
 * fonts bundled with the app (OFL, see assets/fonts), and fonts the reader
 * imports. The page loads a font's files from the loopback server's /fonts/
 * route, only once it is chosen, so unused fonts cost nothing at runtime.
 *
 * Bundled CSS families are prefixed "Quire " so a book that embeds its own
 * "Literata" never collides with ours.
 */
export type FontFile = { file: string; weight: number; style: "normal" | "italic"; range: string | null };
export type BundledFont = { id: string; label: string; kind: "serif" | "sans-serif"; version: string; faces: FontFile[] };
export type UserFont = { id: string; label: string; file: string };

/** What the page needs to declare one @font-face. */
export type FontFace = FontFile & { family: string };

export const SYSTEM_FONTS = ["publisher", "serif", "sans-serif", "monospace"] as const;
export const BUNDLED_FONT_IDS = BUNDLED_FONTS.map((font) => font.id);

/** Built-in choices in the order the quick panel shows them. Imported fonts follow. */
export const FONT_CHOICES: readonly string[] = [...SYSTEM_FONTS, ...BUNDLED_FONT_IDS];

export const USER_FONT_ID = /^user-[a-z0-9]{4,24}$/;
/** Imported files are stored and served under their id; only these extensions. */
export const USER_FONT_FILE = /^user-[a-z0-9]{4,24}\.(ttf|otf|woff2?)$/;
export const MAX_USER_FONTS = 30;

const SYSTEM_STACK: Record<string, string> = {
  serif: 'Georgia, "Noto Serif", "Droid Serif", serif',
  "sans-serif": 'Roboto, "Noto Sans", Arial, sans-serif',
  monospace: '"Roboto Mono", "Droid Sans Mono", monospace',
};

// CJK, Arabic, Hebrew and symbol fallbacks, so a chosen family never shows missing-glyph boxes.
export const FALLBACK = '"Noto Sans CJK SC", "Noto Sans Arabic", "Noto Sans Hebrew", "Noto Sans Symbols", "Noto Color Emoji"';

export function isFontId(value: unknown): value is string {
  return typeof value === "string" && (FONT_CHOICES.includes(value) || USER_FONT_ID.test(value));
}

function bundled(id: string): BundledFont | null {
  return BUNDLED_FONTS.find((font) => font.id === id) ?? null;
}

function cssString(value: string): string {
  return `"${value.replace(/["\\\n\r]/g, "")}"`;
}

/**
 * The font-family value for a choice, or null to leave the book's own fonts.
 * An imported font that was deleted falls back to the book's fonts.
 */
export function fontStack(id: string, userFonts: readonly UserFont[] = []): string | null {
  if (SYSTEM_STACK[id]) return `${SYSTEM_STACK[id]}, ${FALLBACK}`;
  const font = bundled(id);
  if (font) return `${cssString(`Quire ${font.label}`)}, ${SYSTEM_STACK[font.kind]}, ${FALLBACK}`;
  const user = userFonts.find((f) => f.id === id);
  if (user) return `${cssString(`Quire ${user.id}`)}, ${SYSTEM_STACK.serif}, ${FALLBACK}`;
  return null;
}

/** The faces the page must declare for a choice. Empty for the book's own and system fonts. */
export function fontFaces(id: string, userFonts: readonly UserFont[] = []): FontFace[] {
  const font = bundled(id);
  if (font) return font.faces.map((face) => ({ ...face, family: `Quire ${font.label}` }));
  const user = userFonts.find((f) => f.id === id);
  // One file for every weight and style; the WebView synthesizes bold and italic.
  if (user) return [{ family: `Quire ${user.id}`, file: user.file, weight: 400, style: "normal", range: null }];
  return [];
}

/** The label for a choice, given the built-in names from i18n. */
export function fontLabel(id: string, names: Record<string, string>, userFonts: readonly UserFont[] = []): string {
  return names[id] ?? bundled(id)?.label ?? userFonts.find((f) => f.id === id)?.label ?? id;
}

/** Clean the imported-font list read from storage. Never throws. */
export function parseUserFonts(value: unknown): UserFont[] {
  if (!Array.isArray(value)) return [];
  const out: UserFont[] = [];
  const seen = new Set<string>();
  for (const item of value.slice(0, MAX_USER_FONTS)) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.id !== "string" || !USER_FONT_ID.test(raw.id) || seen.has(raw.id)) continue;
    if (typeof raw.file !== "string" || !USER_FONT_FILE.test(raw.file) || !raw.file.startsWith(`${raw.id}.`)) continue;
    seen.add(raw.id);
    out.push({ id: raw.id, label: userFontLabel(raw.label, raw.id), file: raw.file });
  }
  return out;
}

/** A fresh id for an imported font. */
export function newUserFontId(taken: readonly string[], random: () => number = Math.random): string {
  for (;;) {
    const id = `user-${Math.floor(random() * 36 ** 8).toString(36).padStart(8, "0")}`;
    if (!taken.includes(id)) return id;
  }
}

/** A readable name from an imported file's name: "Bookerly-Regular.ttf" gives "Bookerly". */
export function userFontLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const base = value
    .replace(/\.(ttf|otf|woff2?)$/i, "")
    .replace(/[-_ ](regular|book|roman|normal)$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/[\u0000-\u001f\u007f"\\]/g, "")
    .trim()
    .slice(0, 40);
  return base || fallback;
}

/** The extension of an imported file, or null when it is not a font we take. */
export function fontExtension(name: string | null | undefined): "ttf" | "otf" | "woff" | "woff2" | null {
  const match = /\.(ttf|otf|woff2?)$/i.exec(name ?? "");
  return match ? (match[1].toLowerCase() as "ttf" | "otf" | "woff" | "woff2") : null;
}
