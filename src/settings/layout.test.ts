import assert from "node:assert/strict";
import { test } from "node:test";

import { needsRelayout, resolve, setValue } from "./layers.ts";
import { ambientText, bandsOf, presetOf, presetValues, slotText } from "./layout.ts";
import { cleanValue, defaults } from "./registry.ts";
import { pageOf } from "../reader-page/jumps.js";

const words = {
  pageOf: (page: number, pages: number) => `${page} of ${pages}`,
  pagesLeft: (count: number) => `${count} left`,
  lastPage: "last",
};
const info = { title: "Moby-Dick", author: "Herman Melville", chapter: "Loomings", page: 3, pages: 12, fraction: 0.4219, now: new Date(2026, 10, 23, 7, 5) };

test("slot values: catalog items only, no repeats, at most the slot's max", () => {
  assert.deepEqual(cleanValue("layout.header.left", ["title", "nope", "title", "clock", "percent", "page"]), ["title", "clock", "percent"]);
  assert.deepEqual(cleanValue("layout.header.left", []), []);
  assert.equal(cleanValue("layout.header.left", "title"), null);
});

test("a slot set back to what the layers below give leaves no override", () => {
  let layers = setValue({}, "global", "layout.footer.center", ["page"]);
  assert.deepEqual(layers.global, { "layout.footer.center": ["page"] });
  layers = setValue(layers, "global", "layout.footer.center", []);
  assert.deepEqual(layers.global, {});
  layers = setValue({ global: { "layout.footer.center": ["page"] } }, "book", "layout.footer.center", ["page"]);
  assert.deepEqual(layers.book, {});
});

test("presets: Bare is the default, and applying one is recognised", () => {
  assert.equal(presetOf(defaults()), "bare");
  const classic = resolve({ global: presetValues("classic") });
  assert.equal(presetOf(classic), "classic");
  assert.equal(presetOf(resolve({ global: { ...presetValues("classic"), "layout.footer.right": ["clock"] } })), null);
  assert.deepEqual(bandsOf(defaults()), { top: false, bottom: false });
  assert.deepEqual(bandsOf(classic), { top: true, bottom: true });
});

test("changing a slot relayouts, since the page margin follows the bands", () => {
  assert.equal(needsRelayout(defaults(), resolve({ global: presetValues("classic") })), true);
  assert.equal(needsRelayout(defaults(), resolve({})), false);
});

test("element texts", () => {
  assert.equal(ambientText("title", info, words), "Moby-Dick");
  assert.equal(ambientText("page", info, words), "3 of 12");
  assert.equal(ambientText("pagesLeft", info, words), "9 left");
  assert.equal(ambientText("pagesLeft", { ...info, page: 12 }, words), "last");
  assert.equal(ambientText("percent", info, words), "42%");
  assert.equal(ambientText("clock", info, words), "07:05");
  assert.equal(ambientText("page", { ...info, page: null, pages: null }, words), null);
  assert.equal(ambientText("chapter", { ...info, chapter: null }, words), null);
  assert.equal(slotText(["chapter", "page", "pagesLeft"], { ...info, page: null }, words), "Loomings");
  assert.equal(slotText(["title", "author"], info, words), "Moby-Dick · Herman Melville");
});

test("page in chapter leaves out the paginator's blank end pages", () => {
  assert.deepEqual(pageOf({ scrolled: false, page: 1, pages: 14 }), { page: 1, pages: 12 });
  assert.deepEqual(pageOf({ scrolled: false, page: 13, pages: 14 }), { page: 12, pages: 12 });
  assert.deepEqual(pageOf({ scrolled: true, page: 1, pages: 14 }), { page: null, pages: null });
  assert.deepEqual(pageOf({ scrolled: false, page: 0, pages: 2 }), { page: null, pages: null });
  assert.deepEqual(pageOf(null), { page: null, pages: null });
});
