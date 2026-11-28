import assert from "node:assert/strict";
import { test } from "node:test";

import { formatNumber, sectionsFor, stepValue } from "./customize.ts";
import { SETTINGS } from "./registry.ts";

const words = { system: "System", off: "Off", bookDefault: "Book's" };

test("steps honour 'not set' values in both directions", () => {
  assert.equal(stepValue("type.lineHeight", 0, 1), 1.2);
  assert.equal(stepValue("type.lineHeight", 0, -1), 0);
  assert.equal(stepValue("type.lineHeight", 1, -1), 0);
  assert.equal(stepValue("type.lineHeight", 1.2, 1), 1.25);
  assert.equal(stepValue("type.paragraphSpacing", -1, 1), 0);
  assert.equal(stepValue("type.paragraphSpacing", 0, -1), -1);
  assert.equal(stepValue("light.brightness", 0, 1), 0.5);
  assert.equal(stepValue("light.brightness", 0.05, -1), 0);
  assert.equal(stepValue("type.fontSize", 300, 1), 300);
  assert.equal(stepValue("type.fontSize", 100, -1), 99, "text size moves in 1 % steps");
  assert.equal(stepValue("theme.id", 1, 1), null);
});

test("the global screen lists every honoured setting once, grouped in order", () => {
  const sections = sectionsFor({}, "global");
  const keys = sections.flatMap((s) => s.rows.map((r) => r.key));
  assert.deepEqual([...keys].sort(), SETTINGS.map((s) => s.key).sort());
  assert.deepEqual(sections.map((s) => s.group), ["typography", "page", "theme", "light", "layout", "barStyle", "gestures", "turns", "library"]);
});

test("a profile screen leaves out global-only settings, and marks what the layer sets", () => {
  const sections = sectionsFor({ global: { "type.fontSize": 120 }, profile: { "theme.id": "night" } }, "profile");
  const rows = sections.flatMap((s) => s.rows);
  assert.equal(rows.some((r) => r.key === "type.fontSize"), true);
  const size = rows.find((r) => r.key === "type.fontSize")!;
  assert.deepEqual([size.value, size.set, size.source], [120, false, "global"]);
  const theme = rows.find((r) => r.key === "theme.id")!;
  assert.deepEqual([theme.value, theme.set, theme.source], ["night", true, "profile"]);
});

test("the font row offers imported fonts after the built-ins", () => {
  const user = { id: "user-ab12cd34", label: "Bookerly", file: "user-ab12cd34.ttf" };
  const font = sectionsFor({}, "global", [user]).flatMap((s) => s.rows).find((r) => r.key === "type.fontFamily")!;
  assert.equal(font.kind, "choice");
  assert.equal(font.kind === "choice" && font.options.at(-1), user.id);
  assert.equal(font.kind === "choice" && font.options[0], "publisher");
});

test("numbers read as people expect", () => {
  assert.equal(formatNumber("type.fontSize", 120, words), "120%");
  assert.equal(formatNumber("type.lineHeight", 0, words), "Book's");
  assert.equal(formatNumber("type.lineHeight", 1.5, words), "1.50");
  assert.equal(formatNumber("type.paragraphSpacing", -1, words), "Book's");
  assert.equal(formatNumber("type.paragraphSpacing", 0.5, words), "0.5 em");
  assert.equal(formatNumber("page.maxWidth", 720, words), "720 px");
  assert.equal(formatNumber("light.brightness", 0, words), "System");
  assert.equal(formatNumber("light.dimmer", 0.25, words), "25%");
  assert.equal(formatNumber("light.warmth", 0, words), "Off");
});

test("gestures are a group on the Reading look screen, and the map follows the settings", async () => {
  const { gestureMap, barsUnreachable } = await import("./gestures.ts");
  const { defaults } = await import("./registry.ts");
  const base = defaults();
  assert.deepEqual(gestureMap(base), { tapLeft: "prevPage", tapCenter: "bars", tapRight: "nextPage", swipeUp: "none", swipeDown: "none", twoFingerTap: "none" });
  assert.equal(barsUnreachable(base), false);
  assert.equal(barsUnreachable({ ...base, "gesture.tapCenter": "contents" }), true);
  assert.equal(barsUnreachable({ ...base, "gesture.tapCenter": "contents", "gesture.swipeUp": "bars" }), false);
  const section = sectionsFor({}, "global").find((s) => s.group === "gestures");
  assert.equal(section?.rows.length, 6);
  assert.equal(sectionsFor({}, "book").some((s) => s.group === "gestures"), false);
});
