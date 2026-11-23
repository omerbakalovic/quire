/**
 * The settings registry (docs/customization.md, section 2.1). Every setting is
 * declared once here with its type, default, group, the layers that may
 * override it, and whether a change repaginates the book. Screens, the quick
 * panel, reset, export and import are all driven from this list.
 */
export type Layer = "session" | "book" | "profile" | "global";

export type Group = "typography" | "page" | "theme" | "light" | "turns" | "behaviour";

type Base = {
  key: string;
  group: Group;
  /** Layers that may override the default. Everything may be set globally. */
  scopes: Layer[];
  /** True when a change re-lays out the book, so the reader keeps its place around it. */
  relayout: boolean;
  depth: "quick" | "standard" | "advanced";
};

export type NumberSetting = Base & { type: "number"; default: number; min: number; max: number; step: number };
export type ChoiceSetting = Base & { type: "choice"; default: string; choices: readonly string[] };
export type BooleanSetting = Base & { type: "boolean"; default: boolean };

export type Setting = NumberSetting | ChoiceSetting | BooleanSetting;
export type Value = number | string | boolean;

const ALL: Layer[] = ["session", "book", "profile", "global"];
const NOT_SESSION: Layer[] = ["book", "profile", "global"];

/** Font families that need no bundled file. Bundled and imported fonts join this list later. */
export const FONT_FAMILIES = ["publisher", "serif", "sans-serif", "monospace"] as const;
export const ALIGNMENTS = ["publisher", "start", "justify"] as const;
export const THEME_IDS = ["light", "paper", "gray", "dark", "black", "night", "contrast"] as const;
export const TURN_STYLES = ["none", "slide", "fade"] as const;

export const SETTINGS = [
  { key: "type.fontSize", type: "number", default: 100, min: 60, max: 300, step: 5, group: "typography", scopes: ALL, relayout: true, depth: "quick" },
  { key: "type.fontFamily", type: "choice", default: "publisher", choices: FONT_FAMILIES, group: "typography", scopes: NOT_SESSION, relayout: true, depth: "quick" },
  { key: "type.lineHeight", type: "number", default: 0, min: 0, max: 2.4, step: 0.05, group: "typography", scopes: NOT_SESSION, relayout: true, depth: "standard" },
  { key: "type.paragraphSpacing", type: "number", default: -1, min: -1, max: 2, step: 0.1, group: "typography", scopes: NOT_SESSION, relayout: true, depth: "standard" },
  { key: "type.alignment", type: "choice", default: "publisher", choices: ALIGNMENTS, group: "typography", scopes: NOT_SESSION, relayout: true, depth: "standard" },
  { key: "type.hyphenation", type: "boolean", default: false, group: "typography", scopes: NOT_SESSION, relayout: true, depth: "standard" },
  { key: "type.publisherStyles", type: "boolean", default: true, group: "typography", scopes: NOT_SESSION, relayout: true, depth: "standard" },
  { key: "page.marginX", type: "number", default: 4, min: 0, max: 20, step: 1, group: "page", scopes: NOT_SESSION, relayout: true, depth: "standard" },
  { key: "page.maxWidth", type: "number", default: 720, min: 400, max: 1600, step: 20, group: "page", scopes: NOT_SESSION, relayout: true, depth: "advanced" },
  { key: "theme.id", type: "choice", default: "light", choices: THEME_IDS, group: "theme", scopes: ALL, relayout: false, depth: "quick" },
  // The reader's own screen brightness. 0 follows the system. Only the reader's window changes,
  // so leaving the reader or the app always gives the system value back.
  { key: "light.brightness", type: "number", default: 0, min: 0, max: 1, step: 0.05, group: "light", scopes: ALL, relayout: false, depth: "quick" },
  // A black veil over the page, for going dimmer than the system minimum (spec 4E). 0 is off.
  { key: "light.dimmer", type: "number", default: 0, min: 0, max: 0.85, step: 0.05, group: "light", scopes: ALL, relayout: false, depth: "quick" },
  // An amber veil, independent of the theme. 0 is off.
  { key: "light.warmth", type: "number", default: 0, min: 0, max: 0.6, step: 0.05, group: "light", scopes: ALL, relayout: false, depth: "quick" },
  { key: "turn.style", type: "choice", default: "none", choices: TURN_STYLES, group: "turns", scopes: NOT_SESSION, relayout: false, depth: "standard" },
  { key: "turn.followReduceMotion", type: "boolean", default: true, group: "turns", scopes: ["global"], relayout: false, depth: "advanced" },
] as const satisfies readonly Setting[];

export type SettingKey = (typeof SETTINGS)[number]["key"];

/** The value type of each key, from its declaration. */
export type SettingValue<K extends SettingKey> =
  Extract<(typeof SETTINGS)[number], { key: K }> extends { type: "number" }
    ? number
    : Extract<(typeof SETTINGS)[number], { key: K }> extends { type: "boolean" }
      ? boolean
      : Extract<(typeof SETTINGS)[number], { key: K }> extends { choices: readonly (infer C)[] }
        ? C
        : never;

export type Resolved = { [K in SettingKey]: SettingValue<K> };

const BY_KEY = new Map<string, Setting>(SETTINGS.map((setting) => [setting.key, setting as Setting]));

export function settingFor(key: string): Setting | null {
  return BY_KEY.get(key) ?? null;
}

/**
 * Check one value against its declaration. A number is rounded to its step and
 * clamped; anything of the wrong type, an unknown key, or an unknown choice is
 * dropped (null), never trusted.
 */
export function cleanValue(key: string, value: unknown): Value | null {
  const setting = settingFor(key);
  if (!setting) return null;
  switch (setting.type) {
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      const stepped = Math.round((value - setting.min) / setting.step) * setting.step + setting.min;
      const clamped = Math.min(setting.max, Math.max(setting.min, stepped));
      return Math.round(clamped * 1000) / 1000;
    }
    case "choice":
      return typeof value === "string" && setting.choices.includes(value) ? value : null;
    case "boolean":
      return typeof value === "boolean" ? value : null;
  }
}

export function defaults(): Resolved {
  const out: Record<string, Value> = {};
  for (const setting of SETTINGS) out[setting.key] = setting.default;
  return out as Resolved;
}
