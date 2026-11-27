import assert from "node:assert/strict";
import { test } from "node:test";

import { FAINT_ATTR as PAGE_FAINT_ATTR, contrastRatio, markFaintColors, parseCssColor } from "../reader-page/book-colors.js";
import { hexToHsv, hslToRgb, hsvToHex, normalizeHex, parseHex, rgbToHsl, toHex } from "./colour.ts";
import {
  appThemeId,
  changeSetting,
  emptyCustomization,
  parseCustomization,
  removeTheme,
  renameTheme,
  resolvedFor,
  restoreTheme,
  revertTo,
  saveProfile,
  saveTheme,
} from "./customization.ts";
import { sectionsFor } from "./customize.ts";
import { defaults, cleanValue } from "./registry.ts";
import { FAINT_ATTR, readingCss } from "./reading-css.ts";
import { contrastFlags, THEMES, themeFor, userThemeTokens } from "./themes.ts";
import { copyName, newThemeId, parseUserThemes, type UserTheme } from "./user-themes.ts";

const sepia: UserTheme = { id: "theme-abcd1234", name: "Sepia", base: "paper", tokens: { link: "#aa3300" } };

test("hex survives a trip through HSV for 10 000 random colours", () => {
  let seed = 7;
  const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 10000; i++) {
    const hex = `#${Math.floor(random() * 0xffffff).toString(16).padStart(6, "0")}`;
    const hsv = hexToHsv(hex)!;
    assert.equal(hsvToHex(hsv, hsv.a), hex);
    // Twice over: no drift from repeated reads and writes.
    const again = hexToHsv(hsvToHex(hsv))!;
    assert.equal(hsvToHex(again), hex);
    assert.equal(toHex({ ...hslToRgb(rgbToHsl(parseHex(hex)!)), a: 1 }), hex);
  }
});

test("hex parsing takes the three spellings and writes one", () => {
  assert.deepEqual(parseHex("#fa0"), { r: 255, g: 170, b: 0, a: 1 });
  assert.equal(normalizeHex("#FA0"), "#ffaa00");
  assert.equal(normalizeHex("#ffaa0080"), "#ffaa0080");
  assert.equal(normalizeHex("#ffaa00ff"), "#ffaa00");
  assert.equal(normalizeHex("ffaa00"), null);
  assert.equal(normalizeHex("#ffaa0"), null);
  assert.equal(normalizeHex(12), null);
  assert.equal(hsvToHex({ h: 0, s: 1, v: 1 }), "#ff0000");
  assert.equal(hsvToHex({ h: 120, s: 1, v: 1 }), "#00ff00");
  assert.equal(hsvToHex({ h: 360, s: 1, v: 1 }), "#ff0000");
  assert.equal(hsvToHex({ h: 0, s: 0, v: 1 }, 0.5), "#ffffff80");
});

test("user themes parse safely: bad ids, bases, tokens and colours are dropped", () => {
  const themes = parseUserThemes([
    { id: "theme-abcd1234", name: " Sepia ", base: "paper", tokens: { link: "#A30", ink: "red", nonsense: "#000000", dark: true, heading: "#11223344" } },
    { id: "theme-abcd1234", name: "Again", base: "light", tokens: {} },
    { id: "bad id", name: "X", base: "light" },
    { id: "theme-zzzz9999", name: "", base: "neon" },
    { id: "theme-yyyy8888", base: "night" },
    null,
  ]);
  assert.deepEqual(themes, [
    { id: "theme-abcd1234", name: "Sepia", base: "paper", tokens: { link: "#aa3300", dark: true, heading: "#11223344" } },
    { id: "theme-yyyy8888", name: "Theme", base: "night", tokens: {} },
  ]);
  assert.deepEqual(parseUserThemes("nope"), []);
  assert.equal(parseUserThemes(Array.from({ length: 80 }, (_, i) => ({ id: `theme-${String(i).padStart(4, "0")}`, name: "t", base: "light" }))).length, 50);
});

test("a user theme follows its base except for what it changes", () => {
  const tokens = themeFor(sepia.id, [sepia]);
  assert.equal(tokens.link, "#aa3300");
  assert.equal(tokens.page, THEMES.paper.page);
  // Derived tokens follow the changed colour.
  assert.equal(tokens.linkVisited, "#aa3300");
  assert.equal(tokens.dark, false);
  // A theme copied from High contrast keeps that theme's own extra tokens.
  assert.equal(userThemeTokens({ base: "contrast", tokens: {} }).pillDefault, "#000000");
  assert.deepEqual(userThemeTokens({ base: "night", tokens: {} }), THEMES.night);
  // A deleted or unknown theme draws as Light; built-ins are never shadowed.
  assert.deepEqual(themeFor("theme-gone1234", [sepia]), THEMES.light);
  assert.deepEqual(themeFor("night", [{ ...sepia, id: "night" }]), THEMES.night);
});

