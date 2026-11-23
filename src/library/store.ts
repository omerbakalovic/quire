import { useSyncExternalStore } from "react";

import { decideImport, type ImportOutcome } from "@/domain/import-outcome";
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
import { deleteBook, importBook, readLibrary, writeLibrary } from "@/renderer/book-url";
import { changeSetting, forgetBook, setActiveProfile, saveProfile as saveProfileTo } from "@/settings/customization";
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
  await commit({ ...removeBook(library, id), custom: forgetBook(library.custom, id) });
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

export function saveProfile(id: string, name: string, values: Values): Promise<void> {
  return commit({ ...library, custom: saveProfileTo(library.custom, id, name, values) });
}

export function chooseProfile(id: string | null): Promise<void> {
  const custom = setActiveProfile(library.custom, id);
  return custom === library.custom ? writing : commit({ ...library, custom });
}

/** Resolves once every write queued so far is on disk. */
export function flushLibrary(): Promise<void> {
  return writing;
}
