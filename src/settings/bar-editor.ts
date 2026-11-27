import { arrangeKey, zoneKey, type Bar } from "./bars.ts";
import { AMBIENT, ARRANGEMENTS, CONTROLS, sameValue, settingFor, type Resolved, type SettingKey } from "./registry.ts";

/**
 * The Bars tab's model (docs/customization-roadmap.md, C5), free of React so
 * it can be tested. The editor works on a draft of every layout value; Save
 * writes it to the layer being edited (roadmap 2.6).
 */
export type RegionId = "header" | "footer" | Bar;
export type Region = { id: RegionId; kind: "lines" | "controls"; keys: readonly [SettingKey, SettingKey, SettingKey]; catalog: readonly string[] };

const lineKeys = (band: "header" | "footer") =>
  [`layout.${band}.left`, `layout.${band}.center`, `layout.${band}.right`] as unknown as readonly [SettingKey, SettingKey, SettingKey];
const barKeys = (bar: Bar) => [zoneKey(bar, "start"), zoneKey(bar, "center"), zoneKey(bar, "end")] as const;

/** Top to bottom, as on the screen: the header line, the top bar, the bottom panel's rows, the footer line. */
export const REGIONS: readonly Region[] = [
  { id: "header", kind: "lines", keys: lineKeys("header"), catalog: AMBIENT },
  { id: "top", kind: "controls", keys: barKeys("top"), catalog: CONTROLS },
  { id: "quick", kind: "controls", keys: barKeys("quick"), catalog: CONTROLS },
  { id: "bottom", kind: "controls", keys: barKeys("bottom"), catalog: CONTROLS },
  { id: "footer", kind: "lines", keys: lineKeys("footer"), catalog: AMBIENT },
];

export function regionOf(id: RegionId): Region {
  return REGIONS.find((r) => r.id === id) ?? REGIONS[0];
}

/** Every value the Bars tab edits. */
export const BAR_KEYS: readonly SettingKey[] = [
  ...REGIONS.flatMap((r) => r.keys),
  arrangeKey("top"),
  arrangeKey("quick"),
  arrangeKey("bottom"),
];

export type BarDraft = Partial<Record<SettingKey, readonly string[] | string>>;

export function draftFrom(settings: Resolved): BarDraft {
  const out: BarDraft = {};
  for (const key of BAR_KEYS) out[key] = settings[key] as readonly string[] | string;
  return out;
}

/** The settings the preview draws: the saved ones with the draft on top. */
export function withDraft(settings: Resolved, draft: BarDraft | null): Resolved {
  return draft ? ({ ...settings, ...draft } as Resolved) : settings;
}

const list = (draft: BarDraft, key: SettingKey): readonly string[] => (draft[key] as readonly string[] | undefined) ?? [];
const maxOf = (key: SettingKey) => {
  const setting = settingFor(key);
  return setting && setting.type === "elements" ? setting.max : 0;
};

/** Where an element is now: its region and zone, or null. An element is in one place at most. */
export function placeOf(draft: BarDraft, element: string, kind: Region["kind"]): { region: RegionId; zone: number; index: number } | null {
  for (const region of REGIONS) {
    if (region.kind !== kind) continue;
    for (let zone = 0; zone < 3; zone++) {
      const index = list(draft, region.keys[zone]).indexOf(element);
      if (index >= 0) return { region: region.id, zone, index };
    }
  }
  return null;
}

/** What can be added to a region: its catalog, less what is already placed anywhere of the same kind. */
export function available(draft: BarDraft, region: RegionId): string[] {
  const r = regionOf(region);
  return r.catalog.filter((element) => placeOf(draft, element, r.kind) === null);
}

export type EditResult = { draft: BarDraft; refused?: "full" | "placed" | "edge" };

function put(draft: BarDraft, key: SettingKey, items: readonly string[]): BarDraft {
  return { ...draft, [key]: items };
}

