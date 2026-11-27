import { layersFor, type Customization } from "./customization.ts";
import { sourceOf, type LayerValues, type Source } from "./layers.ts";
import { settingFor, type Group, type Layer, type SettingKey } from "./registry.ts";

/**
 * The Reading Look editor (docs/customization-roadmap.md, C1): its tabs, the
 * "Saving to" target and the "from …" labels. Kept free of React so it can
 * be tested; src/app/look.tsx only draws it.
 */
export const TABS = ["text", "page", "colours", "bars", "turns", "gestures"] as const;
export type Tab = (typeof TABS)[number];

export const TAB_GROUPS: Record<Tab, readonly Group[]> = {
  text: ["typography"],
  page: ["page", "light"],
  colours: ["theme"],
  // The layout itself is the Bars editor (src/look/BarsEditor.tsx); the rows here are the bar style.
  bars: ["layout", "barStyle"],
  turns: ["turns"],
  gestures: ["gestures", "behaviour"],
};

/** Shown in the editor's fixed top, so the tabs leave them out. */
export const PINNED: readonly SettingKey[] = ["type.fontSize", "theme.id"];

export function isTab(value: unknown): value is Tab {
  return typeof value === "string" && (TABS as readonly string[]).includes(value);
}

/** Where a change is saved: the active profile, every book, or only the book the editor came from. */
export type Target = "profile" | "global" | "book";

export function targetsFor(custom: Customization, bookId: string | null): Target[] {
  const out: Target[] = [];
  if (custom.activeProfile && custom.profiles.some((p) => p.id === custom.activeProfile)) out.push("profile");
  out.push("global");
  if (bookId) out.push("book");
  return out;
}

/** The active profile when there is one (as Aa did before), else every book. */
export function defaultTarget(custom: Customization, bookId: string | null): Target {
  return targetsFor(custom, bookId)[0];
}

/** A target that went away (the profile was switched off) falls back to the default. */
export function validTarget(custom: Customization, bookId: string | null, target: Target): Target {
  return targetsFor(custom, bookId).includes(target) ? target : defaultTarget(custom, bookId);
}

export function layerOf(target: Target): Exclude<Layer, "session"> {
  return target;
}

export function editorLayers(custom: Customization, bookId: string | null): LayerValues {
  return layersFor(custom, bookId);
}

/**
 * What a control says about its value, relative to where changes go:
 * - "here": the target layer sets it (a reset is offered);
 * - "above": a higher layer sets it, so a change here won't show (e.g. editing
 *   every book while this book has its own value);
 * - "below": it comes from a lower layer or the default.
 */
export type Origin = { kind: "here" | "above" | "below"; source: Source };

const RANK: Record<Source, number> = { session: 4, book: 3, profile: 2, global: 1, default: 0 };

export function originOf(layers: LayerValues, target: Target, key: SettingKey): Origin {
  const source = sourceOf(layers, key);
  const setting = settingFor(key);
  if (!setting) return { kind: "below", source: "default" };
  if (source === target) return { kind: "here", source };
  return { kind: RANK[source] > RANK[target] ? "above" : "below", source };
}

/** The keys the target layer may hold in one tab, in registry order, minus the pinned ones. */
export function groupsFor(tab: Tab): readonly Group[] {
  return TAB_GROUPS[tab];
}

/** The least height the settings list keeps under the preview, and the least preview worth showing (dp). */
export const MIN_SETTINGS_HEIGHT = 160;
export const MIN_PREVIEW_HEIGHT = 120;

/**
 * The preview pane's height: 30 % of a portrait window or 40 % of a landscape
 * one, but never so tall that the settings list under it gets less than
 * MIN_SETTINGS_HEIGHT. `free` is the screen's height left after the fixed top,
 * the preview toggle and the tabs (null before they are measured). 0 means
 * there is no room for a useful preview.
 */
export function previewHeight(window: { width: number; height: number }, free: number | null): number {
  const wanted = Math.round(window.height * (window.height > window.width ? 0.3 : 0.4));
  if (free === null) return wanted;
  const room = Math.floor(free - MIN_SETTINGS_HEIGHT);
  const height = Math.min(wanted, room);
  return height >= MIN_PREVIEW_HEIGHT ? height : 0;
}

/** How far, in dp, a touch on a slider moves before it counts as a slide rather than a tap. */
export const SLIDE_SLOP = 8;

/** A move is a slide when it has gone past the slop and is clearly more sideways than up or down. */
export function isSideways(dx: number, dy: number): boolean {
  return Math.abs(dx) > SLIDE_SLOP && Math.abs(dx) > Math.abs(dy) * 1.5;
}
