import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";

import { addUserFont, emptyCustomization, parseCustomization, removeUserFont, resolvedFor } from "./customization.ts";
import { BUNDLED_FONTS } from "./font-catalog.ts";
import {
  FONT_CHOICES,
  fontExtension,
  fontFaces,
  fontLabel,
  fontStack,
  isFontId,
  newUserFontId,
  parseUserFonts,
  userFontLabel,
} from "./fonts.ts";
import { readingCss } from "./reading-css.ts";
import { cleanValue, defaults } from "./registry.ts";
import { THEMES } from "./themes.ts";

const user = { id: "user-ab12cd34", label: "Bookerly", file: "user-ab12cd34.ttf" };

test("every bundled face has its file and every font its licence", () => {
  for (const font of BUNDLED_FONTS) {
    assert.ok(existsSync(new URL(`../../assets/fonts/${font.id}.LICENSE.txt`, import.meta.url)), font.id);
    assert.ok(font.faces.some((f) => f.weight === 400 && f.style === "normal"), `${font.id} has a regular face`);
    for (const face of font.faces) assert.ok(existsSync(new URL(`../../assets/fonts/${face.file}`, import.meta.url)), face.file);
  }
});

test("bundled fonts cover Latin Extended, so Bosnian, Croatian and Czech letters never fall back", () => {
  for (const font of BUNDLED_FONTS) {
    const covers = font.faces.some((f) => f.range === null || /U\+0100-/.test(f.range));
    assert.ok(covers, font.id);
  }
});

test("font ids: built-ins and the user-<id> shape only", () => {
  assert.ok(FONT_CHOICES.includes("literata"));
  assert.equal(cleanValue("type.fontFamily", "literata"), "literata");
  assert.equal(cleanValue("type.fontFamily", "user-ab12cd34"), "user-ab12cd34");
  assert.equal(cleanValue("type.fontFamily", "user-AB"), null);
  assert.equal(cleanValue("type.fontFamily", "Comic Sans"), null);
  assert.equal(isFontId(3), false);
});

test("stacks: system, bundled with a fallback kind, imported, and a missing import leaves the book alone", () => {
  assert.match(fontStack("serif")!, /^Georgia/);
  assert.match(fontStack("atkinson")!, /^"Quire Atkinson", Roboto/);
  assert.match(fontStack(user.id, [user])!, /^"Quire user-ab12cd34"/);
  assert.equal(fontStack(user.id, []), null);
  assert.equal(fontStack("publisher"), null);
});

test("faces: only for fonts with files", () => {
  assert.deepEqual(fontFaces("serif"), []);
  const garamond = fontFaces("garamond");
  assert.ok(garamond.length >= 4);
  assert.ok(garamond.every((f) => f.family === "Quire Garamond"));
  assert.deepEqual(fontFaces(user.id, [user]), [{ family: "Quire user-ab12cd34", file: user.file, weight: 400, style: "normal", range: null }]);
});

test("reading CSS uses the chosen font, and a deleted import falls back to the book", () => {
  const settings = { ...defaults(), "type.fontFamily": user.id };
  assert.match(readingCss(settings, THEMES.light, [user]), /font-family: "Quire user-ab12cd34"/);
  assert.doesNotMatch(readingCss(settings, THEMES.light, []), /font-family/);
});

test("labels", () => {
  assert.equal(fontLabel("publisher", { publisher: "Book's" }), "Book's");
  assert.equal(fontLabel("opendyslexic", {}), "OpenDyslexic");
  assert.equal(fontLabel(user.id, {}, [user]), "Bookerly");
  assert.equal(userFontLabel("Bookerly-Regular.ttf", "x"), "Bookerly");
  assert.equal(userFontLabel('Evil"Name\\.otf', "x"), "EvilName");
  assert.equal(userFontLabel(".ttf", "fallback"), "fallback");
  assert.equal(fontExtension("A.WOFF2"), "woff2");
  assert.equal(fontExtension("a.ttc"), null);
});

test("imported font list: cleaned, de-duplicated, and the file must match the id", () => {
  const parsed = parseUserFonts([user, user, { ...user, id: "user-zz99", file: "user-other.ttf" }, { id: "x", file: "x.ttf" }, null]);
  assert.deepEqual(parsed, [user]);
  assert.deepEqual(parseCustomization({ fonts: [user] }).fonts, [user]);
  assert.deepEqual(parseCustomization({}).fonts, []);
});

test("new ids avoid ones in use", () => {
  let n = 0;
  const id = newUserFontId(["user-00000000"], () => (n++ === 0 ? 0 : 0.5));
  assert.match(id, /^user-[a-z0-9]{8}$/);
  assert.notEqual(id, "user-00000000");
});

test("removing an imported font clears every layer that chose it", () => {
  let custom = addUserFont(emptyCustomization(), user);
  assert.equal(addUserFont(custom, user), custom);
  custom = {
    ...custom,
    global: { "type.fontFamily": user.id, "type.fontSize": 120 },
    profiles: [{ id: "night", name: "Night", values: { "type.fontFamily": user.id } }],
    books: { b1: { "type.fontFamily": user.id }, b2: { "type.fontFamily": "serif" } },
  };
  assert.equal(resolvedFor(custom, "b1")["type.fontFamily"], user.id);
  const next = removeUserFont(custom, user.id);
  assert.deepEqual(next.fonts, []);
  assert.deepEqual(next.global, { "type.fontSize": 120 });
  assert.deepEqual(next.profiles[0].values, {});
  assert.deepEqual(next.books, { b2: { "type.fontFamily": "serif" } });
  assert.equal(removeUserFont(next, user.id), next);
});
