import { useSyncExternalStore } from "react";

import { decideImport, type ImportOutcome } from "@/domain/import-outcome";
import {
  forgetBook,
  setBookColor,
  setCoverColor,
  setFileName,
  updateLook,
  type LibraryLook,
  type LookOptions,
} from "@/domain/library-look";
import {
  emptyLibrary,
  parseLibrary,
  recordPosition,
  removeBook,
  serializeLibrary,
  setFlow,
  markOpened,
  updateSettings,
  upsertBook,
  type Flow,
  type Library,
  type PositionReport,
  type Settings,
} from "@/domain/library";
import { averageColor, deleteBook, deleteFont, importBook, importFont, readLibrary, writeLibrary } from "@/renderer/book-url";
import {
  addUserFont,
  changeSetting,
  deleteProfile,
  forgetBook as forgetBookSettings,
  removeUserFont,
  setActiveProfile,
  saveProfile as saveProfileTo,
} from "@/settings/customization";
import { MAX_USER_FONTS, newUserFontId, userFontLabel, type UserFont } from "@/settings/fonts";
import { resetGroup } from "@/settings/layers";
import type { Values } from "@/settings/layers";
import type { Layer, SettingKey } from "@/settings/registry";

/**
 * One library for the process. Every change is written whole by the native
 * store, one write at a time, in the order the changes were made.
 */
let library: Library = emptyLibrary();
let loaded: Promise<void> | null = null;
let writing: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function commit(next: Library): Promise<void> {
  if (next === library) return writing;
  library = next;
  emit();
  const json = serializeLibrary(next);
  writing = writing.then(() => writeLibrary(json)).catch((error: unknown) => {
    console.error("library write failed", error);
  });
  return writing;
}

export function loadLibrary(): Promise<void> {
  if (!loaded) {
    loaded = readLibrary()
      .then((json) => {
        library = parseLibrary(json);
        emit();
      })
      .catch((error: unknown) => {
        console.error("library read failed", error);
      });
  }
  return loaded;
}

export function getLibrary(): Library {
  return library;
}

export function useLibrary(): Library {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => library,
  );
}

export type ImportSummary = { name: string; outcome: ImportOutcome | { kind: "error"; detail: string } };

/** Imports picked files one at a time. One failure does not stop the rest. */
export async function importFiles(files: { uri: string; name: string | null }[]): Promise<ImportSummary[]> {
  await loadLibrary();
  const results: ImportSummary[] = [];
  for (const file of files) {
    const name = file.name ?? file.uri;
    try {
      const outcome = decideImport(await importBook(file.uri));
      if (outcome.kind === "added" || outcome.kind === "duplicate") {
        await commit(upsertBook(library, outcome.facts, file.name, Date.now()));
        // A re-import fills in the file name for books added before names were kept.
        if (file.name && (outcome.kind === "added" || !library.look.fileNames[outcome.facts.id])) {
          await changeLook((look) => setFileName(look, outcome.facts.id, file.name));
        }
        await measureCover(outcome.facts.id, outcome.facts.coverUri);
      } else if (outcome.kind === "drm" && outcome.removeFile) {
        await deleteBook(outcome.id);
      }
      results.push({ name, outcome });
    } catch (error) {
      results.push({ name, outcome: { kind: "error", detail: String(error) } });
    }
  }
  return results;
}

export async function removeFromLibrary(id: string): Promise<void> {
  await commit({ ...removeBook(library, id), custom: forgetBookSettings(library.custom, id) });
  await changeLook((look) => forgetBook(look, id));
  await deleteBook(id);
}

export function savePosition(id: string, report: PositionReport): Promise<void> {
  return commit(recordPosition(library, id, report, Date.now()));
}

export function saveOpened(id: string): Promise<void> {
  return commit(markOpened(library, id, Date.now()));
}

export function saveFlow(flow: Flow): Promise<void> {
  return commit(setFlow(library, flow));
}

export function saveSettings(patch: Partial<Settings>): Promise<void> {
  return commit(updateSettings(library, patch));
}

/** One reading-look setting, in the global, profile, or this-book layer. `null` clears it. */
export function saveSetting(layer: Exclude<Layer, "session">, key: SettingKey, value: unknown, bookId: string | null): Promise<void> {
  const custom = changeSetting(library.custom, layer, key, value, bookId);
  return custom === library.custom ? writing : commit({ ...library, custom });
}

