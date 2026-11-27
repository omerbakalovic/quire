/**
 * The settings registry (docs/customization.md, section 2.1). Every setting is
 * declared once here with its type, default, group, the layers that may
 * override it, and whether a change repaginates the book. Screens, the quick
 * panel, reset, export and import are all driven from this list.
 */
import { isFontId } from "./fonts.ts";

export type Layer = "session" | "book" | "profile" | "global";

export type Group = "typography" | "page" | "theme" | "light" | "layout" | "gestures" | "turns" | "behaviour";

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
/** An ordered list of elements for a layout slot, each from the slot's catalog, no repeats. */
export type ElementsSetting = Base & { type: "elements"; default: readonly string[]; catalog: readonly string[]; max: number };
/** A reading font: a built-in choice or an imported font's id (see fonts.ts). */
export type FontSetting = Base & { type: "font"; default: string };

export type Setting = NumberSetting | ChoiceSetting | BooleanSetting | FontSetting | ElementsSetting;
export type Value = number | string | boolean | readonly string[];

const ALL: Layer[] = ["session", "book", "profile", "global"];
const NOT_SESSION: Layer[] = ["book", "profile", "global"];
const PROFILE_UP: Layer[] = ["profile", "global"];

export const ALIGNMENTS = ["publisher", "start", "justify"] as const;
export const THEME_IDS = ["light", "paper", "gray", "dark", "black", "night", "contrast"] as const;
/** The app theme: "follow" uses the reading theme resolved from profile and global (roadmap 2.3). */
export const APP_THEMES = ["follow", ...THEME_IDS] as const;
export const TURN_STYLES = ["none", "slide", "fade"] as const;
/**
 * What the header and footer bands can show while reading (docs/customization.md, 3.3).
 * Time left comes from this session's reading speed until Milestone 7 keeps it across sessions.
 */
export const AMBIENT = ["title", "author", "chapter", "page", "pagesLeft", "timeLeftChapter", "timeLeftBook", "percent", "clock", "battery"] as const;
export const AMBIENT_SLOTS = [
  "layout.header.left",
  "layout.header.center",
  "layout.header.right",
  "layout.footer.left",
  "layout.footer.center",
  "layout.footer.right",
] as const;
const NONE: readonly string[] = [];
/**
 * Controls for the bars that appear on a tap in the middle of the page (3.3).
 * Bookmarks, search, annotations and profile switching join as they are built.
 */
export const CONTROLS = ["back", "title", "contents", "look", "flow", "prevChapter", "slider", "nextChapter", "percent"] as const;
export const CONTROL_SLOTS = ["layout.topBar", "layout.quickRow", "layout.bottomBar"] as const;
/**
 * What a gesture can do (3.5): the controls' actions, plus turning a page and
 * showing the bars. The page runs a turn itself; the rest go to the app.
 */
export const ACTIONS = ["none", "prevPage", "nextPage", "bars", "contents", "look", "prevChapter", "nextChapter", "flow", "back"] as const;
const GESTURE = { type: "choice", choices: ACTIONS, group: "gestures", scopes: PROFILE_UP, relayout: false, depth: "standard" } as const;

