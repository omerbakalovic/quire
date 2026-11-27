import { normalizeHex } from "./colour.ts";
import { isBuiltInTheme, TOKEN_KEYS, type ThemeId, type ThemeTokens } from "./themes.ts";

/**
 * A theme the reader made (docs/customization-roadmap.md, C4). `base` is a
 * built-in; `tokens` holds only what was changed, so everything else follows
 * the base. A theme is colours only (roadmap 2.5).
 */
export type UserTheme = { id: string; name: string; base: ThemeId; tokens: Partial<ThemeTokens> };

export const USER_THEME_ID = /^theme-[a-z0-9]{4,24}$/;
export const MAX_USER_THEMES = 50;
const KEYS = new Set<string>(TOKEN_KEYS);

export function isUserThemeId(value: unknown): value is string {
  return typeof value === "string" && USER_THEME_ID.test(value);
}

/** A built-in theme id or a user theme id (whether that theme still exists is checked when drawing). */
export function isThemeId(value: unknown): value is string {
  return isBuiltInTheme(value) || isUserThemeId(value);
}

/** Only known tokens with valid colours, in their one spelling; `dark` as a boolean. */
export function cleanTokens(value: unknown): Partial<ThemeTokens> {
  const out: Record<string, string | boolean> = {};
  if (!value || typeof value !== "object") return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (key === "dark") {
      if (typeof raw === "boolean") out.dark = raw;
      continue;
    }
    if (!KEYS.has(key)) continue;
    const hex = normalizeHex(raw);
    if (hex) out[key] = hex;
  }
  return out as Partial<ThemeTokens>;
}

export function cleanThemeName(name: unknown, fallback: string): string {
  return typeof name === "string" && name.trim() ? name.trim().slice(0, 60) : fallback;
}

/** Parsing never throws: a broken entry is dropped, a repeated id keeps the first. */
export function parseUserThemes(value: unknown): UserTheme[] {
  const out: UserTheme[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(value) ? value : []) {
    if (out.length >= MAX_USER_THEMES) break;
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    if (!isUserThemeId(t.id) || seen.has(t.id) || !isBuiltInTheme(t.base)) continue;
    seen.add(t.id);
    out.push({ id: t.id, name: cleanThemeName(t.name, "Theme"), base: t.base, tokens: cleanTokens(t.tokens) });
  }
  return out;
}

/** A fresh id that no theme in the list has. */
export function newThemeId(themes: readonly UserTheme[], random: () => number = Math.random): string {
  for (;;) {
    const id = `theme-${Math.floor(random() * 36 ** 8).toString(36).padStart(8, "0")}`;
    if (!themes.some((t) => t.id === id)) return id;
  }
}

/** "Night (copy)", then "Night (copy 2)"… against the names already in use. `word` is the translated "copy". */
export function copyName(name: string, taken: readonly string[], word = "copy"): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stem = name.replace(new RegExp(` \\(${escaped}(?: \\d+)?\\)$`), "");
  let candidate = `${stem} (${word})`;
  for (let n = 2; taken.includes(candidate); n++) candidate = `${stem} (${word} ${n})`;
  return candidate.slice(0, 60);
}
