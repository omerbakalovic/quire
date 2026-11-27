import assert from "node:assert/strict";
import { test } from "node:test";

import { changeSetting, parseCustomization } from "./customization.ts";
import { defaultTarget, editorLayers, isSideways, isTab, MIN_PREVIEW_HEIGHT, MIN_SETTINGS_HEIGHT, originOf, previewHeight, TAB_GROUPS, TABS, targetsFor, validTarget } from "./look-editor.ts";
import { SETTINGS } from "./registry.ts";

const custom = parseCustomization({
  global: { "type.fontSize": 110 },
  profiles: [{ id: "night", name: "Night", values: { "theme.id": "night" } }],
  activeProfile: "night",
  books: { b1: { "page.marginX": 8 } },
});

test("targets: the active profile first, every book, then this book when opened from one", () => {
  assert.deepEqual(targetsFor(custom, "b1"), ["profile", "global", "book"]);
  assert.deepEqual(targetsFor(custom, null), ["profile", "global"]);
  assert.equal(defaultTarget(custom, "b1"), "profile");
  const none = { ...custom, activeProfile: null };
  assert.deepEqual(targetsFor(none, null), ["global"]);
  assert.equal(validTarget(none, "b1", "profile"), "global");
  assert.equal(validTarget(none, "b1", "book"), "book");
});

test("origins say whether a change in the target will show", () => {
  const layers = editorLayers(custom, "b1");
  assert.deepEqual(originOf(layers, "global", "type.fontSize"), { kind: "here", source: "global" });
  assert.deepEqual(originOf(layers, "global", "theme.id"), { kind: "above", source: "profile" });
  assert.deepEqual(originOf(layers, "global", "page.marginX"), { kind: "above", source: "book" });
  assert.deepEqual(originOf(layers, "book", "theme.id"), { kind: "below", source: "profile" });
  assert.deepEqual(originOf(layers, "profile", "type.alignment"), { kind: "below", source: "default" });
  const after = changeSetting(custom, "book", "theme.id", "paper", "b1");
  assert.deepEqual(originOf(editorLayers(after, "b1"), "book", "theme.id"), { kind: "here", source: "book" });
});

test("every setting group belongs to exactly one tab", () => {
  const groups = new Set(SETTINGS.map((s) => s.group));
  const seen = TABS.flatMap((tab) => TAB_GROUPS[tab]);
  for (const group of groups) assert.equal(seen.filter((g) => g === group).length, 1, group);
  assert.equal(isTab("colours"), true);
  assert.equal(isTab("../x"), false);
});

test("the preview keeps its share of the window when there is room", () => {
  assert.equal(previewHeight({ width: 412, height: 915 }, null), 275);
  assert.equal(previewHeight({ width: 412, height: 915 }, 600), 275);
  assert.equal(previewHeight({ width: 915, height: 412 }, 400), 165);
});

test("the preview shrinks so the settings list keeps its least height, and goes when too small", () => {
  assert.equal(previewHeight({ width: 412, height: 915 }, 400), 400 - MIN_SETTINGS_HEIGHT);
  assert.equal(previewHeight({ width: 800, height: 360 }, 200), 0);
  assert.equal(previewHeight({ width: 800, height: 360 }, MIN_SETTINGS_HEIGHT + MIN_PREVIEW_HEIGHT - 1), 0);
});

test("a slider only takes a move that is clearly sideways", () => {
  assert.equal(isSideways(30, 4), true);
  assert.equal(isSideways(-30, 10), true);
  assert.equal(isSideways(5, 0), false);
  assert.equal(isSideways(20, 40), false);
  assert.equal(isSideways(20, 15), false);
});