test("theme settings take built-ins and user theme ids; app.theme also takes follow", () => {
  assert.equal(cleanValue("theme.id", "night"), "night");
  assert.equal(cleanValue("theme.id", sepia.id), sepia.id);
  assert.equal(cleanValue("theme.id", "follow"), null);
  assert.equal(cleanValue("theme.id", "neon"), null);
  assert.equal(cleanValue("app.theme", "follow"), "follow");
  assert.equal(cleanValue("app.theme", sepia.id), sepia.id);
  assert.equal(cleanValue("theme.bookColors", "keep"), "keep");
  assert.equal(cleanValue("theme.bookColors", "sometimes"), null);
  const row = sectionsFor({}, "global", [], [sepia]).flatMap((s) => s.rows).find((r) => r.key === "app.theme");
  assert.ok(row && row.kind === "choice" && row.options[0] === "follow" && row.options.includes(sepia.id));
});

test("themes save, rename and survive a round trip through storage", () => {
  let custom = saveTheme(emptyCustomization(), { ...sepia, tokens: { ...sepia.tokens, ink: "#ABC" } });
  assert.deepEqual(custom.themes[0].tokens, { link: "#aa3300", ink: "#aabbcc" });
  custom = renameTheme(custom, sepia.id, "  Old paper ");
  assert.equal(custom.themes[0].name, "Old paper");
  assert.equal(renameTheme(custom, sepia.id, "  "), custom);
  custom = saveTheme(custom, { ...custom.themes[0], tokens: {} });
  assert.equal(custom.themes.length, 1);
  assert.equal(saveTheme(custom, { ...sepia, id: "bad" }), custom);
  assert.equal(saveTheme(custom, { ...sepia, id: "theme-other123", base: "neon" as "light" }), custom);
  assert.deepEqual(parseCustomization(JSON.parse(JSON.stringify(custom))), custom);
});

test("deleting a theme puts every layer that used it on its base (rule 3.5), and Undo brings the theme back", () => {
  let custom = saveTheme(emptyCustomization(), sepia);
  // The book first: a book value equal to the one below it is not kept.
  custom = changeSetting(custom, "book", "theme.id", sepia.id, "b1");
  custom = changeSetting(custom, "global", "theme.id", sepia.id, null);
  custom = changeSetting(custom, "global", "app.theme", sepia.id, null);
  custom = saveProfile(custom, "p", "P", { "theme.id": sepia.id });
  assert.equal(appThemeId(custom), sepia.id);
  const removed = removeTheme(custom, sepia.id);
  assert.equal(removed.themes.length, 0);
  assert.equal(removed.global["theme.id"], "paper");
  assert.equal(removed.global["app.theme"], "paper");
  assert.equal(removed.books.b1["theme.id"], "paper");
  assert.equal(removed.profiles[0].values["theme.id"], "paper");
  assert.equal(removeTheme(removed, sepia.id), removed);
  const back = restoreTheme(removed, sepia, 0);
  assert.deepEqual(back.themes, [sepia]);
});

test("Revert keeps today's themes, and a chosen theme deleted since goes to its base", () => {
  let snapshot = saveTheme(emptyCustomization(), sepia);
  snapshot = changeSetting(snapshot, "global", "theme.id", sepia.id, null);
  const now = removeTheme(snapshot, sepia.id);
  const reverted = revertTo(now, snapshot);
  assert.deepEqual(reverted.themes, []);
  assert.equal(reverted.global["theme.id"], "paper");
  const kept = revertTo(snapshot, snapshot);
  assert.equal(kept.global["theme.id"], sepia.id);
  assert.equal(resolvedFor(kept, null)["theme.id"], sepia.id);
});

test("new theme ids are fresh, and copies get a free name", () => {
  const values = [0.1, 0.1, 0.2];
  const id = newThemeId([{ ...sepia, id: newThemeId([], () => 0.1) }], () => values.shift()!);
  assert.match(id, /^theme-[a-z0-9]{8}$/);
  assert.notEqual(id, newThemeId([], () => 0.1));
  assert.equal(copyName("Night", []), "Night (copy)");
  assert.equal(copyName("Night", ["Night (copy)"]), "Night (copy 2)");
  assert.equal(copyName("Night (copy)", ["Night (copy)", "Night (copy 2)"]), "Night (copy 3)");
  assert.equal(copyName("Nuit", [], "copie"), "Nuit (copie)");
});

test("contrast flags name each faint pair and never fire on the built-ins' text", () => {
  for (const [id, tokens] of Object.entries(THEMES)) assert.deepEqual(contrastFlags(tokens), [], id);
  const flags = contrastFlags({ ...THEMES.light, link: "#cccccc", sheetInk: "#eeeeee" });
  assert.deepEqual(flags.map((f) => `${f.fg}/${f.bg}`), ["link/page", "sheetInk/sheet"]);
  assert.ok(flags.every((f) => f.ratio < f.minimum));
});