export function addElement(draft: BarDraft, region: RegionId, zone: number, element: string): EditResult {
  const r = regionOf(region);
  if (!r.catalog.includes(element)) return { draft, refused: "placed" };
  if (placeOf(draft, element, r.kind)) return { draft, refused: "placed" };
  const key = r.keys[zone];
  if (list(draft, key).length >= maxOf(key)) return { draft, refused: "full" };
  return { draft: put(draft, key, [...list(draft, key), element]) };
}

export function removeElement(draft: BarDraft, element: string, kind: Region["kind"]): BarDraft {
  const at = placeOf(draft, element, kind);
  if (!at) return draft;
  const key = regionOf(at.region).keys[at.zone];
  return put(draft, key, list(draft, key).filter((e) => e !== element));
}

/**
 * ◀ ▶: one step earlier or later along the region, start to end. At the edge
 * of a zone the element crosses into the next zone (its far end).
 */
export function moveAlong(draft: BarDraft, element: string, kind: Region["kind"], dir: -1 | 1): EditResult {
  const at = placeOf(draft, element, kind);
  if (!at) return { draft };
  const r = regionOf(at.region);
  const key = r.keys[at.zone];
  const items = [...list(draft, key)];
  const next = at.index + dir;
  if (next >= 0 && next < items.length) {
    [items[at.index], items[next]] = [items[next], items[at.index]];
    return { draft: put(draft, key, items) };
  }
  const zone = at.zone + dir;
  if (zone < 0 || zone > 2) return { draft, refused: "edge" };
  const target = r.keys[zone];
  if (list(draft, target).length >= maxOf(target)) return { draft, refused: "full" };
  const moved = put(draft, key, items.filter((e) => e !== element));
  const into = list(moved, target);
  return { draft: put(moved, target, dir > 0 ? [element, ...into] : [...into, element]) };
}

/** ▲ ▼: to the same zone of the region above or below that takes the same kind of element. */
export function moveAcross(draft: BarDraft, element: string, kind: Region["kind"], dir: -1 | 1): EditResult {
  const at = placeOf(draft, element, kind);
  if (!at) return { draft };
  const same = REGIONS.filter((r) => r.kind === kind);
  const index = same.findIndex((r) => r.id === at.region) + dir;
  if (index < 0 || index >= same.length) return { draft, refused: "edge" };
  const target = same[index].keys[at.zone];
  if (list(draft, target).length >= maxOf(target)) return { draft, refused: "full" };
  const from = regionOf(at.region).keys[at.zone];
  const moved = put(draft, from, list(draft, from).filter((e) => e !== element));
  return { draft: put(moved, target, [...list(moved, target), element]) };
}

export function setArrange(draft: BarDraft, bar: Bar, value: (typeof ARRANGEMENTS)[number]): BarDraft {
  return { ...draft, [arrangeKey(bar)]: value };
}

/** Whether Save has anything to write. */
export function barDraftChanged(draft: BarDraft, settings: Resolved): boolean {
  return BAR_KEYS.some((key) => !sameValue(draft[key] as never, settings[key] as never));
}

/** The values Save writes: only what differs from the saved look. */
export function barDraftValues(draft: BarDraft, settings: Resolved): Partial<Record<SettingKey, readonly string[] | string>> {
  const out: Partial<Record<SettingKey, readonly string[] | string>> = {};
  for (const key of BAR_KEYS) if (!sameValue(draft[key] as never, settings[key] as never)) out[key] = draft[key];
  return out;
}

/** The three tap bars' zones and arrangements; the header and footer lines are the presets' (src/settings/layout.ts). */
export const TAP_BAR_KEYS: readonly SettingKey[] = BAR_KEYS.filter((key) => !key.startsWith("layout.header.") && !key.startsWith("layout.footer."));

/** The draft with the tap bars as Quire ships them (emulator run 33: a preset only sets the lines). */
export function defaultTapBars(draft: BarDraft): BarDraft {
  const out: BarDraft = { ...draft };
  for (const key of TAP_BAR_KEYS) out[key] = settingFor(key)?.default as readonly string[] | string;
  return out;
}

export function tapBarsAreDefault(draft: BarDraft): boolean {
  return TAP_BAR_KEYS.every((key) => sameValue(draft[key] as never, settingFor(key)?.default as never));
}
