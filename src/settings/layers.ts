import { migrateBars } from "./bars.ts";
import { cleanValue, defaults, sameValue, settingFor, SETTINGS, type Layer, type Resolved, type SettingKey, type Value } from "./registry.ts";

/**
 * Layered settings (docs/customization.md, section 2.2). The value in use is
 * the first one found from the top: session, this book, the active reading
 * profile, global, then the built-in default.
 */
export type Values = Partial<Record<SettingKey, Value>>;

export type LayerValues = { [L in Layer]?: Values };

export const ORDER: Layer[] = ["session", "book", "profile", "global"];

export type Source = Layer | "default";

/** Keep only known keys with valid values, that the layer is allowed to hold. */
export function cleanLayer(layer: Layer, raw: unknown): Values {
  const out: Values = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(migrateBars(raw as Record<string, unknown>))) {
    const setting = settingFor(key);
    if (!setting || !setting.scopes.includes(layer)) continue;
    const clean = cleanValue(key, value);
    if (clean !== null) out[key as SettingKey] = clean;
  }
  return out;
}

export function resolve(layers: LayerValues): Resolved {
  const out = defaults() as Record<string, Value>;
  for (const setting of SETTINGS) {
    for (const layer of ORDER) {
      const value = layers[layer]?.[setting.key];
      if (value !== undefined && (setting.scopes as readonly Layer[]).includes(layer)) {
        out[setting.key] = value;
        break;
      }
    }
  }
  return out as Resolved;
}

/** Where a setting's value comes from, for "from this book" / "from Night" labels. */
export function sourceOf(layers: LayerValues, key: SettingKey): Source {
  const setting = settingFor(key);
  if (!setting) return "default";
  for (const layer of ORDER) {
    if (layers[layer]?.[key] !== undefined && setting.scopes.includes(layer)) return layer;
  }
  return "default";
}

/**
 * Set or clear one value in one layer. A value equal to what the layers below
 * would give is cleared instead, so "use the global value" and dragging back
 * to the default both leave no stray override behind.
 */
export function setValue(layers: LayerValues, layer: Layer, key: SettingKey, value: unknown): LayerValues {
  const setting = settingFor(key);
  if (!setting || !setting.scopes.includes(layer)) return layers;
  const current = { ...(layers[layer] ?? {}) };
  const clean = value === null ? null : cleanValue(key, value);
  if (value !== null && clean === null) return layers;
  const below = resolve(layersBelow(layers, layer))[key];
  if (clean === null || sameValue(clean, below)) delete current[key];
  else current[key] = clean;
  return { ...layers, [layer]: current };
}

function layersBelow(layers: LayerValues, layer: Layer): LayerValues {
  const index = ORDER.indexOf(layer);
  const out: LayerValues = {};
  for (const lower of ORDER.slice(index + 1)) out[lower] = layers[lower];
  return out;
}

/** Whether a change between two resolved sets needs the book re-laid out. */
export function needsRelayout(before: Resolved, after: Resolved): boolean {
  return SETTINGS.some((setting) => setting.relayout && !sameValue(before[setting.key], after[setting.key]));
}

/** Reset one group in one layer (the per-group reset button). */
export function resetGroup(layers: LayerValues, layer: Layer, group: string): LayerValues {
  const current = { ...(layers[layer] ?? {}) };
  for (const setting of SETTINGS) if (setting.group === group) delete current[setting.key];
  return { ...layers, [layer]: current };
}
