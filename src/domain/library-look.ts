/**
 * How the library shelf looks. Kept apart from the book rows so the wider
 * customization work can grow it (or replace it) without touching reading data.
 * Parsing never throws: unknown or damaged values fall back to the defaults.
 */
import type { LibraryBook } from "./library.ts";

/** "minimal": plain text rows, nothing else. "pills": rounded, coloured cards. */
export type LibraryStyle = "minimal" | "pills";

export type LibraryLook = {
  style: LibraryStyle;
  showCovers: boolean;
  showAuthor: boolean;
  showProgress: boolean;
  /** Colours the reader picked, by book id. Win over the cover colour. */
  bookColors: Record<string, string>;
  /** The average colour of each book's cover, measured once at import. */
  coverColors: Record<string, string>;
  /** The file each book was imported from, to tell editions with the same title apart. */
  fileNames: Record<string, string>;
};

export const DEFAULT_LOOK: LibraryLook = {
  style: "minimal",
  showCovers: false,
  showAuthor: true,
  showProgress: true,
  bookColors: {},
  coverColors: {},
  fileNames: {},
};

/** Swatches offered for a pill. Muted, so dark or light text stays readable on each. */
export const PALETTE = [
  "#E8E2D6",
  "#D9C3A5",
  "#C98B6B",
  "#B5545C",
  "#8C5E8F",
  "#5B6C8F",
  "#4F7CAC",
  "#5B8F88",
  "#6C8F5B",
  "#A3A86B",
  "#3A3A3A",
  "#1F3A5F",
];

/** Pills with no cover and no chosen colour. */
export const NEUTRAL_PILL = "#E4E4E7";

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function isColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function map(value: unknown, keep: (entry: unknown) => entry is string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== "object") return out;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (keep(entry)) out[key] = entry;
  }
  return out;
}

const isName = (entry: unknown): entry is string => typeof entry === "string" && entry.length > 0 && entry.length <= 255;

export function parseLook(value: unknown): LibraryLook {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    style: raw.style === "pills" ? "pills" : DEFAULT_LOOK.style,
    showCovers: bool(raw.showCovers, DEFAULT_LOOK.showCovers),
    showAuthor: bool(raw.showAuthor, DEFAULT_LOOK.showAuthor),
    showProgress: bool(raw.showProgress, DEFAULT_LOOK.showProgress),
    bookColors: map(raw.bookColors, isColor),
    coverColors: map(raw.coverColors, isColor),
    fileNames: map(raw.fileNames, isName),
  };
}

export type LookOptions = Pick<LibraryLook, "style" | "showCovers" | "showAuthor" | "showProgress">;

export function updateLook(look: LibraryLook, patch: Partial<LookOptions>): LibraryLook {
  return parseLook({ ...look, ...patch });
}

function setEntry(entries: Record<string, string>, id: string, value: string | null): Record<string, string> {
  const next = { ...entries };
  if (value === null) delete next[id];
  else next[id] = value;
  return next;
}

/** null goes back to the cover colour. */
export function setBookColor(look: LibraryLook, id: string, color: string | null): LibraryLook {
  if (color !== null && !isColor(color)) return look;
  return { ...look, bookColors: setEntry(look.bookColors, id, color) };
}

export function setCoverColor(look: LibraryLook, id: string, color: string | null): LibraryLook {
  if (color !== null && !isColor(color)) return look;
  return { ...look, coverColors: setEntry(look.coverColors, id, color) };
}

export function setFileName(look: LibraryLook, id: string, name: string | null): LibraryLook {
  if (name !== null && !isName(name)) return look;
  return { ...look, fileNames: setEntry(look.fileNames, id, name) };
}

export function forgetBook(look: LibraryLook, id: string): LibraryLook {
  return {
    ...look,
    bookColors: setEntry(look.bookColors, id, null),
    coverColors: setEntry(look.coverColors, id, null),
    fileNames: setEntry(look.fileNames, id, null),
  };
}

/** The pill's background: the reader's pick, else the cover's average, else neutral. */
export function pillColor(look: LibraryLook, id: string): string {
  return look.bookColors[id] ?? look.coverColors[id] ?? NEUTRAL_PILL;
}

/** Black or white text, whichever reads better on the background (WCAG relative luminance). */
export function textOn(background: string): "#000000" | "#FFFFFF" {
  if (!isColor(background)) return "#000000";
  const channel = (offset: number) => {
    const c = parseInt(background.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  // Contrast with white beats contrast with black below about 0.179.
  return luminance > 0.179 ? "#000000" : "#FFFFFF";
}

/**
 * A short label for books that share a title and authors with another book,
 * such as two editions of the same novel. Uses the imported file name when it
 * differs, else the publisher, else "Copy N" in the order they were added.
 */
export function editionLabels(books: LibraryBook[], look: LibraryLook): Map<string, string> {
  const groups = new Map<string, LibraryBook[]>();
  for (const book of books) {
    const key = `${book.title.trim().toLowerCase()}\u0000${book.authors.join(",").toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), book]);
  }
  const labels = new Map<string, string>();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => a.addedAt - b.addedAt);
    const distinct = (pick: (book: LibraryBook) => string | null) => {
      const values = ordered.map(pick);
      return values.every((value) => value) && new Set(values).size === values.length ? (values as string[]) : null;
    };
    const names = distinct((book) => look.fileNames[book.id]?.replace(/\.epub$/i, "") ?? null);
    const publishers = names ? null : distinct((book) => book.publisher);
    ordered.forEach((book, index) => {
      labels.set(book.id, names?.[index] ?? publishers?.[index] ?? `Copy ${index + 1}`);
    });
  }
  return labels;
}
