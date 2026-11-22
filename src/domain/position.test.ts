import assert from "node:assert/strict";
import { test } from "node:test";

import { bookFractionOf, cfiSectionIndex, cleanPosition, planRestore, sectionFractionOf } from "./position.ts";

// Four sections: 0 is a non-linear cover (size 0), then 50%, 25%, 25%.
const FRACTIONS = [0, 0, 0.5, 0.75, 1];

test("section fraction is the offset inside the section", () => {
  assert.equal(sectionFractionOf(0.25, 1, FRACTIONS), 0.5);
  assert.equal(sectionFractionOf(0.5, 2, FRACTIONS), 0);
  assert.equal(sectionFractionOf(0.875, 3, FRACTIONS), 0.5);
});

test("a zero-size section or a bad index has no section fraction", () => {
  assert.equal(sectionFractionOf(0, 0, FRACTIONS), null);
  assert.equal(sectionFractionOf(0.5, 4, FRACTIONS), null);
  assert.equal(sectionFractionOf(0.5, -1, FRACTIONS), null);
  assert.equal(sectionFractionOf(null, 1, FRACTIONS), null);
  assert.equal(sectionFractionOf(0.5, 1, []), null);
});

test("book fraction inverts the section fraction and stays inside the section", () => {
  assert.equal(bookFractionOf(1, 0.5, FRACTIONS), 0.25);
  assert.equal(bookFractionOf(2, null, FRACTIONS), 0.5);
  const end = bookFractionOf(1, 1, FRACTIONS);
  assert.ok(end !== null && end < 0.5, "the end of a section must not land on the next one");
  assert.equal(bookFractionOf(9, 0.5, FRACTIONS), null);
});

test("the spine index comes from the first CFI step", () => {
  assert.equal(cfiSectionIndex("epubcfi(/6/2!/4/2)"), 0);
  assert.equal(cfiSectionIndex("epubcfi(/6/8!/4/2/1:10)"), 3);
  assert.equal(cfiSectionIndex("epubcfi(/6/7!/4)"), null);
  assert.equal(cfiSectionIndex("epubcfi(/4/2)"), null);
  assert.equal(cfiSectionIndex(null), null);
});

test("stored positions are cleaned, never thrown on", () => {
  assert.deepEqual(cleanPosition(null), { cfi: null, fraction: null, sectionIndex: null, sectionFraction: null });
  assert.deepEqual(cleanPosition({ cfi: "nope", fraction: 3, sectionIndex: 2.7, sectionFraction: -1 }), {
    cfi: null,
    fraction: 1,
    sectionIndex: 2,
    sectionFraction: 0,
  });
  assert.equal(cleanPosition({ sectionFraction: 0.5 }).sectionFraction, null, "no section, no section fraction");
});

const BOOK = { sectionCount: 4, sectionFractions: FRACTIONS, cfiIndex: 2 };

test("a CFI that resolves to the saved section wins", () => {
  const position = { cfi: "epubcfi(/6/6!/4/2)", fraction: 0.6, sectionIndex: 2, sectionFraction: 0.4 };
  assert.deepEqual(planRestore(position, BOOK), { kind: "cfi", cfi: position.cfi });
  // Old rows from M1b have no section: the CFI alone is trusted.
  assert.deepEqual(planRestore({ ...position, sectionIndex: null, sectionFraction: null }, BOOK).kind, "cfi");
});

test("a CFI that does not resolve falls back to the section, then the book fraction", () => {
  const position = { cfi: "epubcfi(/6/6!/4/2)", fraction: 0.6, sectionIndex: 2, sectionFraction: 0.4 };
  assert.deepEqual(planRestore(position, { ...BOOK, cfiIndex: null }), { kind: "fraction", fraction: 0.6, from: "section" });
  assert.deepEqual(planRestore({ ...position, sectionIndex: null }, { ...BOOK, cfiIndex: null }), {
    kind: "fraction",
    fraction: 0.6,
    from: "book",
  });
});

test("a CFI that lands in another section than saved is not trusted", () => {
  const position = { cfi: "epubcfi(/6/6!/4/2)", fraction: 0.3, sectionIndex: 1, sectionFraction: 0.6 };
  const plan = planRestore(position, BOOK);
  assert.equal(plan.kind, "fraction");
  assert.equal(plan.kind === "fraction" && plan.from, "section");
});

test("a CFI past the last section, or nothing saved, opens at the start", () => {
  assert.deepEqual(planRestore({ cfi: "epubcfi(/6/40)", fraction: null, sectionIndex: null, sectionFraction: null }, { ...BOOK, cfiIndex: 19 }), {
    kind: "start",
  });
  assert.deepEqual(planRestore(cleanPosition(null), BOOK), { kind: "start" });
});

test("a saved section past the end of a shorter re-import uses the book fraction", () => {
  const position = { cfi: null, fraction: 0.9, sectionIndex: 12, sectionFraction: 0.5 };
  assert.deepEqual(planRestore(position, BOOK), { kind: "fraction", fraction: 0.9, from: "book" });
});
