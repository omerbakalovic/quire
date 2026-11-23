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
import { averageColor, deleteBook, importBook, readLibrary, writeLibrary } from "@/renderer/book-url";

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
  await commit(removeBook(library, id));
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