/** Several settings in one layer at once, written once (a layout preset). */
export function saveSettingsIn(layer: Exclude<Layer, "session">, values: Values, bookId: string | null): Promise<void> {
  let custom = library.custom;
  for (const [key, value] of Object.entries(values)) custom = changeSetting(custom, layer, key as SettingKey, value, bookId);
  return custom === library.custom ? writing : commit({ ...library, custom });
}

/** Reset buttons: clear some groups from one book's overrides, or from the global values. */
export function resetBookGroups(bookId: string, groups: string[]): Promise<void> {
  let values = { book: library.custom.books[bookId] ?? {} };
  for (const group of groups) values = { book: resetGroup(values, "book", group).book ?? {} };
  const books = { ...library.custom.books };
  if (Object.keys(values.book).length > 0) books[bookId] = values.book;
  else delete books[bookId];
  return commit({ ...library, custom: { ...library.custom, books } });
}

export function resetGlobalGroups(groups: string[]): Promise<void> {
  let values = { global: library.custom.global };
  for (const group of groups) values = { global: resetGroup(values, "global", group).global ?? {} };
  return commit({ ...library, custom: { ...library.custom, global: values.global } });
}

/** Reset some groups in the active reading profile. Nothing happens without one. */
export function resetProfileGroups(groups: string[]): Promise<void> {
  const index = library.custom.profiles.findIndex((p) => p.id === library.custom.activeProfile);
  if (index < 0) return writing;
  let values = { profile: library.custom.profiles[index].values };
  for (const group of groups) values = { profile: resetGroup(values, "profile", group).profile ?? {} };
  const profiles = library.custom.profiles.map((p, i) => (i === index ? { ...p, values: values.profile } : p));
  return commit({ ...library, custom: { ...library.custom, profiles } });
}

export function saveProfile(id: string, name: string, values: Values): Promise<void> {
  return commit({ ...library, custom: saveProfileTo(library.custom, id, name, values) });
}

export function removeProfile(id: string): Promise<void> {
  const custom = deleteProfile(library.custom, id);
  return custom === library.custom ? writing : commit({ ...library, custom });
}

export function chooseProfile(id: string | null): Promise<void> {
  const custom = setActiveProfile(library.custom, id);
  return custom === library.custom ? writing : commit({ ...library, custom });
}

export type FontAdded = { ok: true; font: UserFont } | { ok: false; reason: "full" | "unreadable" | "not-font" | "too-large" | "bad-id" };

/** Copy a picked font file into app storage and list it with the reading fonts. */
export async function addFont(uri: string, name: string | null): Promise<FontAdded> {
  await loadLibrary();
  if (library.custom.fonts.length >= MAX_USER_FONTS) return { ok: false, reason: "full" };
  const id = newUserFontId(library.custom.fonts.map((f) => f.id));
  const stored = await importFont(uri, id);
  if (!stored.ok) return stored;
  const font = { id, label: userFontLabel(name ?? stored.name, id), file: stored.file };
  await commit({ ...library, custom: addUserFont(library.custom, font) });
  return { ok: true, font };
}

/** Forget an imported font and delete its file. Settings that chose it go back to the book's fonts. */
export async function removeFont(id: string): Promise<void> {
  const font = library.custom.fonts.find((f) => f.id === id);
  if (!font) return;
  await commit({ ...library, custom: removeUserFont(library.custom, id) });
  await deleteFont(font.file).catch(() => false);
}

/** Resolves once every write queued so far is on disk. */
export function flushLibrary(): Promise<void> {
  return writing;
}

function changeLook(change: (look: LibraryLook) => LibraryLook): Promise<void> {
  const look = change(library.look);
  return look === library.look ? writing : commit({ ...library, look });
}

/** The pill colour comes from the cover. A failed measurement leaves the neutral pill. */
async function measureCover(id: string, coverUri: string | null): Promise<void> {
  if (!coverUri || library.look.coverColors[id]) return;
  const color = await averageColor(coverUri).catch(() => null);
  if (color) await changeLook((look) => setCoverColor(look, id, color));
}

/** Books imported before pills existed get their cover colour measured once. */
export async function measureMissingCovers(): Promise<void> {
  await loadLibrary();
  for (const book of library.books) await measureCover(book.id, book.coverUri);
}

export function saveLook(patch: Partial<LookOptions>): Promise<void> {
  return changeLook((look) => updateLook(look, patch));
}

/** null goes back to the cover's colour. */
export function saveBookColor(id: string, color: string | null): Promise<void> {
  return changeLook((look) => setBookColor(look, id, color));
}
