/**
 * Reading position: a CFI plus a fallback that does not depend on the DOM.
 *
 * `fraction` is progress through the whole book. foliate computes it from the
 * size of each linear section, so it does not change with font or layout.
 * `sectionIndex` and `sectionFraction` are the fallback the spec asks for when
 * a CFI no longer resolves (a re-imported file, or a CFI from a damaged book).
 */
export type SavedPosition = {
  cfi: string | null;
  fraction: number | null;
  sectionIndex: number | null;
  sectionFraction: number | null;
};

export const NO_POSITION: SavedPosition = { cfi: null, fraction: null, sectionIndex: null, sectionFraction: null };

export type RestorePlan =
  | { kind: "cfi"; cfi: string }
  | { kind: "fraction"; fraction: number; from: "section" | "book" }
  | { kind: "start" };

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Clean a position read from storage or from the page. Never throws. */
export function cleanPosition(raw: Partial<Record<keyof SavedPosition, unknown>> | null | undefined): SavedPosition {
  if (!raw) return { ...NO_POSITION };
  const cfi = typeof raw.cfi === "string" && raw.cfi.startsWith("epubcfi(") ? raw.cfi : null;
  const index = finite(raw.sectionIndex) && raw.sectionIndex >= 0 ? Math.floor(raw.sectionIndex) : null;
  return {
    cfi,
    fraction: finite(raw.fraction) ? clamp01(raw.fraction) : null,
    sectionIndex: index,
    sectionFraction: index !== null && finite(raw.sectionFraction) ? clamp01(raw.sectionFraction) : null,
  };
}

/**
 * Where inside its section a book fraction falls. `sectionFractions` is
 * foliate's list of section start fractions, one longer than the sections.
 * A section with no size (non-linear, or empty) has no inner fraction.
 */
export function sectionFractionOf(fraction: number | null, index: number | null, sectionFractions: number[]): number | null {
  if (!finite(fraction) || !finite(index) || index < 0 || index + 1 >= sectionFractions.length) return null;
  const start = sectionFractions[index];
  const end = sectionFractions[index + 1];
  if (!finite(start) || !finite(end) || end - start <= 1e-9) return null;
  return clamp01((fraction - start) / (end - start));
}

/** The book fraction for a place inside a section. The inverse of `sectionFractionOf`. */
export function bookFractionOf(index: number, sectionFraction: number | null, sectionFractions: number[]): number | null {
  if (!finite(index) || index < 0 || index + 1 >= sectionFractions.length) return null;
  const start = sectionFractions[index];
  const end = sectionFractions[index + 1];
  if (!finite(start) || !finite(end)) return null;
  // Keep a hair inside the section, so foliate's lookup does not land on the next one.
  const inner = Math.min(clamp01(sectionFraction ?? 0), 0.999);
  return clamp01(start + inner * Math.max(0, end - start));
}

/**
 * The order to try when restoring. The CFI wins when it resolves to a real
 * section that agrees with the saved section. Otherwise the saved section and
 * the offset inside it, then the book fraction, then the start of the text.
 *
 * `cfiIndex` is the section index the engine resolved the CFI to, or null when
 * it did not resolve.
 */
export function planRestore(
  position: SavedPosition,
  book: { sectionCount: number; sectionFractions: number[]; cfiIndex: number | null },
): RestorePlan {
  const { sectionCount, sectionFractions, cfiIndex } = book;
  const sectionOk = (index: number | null): index is number => finite(index) && index >= 0 && index < sectionCount;
  if (position.cfi && sectionOk(cfiIndex)) {
    if (position.sectionIndex === null || position.sectionIndex === cfiIndex) return { kind: "cfi", cfi: position.cfi };
  }
  if (sectionOk(position.sectionIndex)) {
    const fraction = bookFractionOf(position.sectionIndex, position.sectionFraction, sectionFractions);
    if (fraction !== null) return { kind: "fraction", fraction, from: "section" };
  }
  if (position.fraction !== null) return { kind: "fraction", fraction: clamp01(position.fraction), from: "book" };
  return { kind: "start" };
}
