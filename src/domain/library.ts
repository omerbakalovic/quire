/**
 * The M1b library index. One JSON document, written whole by the native store.
 * SQLite replaces it in Milestone 2, when saved positions get their own table.
 * Parsing never throws: a damaged index keeps the rows it can read.
 */
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
  /** Last reported location. Restore is hardened in Milestone 2. */
  cfi: string | null;
  fraction: number | null;
};

export type Library = {
  version: 1;
  flow: Flow;
  books: LibraryBook[];
};

const BOOK_ID = /^[A-Za-z0-9_-]{1,80}$/;

export function emptyLibrary(): Library {
  return { version: 1, flow: "paginated", books: [] };
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
  const fraction = num(raw.fraction);
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
    fraction: fraction === null ? null : Math.min(1, Math.max(0, fraction)),
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
  const raw = value as { flow?: unknown; books?: unknown };
  const books: LibraryBook[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw.books) ? raw.books : []) {
    const book = parseBook(item);
    if (!book || seen.has(book.id)) continue;
    seen.add(book.id);
    books.push(book);
  }
  return { version: 1, flow: raw.flow === "scrolled" ? "scrolled" : "paginated", books };
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
  };
  const books = existing
    ? library.books.map((book) => (book.id === facts.id ? next : book))
    : [...library.books, next];
  return { ...library, books };
}

export function removeBook(library: Library, id: string): Library {
  return { ...library, books: library.books.filter((book) => book.id !== id) };
}

export function recordPosition(
  library: Library,
  id: string,
  cfi: string,
  fraction: number | null,
  now: number,
): Library {
  let changed = false;
  const books = library.books.map((book) => {
    if (book.id !== id) return book;
    changed = true;
    const clean = fraction === null || !Number.isFinite(fraction) ? book.fraction : Math.min(1, Math.max(0, fraction));
    return { ...book, cfi, fraction: clean, lastOpenedAt: now };
  });
  return changed ? { ...library, books } : library;
}

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
