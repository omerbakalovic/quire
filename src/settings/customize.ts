import { FONT_CHOICES, type UserFont } from "./fonts.ts";
import { resolve, sourceOf, type LayerValues, type Source } from "./layers.ts";
import { settingFor, SETTINGS, THEME_IDS, type Group, type Layer, type SettingKey, type Value } from "./registry.ts";
import type { UserTheme } from "./user-themes.ts";

/**
 * The Customize screen, generated from the registry (docs/customization.md,
 * 2.1): one row per setting the edited layer may hold, grouped, with the
 * value in use and whether this layer sets it. Kept free of React so it can
 * be tested; the screen only draws the rows.
 */

/**
 * Numbers whose lowest value means "not set" (the book's own, the system's):
 * where the first step up lands, and the lowest real value, below which a
 * step goes back to "not set".
 */
export const UNSET: Partial<Record<SettingKey, { value: number; first: number; floor: number }>> = {
  "type.lineHeight": { value: 0, first: 1.2, floor: 1 },
  "type.paragraphSpacing": { value: -1, first: 0, floor: 0 },
  "light.brightness": { value: 0, first: 0.5, floor: 0.05 },
};

/** One step of a number setting, honouring "not set" values. Null when the key is not a number. */
export function stepValue(key: SettingKey, current: number, dir: 1 | -1): number | null {
  const setting = settingFor(key);
  if (!setting || setting.type !== "number") return null;
  const unset = UNSET[key];
  if (unset && current === unset.value) return dir > 0 ? unset.first : unset.value;
  const next = Math.round((current + dir * setting.step) * 1000) / 1000;
  if (unset && next < unset.floor - 1e-9) return unset.value;
  return Math.min(setting.max, Math.max(setting.min, next));
}

export type Row =
  | { key: SettingKey; kind: "number"; value: number; set: boolean; source: Source }
  | { key: SettingKey; kind: "choice"; value: string; options: readonly string[]; set: boolean; source: Source }
  | { key: SettingKey; kind: "boolean"; value: boolean; set: boolean; source: Source }
  | { key: SettingKey; kind: "elements"; value: readonly string[]; catalog: readonly string[]; max: number; set: boolean; source: Source };

export type Section = { group: Group; rows: Row[] };

const GROUP_ORDER: Group[] = ["typography", "page", "theme", "light", "layout", "barStyle", "gestures", "turns", "behaviour", "library"];

/**
 * The rows for editing one layer. `set` is true when that layer holds the
 * value, so the screen can offer a reset; `source` says where the value in
 * use comes from. Fonts and themes are a choice of the built-ins plus the reader's own.
 */
export function sectionsFor(
  layers: LayerValues,
  layer: Exclude<Layer, "session">,
  userFonts: readonly UserFont[] = [],
  userThemes: readonly UserTheme[] = [],
): Section[] {
  const resolved = resolve(layers) as Record<string, Value>;
  const sections: Section[] = [];
  for (const group of GROUP_ORDER) {
    const rows: Row[] = [];
    for (const setting of SETTINGS) {
      if (setting.group !== group || !(setting.scopes as readonly Layer[]).includes(layer)) continue;
      const key = setting.key as SettingKey;
      const set = layers[layer]?.[key] !== undefined;
      const source = sourceOf(layers, key);
      const value = resolved[key];
      if (setting.type === "number") rows.push({ key, kind: "number", value: value as number, set, source });
      else if (setting.type === "boolean") rows.push({ key, kind: "boolean", value: value as boolean, set, source });
      else if (setting.type === "elements") {
        rows.push({ key, kind: "elements", value: value as readonly string[], catalog: setting.catalog, max: setting.max, set, source });
      } else if (setting.type === "font") {
        rows.push({ key, kind: "choice", value: value as string, options: [...FONT_CHOICES, ...userFonts.map((f) => f.id)], set, source });
      } else if (setting.type === "theme") {
        const options = [...("follow" in setting && setting.follow ? ["follow"] : []), ...THEME_IDS, ...userThemes.map((t) => t.id)];
        rows.push({ key, kind: "choice", value: value as string, options, set, source });
      } else rows.push({ key, kind: "choice", value: value as string, options: setting.choices, set, source });
    }
    if (rows.length > 0) sections.push({ group, rows });
  }
  return sections;
}

/** The words for showing a number, given the few the UI translates. */
export type NumberWords = { system: string; off: string; bookDefault: string };

export function formatNumber(key: SettingKey, value: number, words: NumberWords): string {
  const percent = (v: number) => `${Math.round(v * 100)}%`;
  switch (key) {
    case "type.fontSize":
    case "page.marginX":
      return `${value}%`;
    case "type.lineHeight":
      return value > 0 ? value.toFixed(2) : words.bookDefault;
    case "type.paragraphSpacing":
      return value >= 0 ? `${value.toFixed(1)} em` : words.bookDefault;
    case "page.maxWidth":
      return `${value} px`;
    case "bar.top.width":
    case "bar.bottom.width":
      return `${value}%`;
    case "bar.top.radius":
    case "bar.bottom.radius":
    case "bar.gap":
    case "library.pillPadding":
    case "library.pillGap":
    case "library.pillRadius":
      return `${value} dp`;
    case "turn.duration":
      return `${value} ms`;
    case "light.brightness":
      return value > 0 ? percent(value) : words.system;
    case "light.dimmer":
    case "light.warmth":
      return value > 0 ? percent(value) : words.off;
    default:
      return String(value);
  }
}
