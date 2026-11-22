/**
 * Table of contents and progress slider logic. The page sends the flattened
 * TOC with the section each entry resolves to and where that section starts
 * in the book; everything here works on that list and does not touch the DOM.
 */
export type NavEntry = {
  label: string;
  href: string | null;
  depth: number;
  /** Spine index the href resolves to, or null when it does not resolve. */
  section: number | null;
  /** Book fraction where the entry starts, or null when unknown. */
  fraction: number | null;
};

function known(entry: NavEntry): entry is NavEntry & { section: number; fraction: number } {
  return entry.href !== null && entry.section !== null && entry.fraction !== null;
}

/**
 * The entry to highlight. An exact href match with the engine's current TOC
 * item wins. Otherwise the last entry that starts at or before the position.
 */
export function currentEntry(toc: NavEntry[], currentHref: string | null, fraction: number | null): number {
  if (currentHref) {
    const exact = toc.findIndex((entry) => entry.href === currentHref);
    if (exact >= 0) return exact;
  }
  if (fraction === null || !Number.isFinite(fraction)) return -1;
  let best = -1;
  let bestStart = -Infinity;
  for (const [index, entry] of toc.entries()) {
    if (!known(entry)) continue;
    // Later entries with the same start are deeper or later in reading order; prefer them.
    if (entry.fraction <= fraction + 1e-9 && entry.fraction >= bestStart) {
      best = index;
      bestStart = entry.fraction;
    }
  }
  return best;
}

/** The label shown while scrubbing: the chapter the target fraction falls in. */
export function chapterAt(toc: NavEntry[], fraction: number): string | null {
  const index = currentEntry(toc, null, fraction);
  return index >= 0 ? toc[index].label || null : null;
}

/**
 * Tick marks for the slider: where each chapter at or above `maxDepth` starts.
 * Sorted, without duplicates, without 0 (the slider's own start), and capped so
 * a book with hundreds of entries does not draw a solid bar.
 */
export function chapterTicks(toc: NavEntry[], maxDepth = 0, limit = 120): number[] {
  const out = new Set<number>();
  for (const entry of toc) {
    if (!known(entry) || entry.depth > maxDepth) continue;
    const at = Math.round(entry.fraction * 10000) / 10000;
    if (at > 0 && at < 1) out.add(at);
  }
  const sorted = [...out].sort((a, b) => a - b);
  if (sorted.length <= limit) return sorted;
  const step = sorted.length / limit;
  return Array.from({ length: limit }, (_, i) => sorted[Math.floor(i * step)]);
}

/**
 * Previous or next chapter from the current entry. "Next" is the first later
 * entry that starts after the current one. "Previous" is the start of the
 * current chapter when the reader is inside it, else the entry before.
 */
export function adjacentChapter(
  toc: NavEntry[],
  current: number,
  dir: "prev" | "next",
  fraction: number | null,
): number {
  if (toc.length === 0) return -1;
  const here = current >= 0 && current < toc.length ? toc[current] : null;
  if (dir === "next") {
    const from = here?.fraction ?? fraction ?? -1;
    for (let i = Math.max(0, current + 1); i < toc.length; i++) {
      const entry = toc[i];
      if (known(entry) && entry.fraction > from + 1e-9) return i;
    }
    return -1;
  }
  // Well past the start of the current chapter: go back to its start first.
  if (here && known(here) && fraction !== null && fraction - here.fraction > 0.002) return current;
  for (let i = Math.min(current, toc.length) - 1; i >= 0; i--) {
    const entry = toc[i];
    if (known(entry) && (!here || here.fraction === null || entry.fraction < here.fraction - 1e-9)) return i;
  }
  return -1;
}

/** Clean the TOC the page sent. Never throws; caps size and depth. */
export function parseNavEntries(value: unknown): NavEntry[] {
  if (!Array.isArray(value)) return [];
  const out: NavEntry[] = [];
  for (const item of value.slice(0, 2000)) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const section = num(raw.section);
    const fraction = num(raw.fraction);
    out.push({
      label: typeof raw.label === "string" ? raw.label.slice(0, 500) : "",
      href: typeof raw.href === "string" && raw.href.length > 0 ? raw.href : null,
      depth: Math.max(0, Math.min(10, Math.floor(num(raw.depth) ?? 0))),
      section: section !== null && section >= 0 ? Math.floor(section) : null,
      fraction: fraction === null ? null : Math.min(1, Math.max(0, fraction)),
    });
  }
  return out;
}
