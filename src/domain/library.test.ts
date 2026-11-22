import assert from "node:assert/strict";
import { test } from "node:test";

import {
  emptyLibrary,
  markOpened,
  parseLibrary,
  recordPosition,
  removeBook,
  serializeLibrary,
  setFlow,
  sortedBooks,
  titleFromFileName,
  updateSettings,
  upsertBook,
  type ImportFacts,
} from "./library.ts";

function facts(id: string, overrides: Partial<ImportFacts> = {}): ImportFacts {
  return {
    id,
    hash: `${id}hash`,
    size: 10,
    title: `Title ${id}`,
    authors: ["Author"],
    language: "en",
    publisher: null,
    series: null,
    seriesIndex: null,
    coverUri: null,
    ...overrides,
  };
}

test("a damaged index gives an empty library, not a throw", () => {
  assert.deepEqual(parseLibrary(null), emptyLibrary());
  assert.deepEqual(parseLibrary("{not json"), emptyLibrary());
  assert.deepEqual(parseLibrary("[]").books, []);
});

test("bad rows are dropped and good rows are kept", () => {
  const json = JSON.stringify({
    flow: "scrolled",
    books: [
      { id: "../etc", title: "x" },
      { id: "ok1", title: "Good", fraction: 4 },
      { id: "ok1", title: "Duplicate" },
      42,
      { id: "ok2" },
    ],
  });
  const library = parseLibrary(json);
  assert.equal(library.flow, "scrolled");
  assert.deepEqual(library.books.map((book) => book.id), ["ok1", "ok2"]);
  assert.equal(library.books[0].title, "Good");
  assert.equal(library.books[0].fraction, 1);
  assert.equal(library.books[1].title, "ok2");
});

test("serialize and parse round-trip", () => {
  let library = upsertBook(emptyLibrary(), facts("a1"), null, 100);
  library = recordPosition(library, "a1", "epubcfi(/6/4!/4/2)", 0.25, 200);
  assert.deepEqual(parseLibrary(serializeLibrary(library)), library);
});

test("a missing title falls back to the file name, then the id", () => {
  const named = upsertBook(emptyLibrary(), facts("b1", { title: null }), "My_Book.epub", 1);
  assert.equal(named.books[0].title, "My Book");
  const bare = upsertBook(emptyLibrary(), facts("b2", { title: null }), null, 1);
  assert.equal(bare.books[0].title, "b2");
  assert.equal(titleFromFileName("C:\\books\\x.EPUB"), "x");
  assert.equal(titleFromFileName(".epub"), null);
});

test("re-importing keeps the position and the added date", () => {
  let library = upsertBook(emptyLibrary(), facts("c1"), null, 100);
  library = recordPosition(library, "c1", "epubcfi(/6/8!/4/2)", 0.5, 300);
  library = upsertBook(library, facts("c1", { title: "New title" }), null, 900);
  assert.equal(library.books.length, 1);
  const [book] = library.books;
  assert.equal(book.title, "New title");
  assert.equal(book.addedAt, 100);
  assert.equal(book.cfi, "epubcfi(/6/8!/4/2)");
  assert.equal(book.fraction, 0.5);
  assert.equal(book.lastOpenedAt, 300);
});

test("recording a position for an unknown book leaves the library unchanged", () => {
  const library = upsertBook(emptyLibrary(), facts("d1"), null, 1);
  assert.equal(recordPosition(library, "zz", "epubcfi(/6/2)", 0.1, 5), library);
});

test("a non-finite fraction keeps the previous one", () => {
  let library = upsertBook(emptyLibrary(), facts("e1"), null, 1);
  library = recordPosition(library, "e1", "epubcfi(/6/2)", 0.3, 2);
  library = recordPosition(library, "e1", "epubcfi(/6/4)", Number.NaN, 3);
  assert.equal(library.books[0].fraction, 0.3);
  assert.equal(library.books[0].cfi, "epubcfi(/6/4)");
});

test("recently opened books sort first, then recently added", () => {
  let library = emptyLibrary();
  library = upsertBook(library, facts("old"), null, 1);
  library = upsertBook(library, facts("new"), null, 5);
  library = upsertBook(library, facts("read"), null, 2);
  library = markOpened(library, "read", 10);
  assert.deepEqual(sortedBooks(library).map((book) => book.id), ["read", "new", "old"]);
  assert.deepEqual(removeBook(library, "new").books.map((book) => book.id), ["old", "read"]);
});

test("flow is stored on the library", () => {
  const library = emptyLibrary();
  assert.equal(setFlow(library, "paginated"), library);
  assert.equal(setFlow(library, "scrolled").flow, "scrolled");
});

test("settings default to reading-direction taps and survive a round trip", () => {
  const library = emptyLibrary();
  assert.equal(library.settings.tapZones, "reading");
  assert.equal(parseLibrary('{"books":[]}').settings.tapZones, "reading");
  assert.equal(parseLibrary('{"settings":{"tapZones":"sideways"}}').settings.tapZones, "reading");
  const screen = updateSettings(library, { tapZones: "screen" });
  assert.equal(screen.settings.tapZones, "screen");
  assert.equal(updateSettings(screen, { tapZones: "screen" }), screen);
  assert.equal(parseLibrary(serializeLibrary(screen)).settings.tapZones, "screen");
});
