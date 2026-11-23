import assert from "node:assert/strict";
import { test } from "node:test";

import type { LibraryBook } from "./library.ts";
import {
  DEFAULT_LOOK,
  NEUTRAL_PILL,
  editionLabels,
  forgetBook,
  parseLook,
  pillColor,
  setBookColor,
  setCoverColor,
  setFileName,
  textOn,
  updateLook,
} from "./library-look.ts";

function book(id: string, title: string, extra: Partial<LibraryBook> = {}): LibraryBook {
  return {
    id,
    hash: id,
    size: 1,
    title,
    authors: ["Herman Melville"],
    language: null,
    publisher: null,
    series: null,
    seriesIndex: null,
    coverUri: null,
    addedAt: 0,
    lastOpenedAt: null,
    cfi: null,
    fraction: null,
    ...extra,
  } as LibraryBook;
}

test("the default look is minimal, with no covers", () => {
  assert.deepEqual(parseLook(undefined), DEFAULT_LOOK);
  assert.equal(DEFAULT_LOOK.style, "minimal");
  assert.equal(DEFAULT_LOOK.showCovers, false);
});

test("damaged values fall back and bad colours are dropped", () => {
  const look = parseLook({ style: "neon", showAuthor: "no", bookColors: { a: "#123456", b: "red", c: 5 } });
  assert.equal(look.style, "minimal");
  assert.equal(look.showAuthor, true);
  assert.deepEqual(look.bookColors, { a: "#123456" });
});

test("pill colour: the reader's pick, then the cover, then neutral", () => {
  let look = setCoverColor(DEFAULT_LOOK, "a", "#336699");
  assert.equal(pillColor(look, "a"), "#336699");
  look = setBookColor(look, "a", "#AA0000");
  assert.equal(pillColor(look, "a"), "#AA0000");
  look = setBookColor(look, "a", null);
  assert.equal(pillColor(look, "a"), "#336699");
  assert.equal(pillColor(look, "b"), NEUTRAL_PILL);
  assert.equal(setBookColor(look, "a", "blue"), look);
});

test("text is dark on light pills and light on dark ones", () => {
  assert.equal(textOn("#FFFFFF"), "#000000");
  assert.equal(textOn("#E8E2D6"), "#000000");
  assert.equal(textOn("#1F3A5F"), "#FFFFFF");
  assert.equal(textOn("#000000"), "#FFFFFF");
});

test("updateLook only takes known options", () => {
  const look = updateLook(DEFAULT_LOOK, { style: "pills", showCovers: true });
  assert.equal(look.style, "pills");
  assert.equal(look.showCovers, true);
});

test("forgetting a book drops its colours and file name", () => {
  let look = setBookColor(DEFAULT_LOOK, "a", "#111111");
  look = setCoverColor(look, "a", "#222222");
  look = setFileName(look, "a", "a.epub");
  assert.deepEqual(forgetBook(look, "a"), DEFAULT_LOOK);
});

test("editions with the same title get told apart, by file name first", () => {
  const books = [
    book("foot", "Moby-Dick", { addedAt: 1 }),
    book("link", "Moby-Dick", { addedAt: 2 }),
    book("other", "Frankenstein"),
  ];
  let look = setFileName(DEFAULT_LOOK, "foot", "Moby-Dick.Power.foot.epub");
  look = setFileName(look, "link", "Moby-Dick.Power.link.epub");
  const labels = editionLabels(books, look);
  assert.equal(labels.get("foot"), "Moby-Dick.Power.foot");
  assert.equal(labels.get("link"), "Moby-Dick.Power.link");
  assert.equal(labels.has("other"), false);
  const fallback = editionLabels(books, DEFAULT_LOOK);
  assert.equal(fallback.get("foot"), "Copy 1");
  assert.equal(fallback.get("link"), "Copy 2");
});
