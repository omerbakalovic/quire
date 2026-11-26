import { cleanLayer, resolve, setValue, type LayerValues, type Values } from "./layers.ts";
import { MAX_USER_FONTS, parseUserFonts, type UserFont } from "./fonts.ts";
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
  /** Fonts the reader imported; their files live in the app's font folder. */
  fonts: UserFont[];
};

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_PROFILES = 50;

export function emptyCustomization(): Customization {
  return { global: {}, profiles: [], activeProfile: null, books: {}, fonts: [] };
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
  return { global: cleanLayer("global", raw.global), profiles, activeProfile: active, books, fonts: parseUserFonts(raw.fonts) };
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

/** Add an imported font. A full list, or a repeated id, changes nothing. */
export function addUserFont(custom: Customization, font: UserFont): Customization {
  const [clean] = parseUserFonts([font]);
  if (!clean || custom.fonts.some((f) => f.id === clean.id) || custom.fonts.length >= MAX_USER_FONTS) return custom;
  return { ...custom, fonts: [...custom.fonts, clean] };
}

/**
 * Remove an imported font. Every layer that chose it goes back to the book's
 * own fonts, so no saved value points at a missing file.
 */
export function removeUserFont(custom: Customization, id: string): Customization {
  if (!custom.fonts.some((f) => f.id === id)) return custom;
  const drop = (values: Values): Values => {
    if (values["type.fontFamily"] !== id) return values;
    const next = { ...values };
    delete next["type.fontFamily"];
    return next;
  };
  const books: Record<string, Values> = {};
  for (const [bookId, values] of Object.entries(custom.books)) {
    const next = drop(values);
    if (Object.keys(next).length > 0) books[bookId] = next;
  }
  return {
    ...custom,
    fonts: custom.fonts.filter((f) => f.id !== id),
    global: drop(custom.global),
    profiles: custom.profiles.map((p) => ({ ...p, values: drop(p.values) })),
    books,
  };
}

/** A free profile id made from a name: "Night" → "night", then "night-2", "night-3"… */
export function profileIdFor(custom: Customization, name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "profile";
  let id = base;
  for (let n = 2; custom.profiles.some((p) => p.id === id); n++) id = `${base}-${n}`;
  return id;
}

export function renameProfile(custom: Customization, id: string, name: string): Customization {
  const label = name.trim().slice(0, 60);
  if (!label || !custom.profiles.some((p) => p.id === id)) return custom;
  return { ...custom, profiles: custom.profiles.map((p) => (p.id === id ? { ...p, name: label } : p)) };
}

/** Copy a profile under a new name, right after the original. Returns the copy's id, or null when nothing changed. */
export function duplicateProfile(custom: Customization, id: string, name: string): { custom: Customization; id: string | null } {
  const index = custom.profiles.findIndex((p) => p.id === id);
  if (index < 0 || custom.profiles.length >= MAX_PROFILES) return { custom, id: null };
  const label = name.trim().slice(0, 60) || custom.profiles[index].name;
  const copyId = profileIdFor(custom, label);
  const copy: Profile = { id: copyId, name: label, values: { ...custom.profiles[index].values } };
  const profiles = [...custom.profiles.slice(0, index + 1), copy, ...custom.profiles.slice(index + 1)];
  return { custom: { ...custom, profiles }, id: copyId };
}

/**
 * The values "+ New profile" and "Update from current" save: what is in use
 * now from global and the active profile, without this book's overrides.
 */
export function currentProfileValues(custom: Customization): Values {
  const active = custom.profiles.find((p) => p.id === custom.activeProfile);
  return cleanLayer("profile", { ...custom.global, ...(active?.values ?? {}) });
}

/** Put a profile's values back to what is in use now (global plus the active profile). */
export function updateProfileFromCurrent(custom: Customization, id: string): Customization {
  if (!custom.profiles.some((p) => p.id === id)) return custom;
  const values = currentProfileValues(custom);
  return { ...custom, profiles: custom.profiles.map((p) => (p.id === id ? { ...p, values } : p)) };
}

/** Put a profile back where it was, for Undo after a delete. */
export function restoreProfile(custom: Customization, profile: Profile, index: number, wasActive: boolean): Customization {
  if (custom.profiles.some((p) => p.id === profile.id) || custom.profiles.length >= MAX_PROFILES) return custom;
  const at = Math.max(0, Math.min(index, custom.profiles.length));
  const profiles = [...custom.profiles.slice(0, at), { ...profile, values: cleanLayer("profile", profile.values) }, ...custom.profiles.slice(at)];
  return { ...custom, profiles, activeProfile: wasActive ? profile.id : custom.activeProfile };
}

/**
 * Revert (docs/customization-roadmap.md, 2.6): every layer, the profiles and
 * the active profile go back to a snapshot taken when the editor opened.
 * Fonts stay as they are now, since their files were imported or deleted;
 * a value naming a font that is gone falls back to the book's fonts.
 */
export function revertTo(current: Customization, snapshot: Customization): Customization {
  const known = new Set(current.fonts.map((f) => f.id));
  const keep = (values: Values): Values => {
    const font = values["type.fontFamily"];
    if (typeof font !== "string" || !font.startsWith("user-") || known.has(font)) return values;
    const next = { ...values };
    delete next["type.fontFamily"];
    return next;
  };
  const books: Record<string, Values> = {};
  for (const [id, values] of Object.entries(snapshot.books)) {
    const next = keep(values);
    if (Object.keys(next).length > 0) books[id] = next;
  }
  return {
    global: keep(snapshot.global),
    profiles: snapshot.profiles.map((p) => ({ ...p, values: keep(p.values) })),
    activeProfile: snapshot.activeProfile,
    books,
    fonts: current.fonts,
  };
}

/** Whether anything Revert would undo has changed since the snapshot. */
export function changedSince(current: Customization, snapshot: Customization): boolean {
  const strip = (c: Customization) => JSON.stringify({ g: c.global, p: c.profiles, a: c.activeProfile, b: c.books });
  return strip(current) !== strip(snapshot);
}
