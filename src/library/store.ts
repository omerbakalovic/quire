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
  await commit(removeBook(library, id));
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

/** Resolves once every write queued so far is on disk. */
export function flushLibrary(): Promise<void> {
  return writing;
}
