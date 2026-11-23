import { cleanLayer, resolve, setValue, type LayerValues, type Values } from "./layers.ts";
import type { Layer, Resolved, SettingKey } from "./registry.ts";

/**
 * The saved part of customization: global values, named reading profiles,
 * the active profile, and per-book overrides. Session values are never saved.
 * Parsing never throws and drops anything it does not recognise.
 */
export type Profile = { id: string; name: string; values: Values };

export type Customization = {
  global: Values;
  profiles: Profile[];
  activeProfile: string | null;
  books: Record<string, Values>;
};

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_PROFILES = 50;

export function emptyCustomization(): Customization {
  return { global: {}, profiles: [], activeProfile: null, books: {} };
}

export function parseCustomization(value: unknown): Customization {
  if (!value || typeof value !== "object") return emptyCustomization();
  const raw = value as Record<string, unknown>;
  const profiles: Profile[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw.profiles) ? raw.profiles.slice(0, MAX_PROFILES) : []) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    if (typeof p.id !== "string" || !ID.test(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    const name = typeof p.name === "string" && p.name.trim() ? p.name.trim().slice(0, 60) : p.id;
    profiles.push({ id: p.id, name, values: cleanLayer("profile", p.values) });
  }
  const books: Record<string, Values> = {};
  if (raw.books && typeof raw.books === "object") {
    for (const [id, values] of Object.entries(raw.books as Record<string, unknown>)) {
      if (!ID.test(id)) continue;
      const clean = cleanLayer("book", values);
      if (Object.keys(clean).length > 0) books[id] = clean;
    }
  }
  const active = typeof raw.activeProfile === "string" && seen.has(raw.activeProfile) ? raw.activeProfile : null;
  return { global: cleanLayer("global", raw.global), profiles, activeProfile: active, books };
}

/** The layers for one book, plus any session values the reader holds in memory. */
export function layersFor(custom: Customization, bookId: string | null, session: Values = {}): LayerValues {
  const profile = custom.profiles.find((p) => p.id === custom.activeProfile);
  return {
    session: cleanLayer("session", session),
    book: bookId ? (custom.books[bookId] ?? {}) : {},
    profile: profile?.values ?? {},
    global: custom.global,
  };
}

export function resolvedFor(custom: Customization, bookId: string | null, session: Values = {}): Resolved {
  return resolve(layersFor(custom, bookId, session));
}

/**
 * Change one saved setting. "global" and "book" write those layers; "profile"
 * writes the active profile and does nothing when none is active.
 */
export function changeSetting(
  custom: Customization,
  layer: Exclude<Layer, "session">,
  key: SettingKey,
  value: unknown,
  bookId: string | null,
): Customization {
  const layers = layersFor(custom, bookId);
  if (layer === "global") {
    const next = setValue(layers, "global", key, value).global ?? {};
    return next === custom.global ? custom : { ...custom, global: next };
  }
  if (layer === "book") {
    if (!bookId || !ID.test(bookId)) return custom;
    const next = setValue(layers, "book", key, value).book ?? {};
    const books = { ...custom.books };
    if (Object.keys(next).length > 0) books[bookId] = next;
    else delete books[bookId];
    return { ...custom, books };
  }
  const index = custom.profiles.findIndex((p) => p.id === custom.activeProfile);
  if (index < 0) return custom;
  const next = setValue(layers, "profile", key, value).profile ?? {};
  const profiles = custom.profiles.map((p, i) => (i === index ? { ...p, values: next } : p));
  return { ...custom, profiles };
}

/** Save the current global look as a profile, or overwrite one with the same id. */
export function saveProfile(custom: Customization, id: string, name: string, values: Values): Customization {
  if (!ID.test(id)) return custom;
  const clean = cleanLayer("profile", values);
  const profile = { id, name: name.trim().slice(0, 60) || id, values: clean };
  const exists = custom.profiles.some((p) => p.id === id);
  if (!exists && custom.profiles.length >= MAX_PROFILES) return custom;
  const profiles = exists ? custom.profiles.map((p) => (p.id === id ? profile : p)) : [...custom.profiles, profile];
  return { ...custom, profiles };
}

export function setActiveProfile(custom: Customization, id: string | null): Customization {
  if (id !== null && !custom.profiles.some((p) => p.id === id)) return custom;
  return custom.activeProfile === id ? custom : { ...custom, activeProfile: id };
}

export function deleteProfile(custom: Customization, id: string): Customization {
  const profiles = custom.profiles.filter((p) => p.id !== id);
  if (profiles.length === custom.profiles.length) return custom;
  return { ...custom, profiles, activeProfile: custom.activeProfile === id ? null : custom.activeProfile };
}

/** A book removed from the library loses its overrides. */
export function forgetBook(custom: Customization, bookId: string): Customization {
  if (!custom.books[bookId]) return custom;
  const books = { ...custom.books };
  delete books[bookId];
  return { ...custom, books };
}