export const SETTINGS = [
  { key: "type.fontSize", type: "number", default: 100, min: 60, max: 300, step: 1, group: "typography", scopes: ALL, relayout: true, depth: "quick" },
  { key: "type.fontFamily", type: "font", default: "publisher", group: "typography", scopes: NOT_SESSION, relayout: true, depth: "quick" },
  { key: "type.lineHeight", type: "number", default: 0, min: 0, max: 2.4, step: 0.05, group: "typography", scopes: NOT_SESSION, relayout: true, depth: "standard" },
  { key: "type.paragraphSpacing", type: "number", default: -1, min: -1, max: 2, step: 0.1, group: "typography", scopes: NOT_SESSION, relayout: true, depth: "standard" },
  { key: "type.alignment", type: "choice", default: "publisher", choices: ALIGNMENTS, group: "typography", scopes: NOT_SESSION, relayout: true, depth: "standard" },
  { key: "type.hyphenation", type: "boolean", default: false, group: "typography", scopes: NOT_SESSION, relayout: true, depth: "standard" },
  { key: "type.publisherStyles", type: "boolean", default: true, group: "typography", scopes: NOT_SESSION, relayout: true, depth: "standard" },
  { key: "page.marginX", type: "number", default: 4, min: 0, max: 20, step: 1, group: "page", scopes: NOT_SESSION, relayout: true, depth: "standard" },
  { key: "page.maxWidth", type: "number", default: 720, min: 400, max: 1600, step: 20, group: "page", scopes: NOT_SESSION, relayout: true, depth: "advanced" },
  { key: "theme.id", type: "choice", default: "light", choices: THEME_IDS, group: "theme", scopes: ALL, relayout: false, depth: "quick" },
  { key: "app.theme", type: "choice", default: "follow", choices: APP_THEMES, group: "theme", scopes: ["global"], relayout: false, depth: "standard" },
  // The reader's own screen brightness. 0 follows the system. Only the reader's window changes,
  // so leaving the reader or the app always gives the system value back.
  { key: "light.brightness", type: "number", default: 0, min: 0, max: 1, step: 0.05, group: "light", scopes: ALL, relayout: false, depth: "quick" },
  // A black veil over the page, for going dimmer than the system minimum (spec 4E). 0 is off.
  { key: "light.dimmer", type: "number", default: 0, min: 0, max: 0.85, step: 0.05, group: "light", scopes: ALL, relayout: false, depth: "quick" },
  // An amber veil, independent of the theme. 0 is off.
  { key: "light.warmth", type: "number", default: 0, min: 0, max: 0.6, step: 0.05, group: "light", scopes: ALL, relayout: false, depth: "quick" },
  // Header and footer slots. Empty by default: the page shows only the text. A band with
  // anything in it grows the page margin to fit, so these repaginate.
  { key: "layout.header.left", type: "elements", default: NONE, catalog: AMBIENT, max: 3, group: "layout", scopes: NOT_SESSION, relayout: true, depth: "standard" },
  { key: "layout.header.center", type: "elements", default: NONE, catalog: AMBIENT, max: 3, group: "layout", scopes: NOT_SESSION, relayout: true, depth: "standard" },
  { key: "layout.header.right", type: "elements", default: NONE, catalog: AMBIENT, max: 3, group: "layout", scopes: NOT_SESSION, relayout: true, depth: "standard" },
  { key: "layout.footer.left", type: "elements", default: NONE, catalog: AMBIENT, max: 3, group: "layout", scopes: NOT_SESSION, relayout: true, depth: "standard" },
  { key: "layout.footer.center", type: "elements", default: NONE, catalog: AMBIENT, max: 3, group: "layout", scopes: NOT_SESSION, relayout: true, depth: "standard" },
  { key: "layout.footer.right", type: "elements", default: NONE, catalog: AMBIENT, max: 3, group: "layout", scopes: NOT_SESSION, relayout: true, depth: "standard" },
  // The bars on a middle tap. The defaults are the bars Quire had before they were configurable.
  // They float over the text, so changing them never repaginates.
  { key: "layout.topBar", type: "elements", default: ["back", "title"], catalog: CONTROLS, max: 5, group: "layout", scopes: NOT_SESSION, relayout: false, depth: "standard" },
  { key: "layout.quickRow", type: "elements", default: ["prevChapter", "slider", "nextChapter", "percent"], catalog: CONTROLS, max: 6, group: "layout", scopes: NOT_SESSION, relayout: false, depth: "standard" },
  { key: "layout.bottomBar", type: "elements", default: ["contents", "look", "flow"], catalog: CONTROLS, max: 6, group: "layout", scopes: NOT_SESSION, relayout: false, depth: "standard" },
  // Tap zones: thirds of the page. Left and right follow the "reading direction" setting.
  { key: "gesture.tapLeft", default: "prevPage", ...GESTURE },
  { key: "gesture.tapCenter", default: "bars", ...GESTURE },
  { key: "gesture.tapRight", default: "nextPage", ...GESTURE },
  // A horizontal swipe always turns the page. Vertical swipes are free in Pages mode only;
  // in Scroll mode they scroll. Long press stays text selection.
  { key: "gesture.swipeUp", default: "none", ...GESTURE },
  { key: "gesture.swipeDown", default: "none", ...GESTURE },
  { key: "gesture.twoFingerTap", default: "none", ...GESTURE },
  { key: "turn.style", type: "choice", default: "none", choices: TURN_STYLES, group: "turns", scopes: NOT_SESSION, relayout: false, depth: "standard" },
  { key: "turn.duration", type: "number", default: 280, min: 120, max: 1200, step: 20, group: "turns", scopes: NOT_SESSION, relayout: false, depth: "standard" },
  { key: "turn.followReduceMotion", type: "boolean", default: true, group: "turns", scopes: ["global"], relayout: false, depth: "advanced" },
] as const satisfies readonly Setting[];

export type SettingKey = (typeof SETTINGS)[number]["key"];

/** The value type of each key, from its declaration. */
export type SettingValue<K extends SettingKey> =
  Extract<(typeof SETTINGS)[number], { key: K }> extends { type: "number" }
    ? number
    : Extract<(typeof SETTINGS)[number], { key: K }> extends { type: "boolean" }
      ? boolean
      : Extract<(typeof SETTINGS)[number], { key: K }> extends { type: "font" }
        ? string
        : Extract<(typeof SETTINGS)[number], { key: K }> extends { type: "elements" }
          ? readonly string[]
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
    case "font":
      return isFontId(value) ? value : null;
    case "elements": {
      if (!Array.isArray(value)) return null;
      const out: string[] = [];
      for (const item of value) {
        if (typeof item === "string" && setting.catalog.includes(item) && !out.includes(item)) out.push(item);
      }
      return out.slice(0, setting.max);
    }
  }
}

/** Equality for setting values: lists compare item by item. */
export function sameValue(a: Value | undefined, b: Value | undefined): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, i) => item === b[i]);
  return a === b;
}

export function defaults(): Resolved {
  const out: Record<string, Value> = {};
  for (const setting of SETTINGS) out[setting.key] = setting.default;
  return out as Resolved;
}
