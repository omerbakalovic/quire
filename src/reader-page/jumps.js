import { bookFractionOf, planRestore, sectionFractionOf } from "../domain/position.ts";
import { BackStack } from "./back-stack.js";

/**
 * Jumps and the back stack for one open book. A jump is anything that is not
 * a page turn: an internal link, a TOC entry, the slider, a chapter button.
 * Each jump pushes where the reader was, so "Back to where you were" returns.
 */
export function createJumps(view, reply, id) {
  const stack = new BackStack();
  const here = () => {
    const location = view.lastLocation;
    return location?.cfi ? { cfi: location.cfi, label: location.tocItem?.label ?? null } : null;
  };
  const announce = () => reply({ type: "back-stack", id, ...stack.summary() });

  /**
   * Move without touching foliate's history. That history is left to the note
   * popup's "Go to note" and the Android back after it, so the two stacks never
   * replay each other's entries.
   */
  async function move(target) {
    const resolved = view.resolveNavigation(target);
    if (!resolved) return false;
    await view.renderer.goTo(resolved);
    return true;
  }

  async function jump(go) {
    const from = here();
    const ok = await go();
    if (ok === false || ok === undefined || ok === null) return false;
    if (from && view.lastLocation?.cfi !== from.cfi && stack.push(from)) announce();
    return true;
  }

  return {
    /** foliate's cancelable `link` event, for internal links in the book. */
    onLink(event) {
      const href = event.detail?.href;
      if (!href) return;
      event.preventDefault();
      void jump(() => move(href)).catch((error) => console.error("link failed", error));
    },
    goToHref(href) {
      return jump(() => move(href));
    },
    goToFraction(fraction) {
      return jump(() => move({ fraction: Math.min(1, Math.max(0, fraction)) }));
    },
    async back() {
      const entry = stack.pop();
      announce();
      if (!entry) return false;
      return move(entry.cfi);
    },
    clear() {
      stack.clear();
      announce();
    },
    get depth() {
      return stack.depth;
    },
  };
}

/** foliate's section start fractions without the epsilon it adds to each. */
export function sectionFractions(view) {
  return (view.getSectionFractions?.() ?? []).map((value) => Math.max(0, value - Number.EPSILON));
}

/** The flattened TOC, with the section each entry resolves to and where it starts. */
export function navEntries(view) {
  const fractions = sectionFractions(view);
  const out = [];
  const walk = (items, depth) => {
    for (const item of items ?? []) {
      if (out.length >= 2000) return;
      const href = item.href ?? null;
      let section = null;
      try {
        const resolved = href ? view.book.resolveHref(href) : null;
        section = typeof resolved?.index === "number" && resolved.index >= 0 ? resolved.index : null;
      } catch {
        section = null;
      }
      const fraction = section !== null && typeof fractions[section] === "number" ? fractions[section] : null;
      out.push({ label: String(item.label ?? "").trim(), href, depth, section, fraction });
      walk(item.subitems, depth + 1);
    }
  };
  walk(view.book?.toc, 0);
  return out;
}

/**
 * Where the visible page starts inside its section, from the paginator itself.
 * foliate's relocate `fraction` is the END of the visible page (it adds the
 * page's own size), so at a chapter start it already reads one page in.
 * Null for the fixed-layout renderer, which has no pages to count.
 */
export function sectionStartOf(renderer) {
  if (!renderer) return null;
  try {
    if (renderer.scrolled) {
      const size = renderer.viewSize;
      return size > 0 ? Math.min(1, Math.max(0, renderer.start / size)) : null;
    }
    const { page, pages } = renderer;
    if (typeof page !== "number" || typeof pages !== "number" || pages <= 2) return null;
    return pages - 2 <= 1 ? 0 : Math.min(1, Math.max(0, (page - 1) / (pages - 2)));
  } catch {
    return null;
  }
}

/**
 * The position parts of a relocate: foliate's book fraction (end of the page,
 * shown as the percentage), the section, the offset where the page starts
 * inside it, and the book fraction of that start (used for chapter logic).
 */
export function positionOf(view, detail) {
  const fraction = typeof detail.fraction === "number" ? detail.fraction : null;
  const sectionIndex = typeof detail.section?.current === "number" ? detail.section.current : null;
  const fractions = sectionFractions(view);
  const start = sectionStartOf(view.renderer);
  const sectionFraction = start ?? sectionFractionOf(fraction, sectionIndex, fractions);
  const startFraction =
    sectionIndex !== null && sectionFraction !== null ? bookFractionOf(sectionIndex, sectionFraction, fractions) : fraction;
  return { fraction, sectionIndex, sectionFraction, startFraction };
}

/**
 * Where to open a book: the saved CFI when it still resolves to the saved
 * section, else the section and offset, else the book fraction, else the
 * start of the text. Returns the engine target (or null) and the plan kind.
 */
export function restoreTarget(view, position) {
  const sectionCount = view.book?.sections?.length ?? 0;
  let cfiIndex = null;
  if (position?.cfi) {
    try {
      const resolved = view.resolveNavigation(position.cfi);
      cfiIndex = typeof resolved?.index === "number" ? resolved.index : null;
    } catch {
      cfiIndex = null;
    }
  }
  const plan = planRestore(
    {
      cfi: position?.cfi ?? null,
      fraction: position?.fraction ?? null,
      sectionIndex: position?.sectionIndex ?? null,
      sectionFraction: position?.sectionFraction ?? null,
    },
    { sectionCount, sectionFractions: sectionFractions(view), cfiIndex },
  );
  if (plan.kind === "cfi") return { target: plan.cfi, plan };
  if (plan.kind === "fraction") return { target: { fraction: plan.fraction }, plan };
  return { target: null, plan };
}