test("book colours: auto is today's rule, keep never replaces, replace always does", () => {
  const css = (theme: keyof typeof THEMES, mode: "auto" | "keep" | "replace", publisher = true) =>
    readingCss({ ...defaults(), "theme.bookColors": mode, "type.publisherStyles": publisher }, THEMES[theme]);
  const replaces = (text: string) => text.includes("background-color: transparent !important");
  assert.equal(replaces(css("light", "auto")), false);
  assert.equal(replaces(css("night", "auto")), true);
  assert.equal(replaces(css("light", "auto", false)), true);
  assert.equal(replaces(css("night", "keep")), false);
  assert.equal(replaces(css("light", "keep", false)), false);
  assert.equal(replaces(css("light", "replace")), true);
  assert.ok(css("night", "keep").includes(`[${FAINT_ATTR}]`));
  assert.ok(!css("night", "auto").includes(FAINT_ATTR));
  // The page background and text colour are Quire's in every mode.
  for (const mode of ["auto", "keep", "replace"] as const) assert.ok(css("night", mode).includes(`html, body { background: ${THEMES.night.page} !important; color: ${THEMES.night.ink} !important; }`));
  assert.equal(FAINT_ATTR, PAGE_FAINT_ATTR);
});

test("a user theme's own heading colour reaches the page; the built-ins' CSS has no heading rule", () => {
  assert.ok(!readingCss(defaults(), THEMES.light).includes("h1, h2"));
  const custom = themeFor(sepia.id, [{ ...sepia, tokens: { heading: "#884400" } }]);
  assert.ok(readingCss(defaults(), custom).includes("h1, h2, h3, h4, h5, h6 { color: #884400; }"));
});

test("the page reads computed colours and measures contrast as the theme does", () => {
  assert.deepEqual(parseCssColor("rgb(10, 20, 30)"), { r: 10, g: 20, b: 30, a: 1 });
  assert.deepEqual(parseCssColor("rgba(10, 20, 30, 0.5)"), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseCssColor("rgb(10 20 30 / 50%)"), { r: 10, g: 20, b: 30, a: 0.5 });
  assert.deepEqual(parseCssColor("transparent"), { r: 0, g: 0, b: 0, a: 0 });
  assert.equal(parseCssColor("red"), null);
  assert.equal(Math.round(contrastRatio({ r: 0, g: 0, b: 0, a: 1 }, { r: 255, g: 255, b: 255, a: 1 })), 21);
});

/** A tiny stand-in document: just what markFaintColors reads. */
function fakeDoc(items: { color: string; background?: string; text?: boolean; parent?: number }[]) {
  type El = { localName: string; nodeType: 1; childNodes: { nodeType: number; nodeValue: string }[]; parentElement: El | null; attrs: Set<string>; style: { color: string; backgroundColor: string }; setAttribute(n: string): void; removeAttribute(n: string): void };
  const make = (color: string, background = "rgba(0, 0, 0, 0)", text = true, parent: El | null = null, name = "p"): El => ({
    localName: name,
    nodeType: 1,
    childNodes: text ? [{ nodeType: 3, nodeValue: "words" }] : [],
    parentElement: parent,
    attrs: new Set(),
    style: { color, backgroundColor: background },
    setAttribute(n) {
      this.attrs.add(n);
    },
    removeAttribute(n) {
      this.attrs.delete(n);
    },
  });
  const body = make("rgb(222, 220, 214)", "rgb(0, 0, 0)", false, null, "body");
  const els: El[] = [];
  for (const item of items) els.push(make(item.color, item.background, item.text ?? true, item.parent === undefined ? body : els[item.parent]));
  return {
    els,
    doc: {
      body: { getElementsByTagName: () => els },
      defaultView: { getComputedStyle: (el: El) => el.style },
      querySelectorAll: () => els.filter((e) => e.attrs.has(PAGE_FAINT_ATTR)),
    },
  };
}

test("keep: only text too faint on what is behind it is marked, and marks are redone from scratch", () => {
  const { els, doc } = fakeDoc([
    { color: "rgb(0, 0, 0)" }, // black on the Night page: faint
    { color: "rgb(200, 30, 30)" }, // red: readable on the page
    { color: "rgb(0, 0, 0)", background: "rgb(255, 250, 220)" }, // black on its own light callout: fine
    { color: "rgb(0, 0, 0)", parent: 2 }, // inside the callout: fine
    { color: "rgba(0, 0, 0, 0)" }, // invisible text: faint
  ]);
  assert.equal(markFaintColors(doc, "#0b0906", true), 2);
  assert.deepEqual(els.map((e) => e.attrs.has(PAGE_FAINT_ATTR)), [true, false, false, false, true]);
  assert.equal(markFaintColors(doc, "#0b0906", false), 0);
  assert.deepEqual(els.map((e) => e.attrs.size), [0, 0, 0, 0, 0]);
});
