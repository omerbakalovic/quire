/**
 * "Back to where you were." Every jump (internal link, TOC entry, slider,
 * chapter button) first pushes the place the reader was. Back pops it.
 * Plain page turns never push. This is separate from foliate's own history,
 * which the note popup's "Back to text" chip keeps using.
 */
export const BACK_LIMIT = 30;

export class BackStack {
  #entries = [];
  #limit;

  constructor(limit = BACK_LIMIT) {
    this.#limit = Math.max(1, limit);
  }

  /** Push where the reader is now. The same place twice in a row is one entry. */
  push(entry) {
    if (!entry || typeof entry.cfi !== "string" || entry.cfi.length === 0) return false;
    const top = this.#entries[this.#entries.length - 1];
    if (top && top.cfi === entry.cfi) return false;
    this.#entries.push({ cfi: entry.cfi, label: typeof entry.label === "string" ? entry.label : null });
    if (this.#entries.length > this.#limit) this.#entries.splice(0, this.#entries.length - this.#limit);
    return true;
  }

  pop() {
    return this.#entries.pop() ?? null;
  }

  peek() {
    return this.#entries[this.#entries.length - 1] ?? null;
  }

  clear() {
    this.#entries = [];
  }

  get depth() {
    return this.#entries.length;
  }

  /** What the host shows: how many levels, and the label of the next one back. */
  summary() {
    const top = this.peek();
    return { depth: this.depth, label: top?.label ?? null };
  }
}
