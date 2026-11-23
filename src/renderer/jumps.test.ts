import assert from "node:assert/strict";
import { test } from "node:test";

import { createJumps, navEntries, positionOf, restoreTarget } from "../reader-page/jumps.js";

type Loc = { cfi: string; tocItem?: { label: string } };

/** Just enough of foliate's view for the jump logic. */
function fakeView(opts: { cfiIndex?: Record<string, number>; fail?: Set<string> } = {}) {
  const fractions = [0, 0, 0.5, 0.75, 1];
  const view = {
    lastLocation: { cfi: "epubcfi(/6/4!/4/2)", tocItem: { label: "One" } } as Loc | null,
    went: [] as unknown[],
    book: {
      sections: [{}, {}, {}, {}],
      toc: [
        { label: " One ", href: "one.xhtml", subitems: [{ label: "One.a", href: "one.xhtml#a" }] },
        { label: "Two", href: "two.xhtml" },
        { label: "Lost", href: "missing.xhtml" },
      ],
      resolveHref(href: string) {
        if (href.startsWith("one")) return { index: 1 };
        if (href.startsWith("two")) return { index: 2 };
        return null;
      },
    },
    getSectionFractions: () => fractions.map((x) => x + Number.EPSILON),
    resolveNavigation(target: string | { fraction: number }) {
      if (typeof target === "object") return { index: 1, fraction: target.fraction };
      if (opts.fail?.has(target)) return undefined;
      const index = opts.cfiIndex?.[target];
      if (index !== undefined) return { index };
      return target.startsWith("epubcfi(") || target.endsWith(".xhtml") ? { index: 1, target } : undefined;
    },
    historyPushes: 0,
    renderer: {
      async goTo(resolved: { target?: string; fraction?: number }) {
        const target = resolved.target ?? { fraction: resolved.fraction };
        view.went.push(target);
        view.lastLocation = { cfi: `epubcfi(/6/99!/${view.went.length})`, tocItem: { label: String(resolved.target) } };
      },
    },
    async goTo() {
      view.historyPushes++;
    },
  };
  return view;
}

test("a jump pushes where the reader was, and back returns there", async () => {
  const view = fakeView();
  const replies: Record<string, unknown>[] = [];
  const jumps = createJumps(view, (m: Record<string, unknown>) => replies.push(m), "b1");
  assert.equal(await jumps.goToHref("two.xhtml"), true);
  assert.deepEqual(replies.at(-1), { type: "back-stack", id: "b1", depth: 1, label: "One" });
  await jumps.goToFraction(0.9);
  assert.equal(jumps.depth, 2);
  assert.equal(await jumps.back(), true);
  assert.equal(view.went.at(-1), "epubcfi(/6/99!/1)", "back goes to where the second jump started");
  await jumps.back();
  assert.equal(view.went.at(-1), "epubcfi(/6/4!/4/2)");
  assert.equal(view.historyPushes, 0, "jumps leave foliate's history alone");
  assert.equal(await jumps.back(), false);
  assert.deepEqual(replies.at(-1), { type: "back-stack", id: "b1", depth: 0, label: null });
});

test("a failed jump does not push", async () => {
  const view = fakeView({ fail: new Set(["missing.xhtml"]) });
  const jumps = createJumps(view, () => undefined, "b1");
  assert.equal(await jumps.goToHref("missing.xhtml"), false);
  assert.equal(jumps.depth, 0);
});

test("a book link is taken from foliate and becomes a jump", async () => {
  const view = fakeView();
  const jumps = createJumps(view, () => undefined, "b1");
  let prevented = false;
  jumps.onLink({ detail: { href: "two.xhtml" }, preventDefault: () => (prevented = true) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(prevented, true);
  assert.deepEqual(view.went, ["two.xhtml"]);
  assert.equal(jumps.depth, 1);
  jumps.clear();
  assert.equal(jumps.depth, 0);
});

test("the TOC carries each entry's section and start fraction", () => {
  assert.deepEqual(navEntries(fakeView()), [
    { label: "One", href: "one.xhtml", depth: 0, section: 1, fraction: 0 },
    { label: "One.a", href: "one.xhtml#a", depth: 1, section: 1, fraction: 0 },
    { label: "Two", href: "two.xhtml", depth: 0, section: 2, fraction: 0.5 },
    { label: "Lost", href: "missing.xhtml", depth: 0, section: null, fraction: null },
  ]);
});

test("a relocate carries the offset inside its section", () => {
  const position = positionOf(fakeView(), { fraction: 0.625, section: { current: 2 } });
  assert.equal(position.sectionIndex, 2);
  assert.ok(Math.abs((position.sectionFraction ?? -1) - 0.5) < 1e-9);
});

test("restore uses the CFI when it resolves, else the saved section", () => {
  const cfi = "epubcfi(/6/6!/4/2)";
  const saved = { cfi, fraction: 0.6, sectionIndex: 2, sectionFraction: 0.5 };
  assert.deepEqual(restoreTarget(fakeView({ cfiIndex: { [cfi]: 2 } }), saved).target, cfi);
  const fallback = restoreTarget(fakeView({ fail: new Set([cfi]) }), saved);
  assert.equal(fallback.plan.kind, "fraction");
  const target = fallback.target as { fraction: number };
  assert.ok(Math.abs(target.fraction - 0.625) < 1e-9);
  assert.equal(restoreTarget(fakeView(), null).target, null);
});

test("the page start comes from the paginator, not foliate's end-of-page fraction", () => {
  const view = fakeView() as ReturnType<typeof fakeView> & { renderer: Record<string, unknown> };
  // Section 2 spans 0.5 to 0.75. First of 10 text pages: foliate reports the page's END.
  Object.assign(view.renderer, { scrolled: false, page: 1, pages: 12 });
  const first = positionOf(view, { fraction: 0.525, section: { current: 2 } });
  assert.equal(first.sectionFraction, 0);
  assert.equal(first.startFraction, 0.5);
  Object.assign(view.renderer, { page: 6 });
  const mid = positionOf(view, { fraction: 0.65, section: { current: 2 } });
  assert.equal(mid.sectionFraction, 0.5, "foliate counts (page - 1) / (pages - 2)");
  assert.equal(mid.startFraction, 0.625);
  Object.assign(view.renderer, { scrolled: true, start: 300, viewSize: 1200 });
  assert.equal(positionOf(view, { fraction: 0.6, section: { current: 2 } }).sectionFraction, 0.25);
});

test("without paginator pages (fixed layout) the offset falls back to foliate's fraction", () => {
  const position = positionOf(fakeView(), { fraction: 0.625, section: { current: 2 } });
  assert.ok(Math.abs((position.sectionFraction ?? -1) - 0.5) < 1e-9);
});
