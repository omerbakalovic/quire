import assert from "node:assert/strict";
import { test } from "node:test";

import { barFrame, barRow, barRows, GROWERS, migrateBars, type ZoneLayout } from "./bars.ts";
import { parseCustomization, resolvedFor } from "./customization.ts";
import { cleanLayer, resolve } from "./layers.ts";
import { defaults, type Resolved } from "./registry.ts";

/** How a row looks: the controls in order, and whether they spread out or one of them takes the free width. */
function lookOfOld(items: readonly string[]) {
  return { items: [...items], mode: items.some((i) => GROWERS.includes(i)) ? "grow" : "spread" };
}
function lookOfNew(zones: ZoneLayout[]) {
  const used = zones.filter((z) => z.items.length > 0);
  assert.equal(used.length, 1, "one zone holds the migrated list");
  const zone = used[0];
  const growing = zone.items.some((i) => GROWERS.includes(i));
  if (growing) assert.equal(zone.grow, true);
  else assert.equal(zone.justify, "space-between");
  return { items: zone.items, mode: growing ? "grow" : "spread" };
}

test("a saved layout from before zones draws the same bars (rule 3.4)", () => {
  const lists = [
    { topBar: ["back", "title"], quickRow: ["prevChapter", "slider", "nextChapter", "percent"], bottomBar: ["contents", "look", "flow"] },
    { topBar: ["back", "contents"], quickRow: ["percent"], bottomBar: ["slider", "look"] },
    { topBar: [], quickRow: ["title", "flow"], bottomBar: ["back"] },
  ];
  for (const old of lists) {
    const layer = cleanLayer("global", { "layout.topBar": old.topBar, "layout.quickRow": old.quickRow, "layout.bottomBar": old.bottomBar, "type.fontSize": 120 });
    assert.equal(layer["type.fontSize"], 120, "other settings are untouched");
    assert.equal("layout.topBar" in layer, false);
    const settings = resolve({ global: layer });
    const rows = barRows(settings);
    for (const [bar, list] of [["top", old.topBar], ["quick", old.quickRow], ["bottom", old.bottomBar]] as const) {
      if (list.length === 0) assert.deepEqual(rows[bar], [], bar);
      else assert.deepEqual(lookOfNew(rows[bar]), lookOfOld(list), bar);
    }
  }
});

test("the defaults draw like the old default bars", () => {
  const rows = barRows(defaults());
  assert.deepEqual(lookOfNew(rows.top), lookOfOld(["back", "title"]));
  assert.deepEqual(lookOfNew(rows.quick), lookOfOld(["prevChapter", "slider", "nextChapter", "percent"]));
  assert.deepEqual(lookOfNew(rows.bottom), lookOfOld(["contents", "look", "flow"]));
});

test("migration runs in every layer, a book's and a profile's too, and survives storage", () => {
  const custom = parseCustomization({
    global: { "layout.bottomBar": ["contents"] },
    profiles: [{ id: "p", name: "P", values: { "layout.topBar": ["title"] } }],
    activeProfile: "p",
    books: { b1: { "layout.quickRow": ["slider"] } },
  });
  assert.deepEqual(custom.global["layout.bottom.center"], ["contents"]);
  assert.deepEqual(custom.profiles[0].values["layout.top.start"], ["title"]);
  assert.deepEqual(custom.books.b1["layout.quick.center"], ["slider"]);
  const settings = resolvedFor(custom, "b1");
  assert.deepEqual(settings["layout.quick.center"], ["slider"]);
  assert.deepEqual(parseCustomization(JSON.parse(JSON.stringify(custom))), custom);
});

test("zones already saved win over an old list in the same layer", () => {
  const out = migrateBars({ "layout.topBar": ["back"], "layout.top.end": ["contents"] });
  assert.equal("layout.topBar" in out, false);
  assert.equal("layout.top.start" in out, false);
  assert.deepEqual(out["layout.top.end"], ["contents"]);
  const raw = { "type.fontSize": 100 };
  assert.equal(migrateBars(raw), raw, "nothing to migrate: the same object");
});

test("zones place start left, centre in the middle and end right; a slider or title takes the free width", () => {
  const settings = { ...defaults(), "layout.top.start": ["back"], "layout.top.center": ["look"], "layout.top.end": ["contents"] } as Resolved;
  assert.deepEqual(barRow(settings, "top"), [
    { zone: "start", items: ["back"], grow: true, justify: "flex-start" },
    { zone: "center", items: ["look"], grow: false, justify: "center" },
    { zone: "end", items: ["contents"], grow: true, justify: "flex-end" },
  ]);
  const withTitle = { ...settings, "layout.top.center": ["title"] } as Resolved;
  assert.deepEqual(barRow(withTitle, "top").map((z) => z.grow), [false, true, false]);
  const spread = { ...settings, "layout.top.arrange": "spread" } as Resolved;
  assert.deepEqual(barRow(spread, "top"), [{ zone: "all", items: ["back", "look", "contents"], grow: true, justify: "space-between" }]);
});

test("a control is drawn once, in the first bar that lists it", () => {
  const settings = { ...defaults(), "layout.top.end": ["contents"] } as Resolved;
  const rows = barRows(settings);
  assert.deepEqual(rows.top.find((z) => z.zone === "end")?.items, ["contents"]);
  assert.deepEqual(rows.bottom[0].items, ["look", "flow"]);
});

test("bar style defaults frame the bars as before; floating and narrow bars stand clear", () => {
  const insets = { top: 24, bottom: 16, left: 0, right: 0 };
  const d = defaults();
  const top = barFrame(d, "top", insets);
  assert.deepEqual([top.edge, top.paddingTop, top.paddingBottom, top.paddingLeft, top.left, top.radius, top.background], [0, 30, 10, 16, "0%", 0, "solid"]);
  const bottom = barFrame(d, "bottom", insets);
  assert.deepEqual([bottom.edge, bottom.paddingTop, bottom.paddingBottom], [0, 4, 24]);
  const styled = { ...d, "bar.bottom.placement": "floating", "bar.bottom.width": 80, "bar.bottom.radius": 16 } as Resolved;
  const floating = barFrame(styled, "bottom", insets);
  assert.deepEqual([floating.edge, floating.paddingBottom, floating.left, floating.right, floating.marginHorizontal, floating.radius], [24, 8, "10%", "10%", 12, 16]);
});
