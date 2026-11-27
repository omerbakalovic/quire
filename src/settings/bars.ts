import { BARS, ZONES, type Resolved, type SettingKey } from "./registry.ts";

/**
 * The control bars' zones (docs/customization-roadmap.md, C5), kept free of
 * React so the reader, the preview and the tests lay them out the same way.
 */
export type Bar = (typeof BARS)[number];
export type Zone = (typeof ZONES)[number];

/** Controls that take the free width of their row. */
export const GROWERS: readonly string[] = ["slider", "title"];

export function zoneKey(bar: Bar, zone: Zone): SettingKey {
  return `layout.${bar}.${zone}` as SettingKey;
}

export function arrangeKey(bar: Bar): SettingKey {
  return `layout.${bar}.arrange` as SettingKey;
}

/** The single list each bar had before zones, and the zone that drew like it. */
const LEGACY: Record<Bar, { key: string; zone: Zone }> = {
  top: { key: "layout.topBar", zone: "start" },
  quick: { key: "layout.quickRow", zone: "center" },
  bottom: { key: "layout.bottomBar", zone: "center" },
};

/**
 * Saved layers from before C5 (rule 3.4): a bar's list moves into the zone
 * that draws it in the same place, and the bar keeps its old arrangement
 * (a row without a slider or title spread its controls across). A layer that
 * already has zones for that bar keeps them.
 */
export function migrateBars(raw: Record<string, unknown>): Record<string, unknown> {
  let out = raw;
  for (const bar of BARS) {
    const { key, zone } = LEGACY[bar];
    if (!(key in raw)) continue;
    if (out === raw) out = { ...raw };
    const list = raw[key];
    delete out[key];
    if (ZONES.some((z) => zoneKey(bar, z) in raw) || !Array.isArray(list)) continue;
    for (const z of ZONES) out[zoneKey(bar, z)] = z === zone ? list : [];
    out[arrangeKey(bar)] = list.some((item) => GROWERS.includes(item)) ? "zones" : "spread";
  }
  return out;
}

export type ZoneLayout = {
  /** "all" when the bar spreads its controls over the whole row. */
  zone: Zone | "all";
  items: string[];
  /** Takes the free width of the row. */
  grow: boolean;
  justify: "flex-start" | "center" | "flex-end" | "space-between";
};

const JUSTIFY: Record<Zone, ZoneLayout["justify"]> = { start: "flex-start", center: "center", end: "flex-end" };

/**
 * One bar's row. With zones, start sits left, centre in the middle and end
 * right; a zone holding a slider or the title takes the free width. Spread puts
 * every control evenly across the row. `placed` holds controls already drawn in
 * an earlier bar: a control is drawn once, in the first place it appears.
 */
export function barRow(settings: Resolved, bar: Bar, placed: Set<string> = new Set()): ZoneLayout[] {
  const zones = ZONES.map((zone) => {
    const items = (settings[zoneKey(bar, zone)] as readonly string[]).filter((item) => !placed.has(item));
    for (const item of items) placed.add(item);
    return { zone, items };
  });
  if (zones.every((z) => z.items.length === 0)) return [];
  const growing = zones.some((z) => z.items.some((item) => GROWERS.includes(item)));
  if (settings[arrangeKey(bar)] === "spread") {
    const items = zones.flatMap((z) => z.items);
    return [{ zone: "all", items, grow: true, justify: growing ? "flex-start" : "space-between" }];
  }
  return zones.map(({ zone, items }) => {
    const grows = items.some((item) => GROWERS.includes(item));
    // Without a growing zone, start and end share the sides equally so the centre stays centred.
    const grow = growing ? grows : zone !== "center";
    return { zone, items, grow, justify: grows ? "flex-start" : JUSTIFY[zone] };
  });
}

/** All three bars, each control drawn once. */
export function barRows(settings: Resolved): Record<Bar, ZoneLayout[]> {
  const placed = new Set<string>();
  return { top: barRow(settings, "top", placed), quick: barRow(settings, "quick", placed), bottom: barRow(settings, "bottom", placed) };
}

/** Every control in a bar, in drawing order. */
export function barItems(settings: Resolved, bar: Bar): string[] {
  return ZONES.flatMap((zone) => settings[zoneKey(bar, zone)] as readonly string[]);
}
