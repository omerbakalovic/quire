/**
 * The M1b library index. One JSON document, written whole by the native store.
 * SQLite replaces it in Milestone 2, when saved positions get their own table.
 * Parsing never throws: a damaged index keeps the rows it can read.
 */
import { DEFAULT_LOOK, parseLook, type LibraryLook } from "./library-look.ts";
import { cleanPosition } from "./position.ts";

export type Flow = "paginated" | "scrolled";

export type LibraryBook = {
  id: string;
  hash: string;
  size: number;
  title: string;
  authors: string[];
  language: string | null;
  publisher: string | null;
  series: string | null;
  seriesIndex: string | null;
  coverUri: string | null;
  addedAt: number;
  lastOpenedAt: number | null;
  /** Last reported location, with the fallback used when the CFI does not resolve. */
  cfi: string | null;
  fraction: number | null;
  sectionIndex: number | null;
  sectionFraction: number | null;
};

/** "reading": tap zones follow the book's page direction. "screen": right is always forward. */
export type TapZones = "reading" | "screen";

export type Settings = {
  tapZones: TapZones;
};

export type Library = {
  version: 1;
  flow: Flow;
  settings: Settings;
  /** How the shelf looks (src/domain/library-look.ts). */
  look: LibraryLook;
  books: LibraryBook[];
};

export const DEFAULT_SETTINGS: Settings = { tapZones: "reading" };

const BOOK_ID = /^[A-Za-z0-9_-]{1,80}$/;

export function emptyLibrary(): Library {
  return { version: 1, flow: "paginated", settings: { ...DEFAULT_SETTINGS }, look: DEFAULT_LOOK, books: [] };
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseBook(value: unknown): LibraryBook | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const id = str(raw.id);
  if (!id || !BOOK_ID.test(id)) return null;
  const position = cleanPosition({
    cfi: raw.cfi,
    fraction: raw.fraction,
    sectionIndex: raw.sectionIndex,
    sectionFraction: raw.sectionFraction,
  });
  return {
    id,
    hash: str(raw.hash) ?? "",
    size: num(raw.size) ?? 0,
    title: str(raw.title) ?? id,
    authors: Array.isArray(raw.authors) ? raw.authors.filter((a): a is string => typeof a === "string") : [],
    language: str(raw.language),
    publisher: str(raw.publisher),
    series: str(raw.series),
    seriesIndex: str(raw.seriesIndex),
    coverUri: str(raw.coverUri),
    addedAt: num(raw.addedAt) ?? 0,
    lastOpenedAt: num(raw.lastOpenedAt),
    cfi: str(raw.cfi),
    fraction: position.fraction,
    sectionIndex: position.sectionIndex,
    sectionFraction: position.sectionFraction,
  };
}

export function parseLibrary(json: string | null | undefined): Library {
  if (!json) return emptyLibrary();
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return emptyLibrary();
  }
  if (!value || typeof value !== "object") return emptyLibrary();
  const raw = value as { flow?: unknown; books?: unknown; settings?: unknown; look?: unknown };
  const books: LibraryBook[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw.books) ? raw.books : []) {
    const book = parseBook(item);
    if (!book || seen.has(book.id)) continue;
    seen.add(book.id);
    books.push(book);
  }
  return {
    version: 1,
    flow: raw.flow === "scrolled" ? "scrolled" : "paginated",
    settings: parseSettings(raw.settings),
    look: parseLook(raw.look),
    books,
  };
}

function parseSettings(value: unknown): Settings {
  const raw = (value && typeof value === "object" ? value : {}) as { tapZones?: unknown };
  return { tapZones: raw.tapZones === "screen" ? "screen" : DEFAULT_SETTINGS.tapZones };
}

export function updateSettings(library: Library, patch: Partial<Settings>): Library {
  const settings = parseSettings({ ...library.settings, ...patch });
  if (settings.tapZones === library.settings.tapZones) return library;
  return { ...library, settings };
}

export function serializeLibrary(library: Library): string {
  return JSON.stringify(library);
}

/** A file name without its folder and extension, for books with no title. */
export function titleFromFileName(name: string | null | undefined): string | null {
  if (!name) return null;
  const base = name.split(/[\\/]/).pop() ?? "";
  const stem = base.replace(/\.epub$/i, "").replace(/[_]+/g, " ").trim();
  return stem.length > 0 ? stem : null;
}

export type ImportFacts = {
  id: string;
  hash: string;
  size: number;
  title: string | null;
  authors: string[];
  language: string | null;
  publisher: string | null;
  series: string | null;
  seriesIndex: string | null;
  coverUri: string | null;
};

/**
 * Adds a book, or refreshes the metadata of one already there.
 * A re-import keeps the reading position and the date it was added.
 */
export function upsertBook(library: Library, facts: ImportFacts, fileName: string | null, now: number): Library {
  const existing = library.books.find((book) => book.id === facts.id);
  const title = facts.title ?? titleFromFileName(fileName) ?? facts.id;
  const next: LibraryBook = {
    id: facts.id,
    hash: facts.hash,
    size: facts.size,
    title,
    authors: facts.authors,
    language: facts.language,
    publisher: facts.publisher,
    series: facts.series,
    seriesIndex: facts.seriesIndex,
    coverUri: facts.coverUri,
    addedAt: existing?.addedAt ?? now,
    lastOpenedAt: existing?.lastOpenedAt ?? null,
    cfi: existing?.cfi ?? null,
    fraction: existing?.fraction ?? null,
    sectionIndex: existing?.sectionIndex ?? null,
    sectionFraction: existing?.sectionFraction ?? null,
  };
  const books = existing
    ? library.books.map((book) => (book.id === facts.id ? next : book))
    : [...library.books, next];
  return { ...library, books };
}

export function removeBook(library: Library, id: string): Library {
  return { ...library, books: library.books.filter((book) => book.id !== id) };
}

/**
 * Records where the reader is. A missing or non-finite part keeps what was
 * saved before, so one bad report never erases a good position.
 */
export function recordPosition(library: Library, id: string, report: PositionReport, now: number): Library {
  let changed = false;
  const clean = cleanPosition(report);
  const books = library.books.map((book) => {
    if (book.id !== id) return book;
    changed = true;
    const sectionIndex = clean.sectionIndex ?? book.sectionIndex;
    return {
      ...book,
      cfi: report.cfi,
      fraction: clean.fraction ?? book.fraction,
      sectionIndex,
      sectionFraction:
        clean.sectionIndex !== null ? clean.sectionFraction : sectionIndex === book.sectionIndex ? book.sectionFraction : null,
      lastOpenedAt: now,
    };
  });
  return changed ? { ...library, books } : library;
}

export type PositionReport = {
  cfi: string;
  fraction: number | null;
  sectionIndex?: number | null;
  sectionFraction?: number | null;
};

export function markOpened(library: Library, id: string, now: number): Library {
  return {
    ...library,
    books: library.books.map((book) => (book.id === id ? { ...book, lastOpenedAt: now } : book)),
  };
}

export function setFlow(library: Library, flow: Flow): Library {
  return library.flow === flow ? library : { ...library, flow };
}

/** Recently opened first, then recently added. */
export function sortedBooks(library: Library): LibraryBook[] {
  return [...library.books].sort((a, b) => {
    const opened = (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0);
    if (opened !== 0) return opened;
    return b.addedAt - a.addedAt;
  });
}

export function findBook(library: Library, id: string): LibraryBook | null {
  return library.books.find((book) => book.id === id) ?? null;
}
