import assert from "node:assert/strict";
import { test } from "node:test";

import { adjacentChapter, chapterAt, chapterTicks, currentEntry, parseNavEntries, type NavEntry } from "./navigation.ts";

const e = (label: string, depth: number, fraction: number | null, href: string | null = `${label}.xhtml`): NavEntry => ({
  label,
  href,
  depth,
  section: fraction === null ? null : 1,
  fraction,
});

const TOC: NavEntry[] = [
  e("Cover", 0, 0),
  e("One", 0, 0.1),
  e("One.a", 1, 0.15),
  e("Two", 0, 0.4),
  e("Broken", 0, null),
  e("Three", 0, 0.7),
];

test("an exact href match picks the entry", () => {
  assert.equal(currentEntry(TOC, "Two.xhtml", 0.9), 3);
});

test("without a match, the last entry starting at or before the position", () => {
  assert.equal(currentEntry(TOC, null, 0.05), 0);
  assert.equal(currentEntry(TOC, "nowhere", 0.12), 1);
  assert.equal(currentEntry(TOC, null, 0.2), 2);
  assert.equal(currentEntry(TOC, null, 0.99), 5);
  assert.equal(currentEntry(TOC, null, null), -1);
  assert.equal(currentEntry([], null, 0.5), -1);
});

test("same-start entries prefer the later one", () => {
  const toc = [e("Part", 0, 0.3), e("Chapter", 1, 0.3)];
  assert.equal(currentEntry(toc, null, 0.3), 1);
});

test("scrub preview names the chapter under the thumb", () => {
  assert.equal(chapterAt(TOC, 0.5), "Two");
  assert.equal(chapterAt([], 0.5), null);
});

test("ticks are top-level starts, sorted, unique, without 0", () => {
  assert.deepEqual(chapterTicks(TOC, 3), [0.1, 0.4, 0.7], "enough top-level entries: top level only");
  assert.deepEqual(chapterTicks(TOC), [0.1, 0.15, 0.4, 0.7], "too few: one level deeper");
  assert.deepEqual(chapterTicks([e("A", 0, 0.5), e("A again", 0, 0.5)]), [0.5]);
});

test("ticks are capped for huge TOCs", () => {
  const toc = Array.from({ length: 500 }, (_, i) => e(`C${i}`, 0, (i + 1) / 501));
  const ticks = chapterTicks(toc, 8, 100);
  assert.equal(ticks.length, 100);
  assert.deepEqual([...ticks].sort((a, b) => a - b), ticks);
});

test("next chapter skips entries that start at the same place or do not resolve", () => {
  assert.equal(adjacentChapter(TOC, 1, "next", 0.12), 2);
  assert.equal(adjacentChapter(TOC, 3, "next", 0.5), 5, "Broken has no position");
  assert.equal(adjacentChapter(TOC, 5, "next", 0.8), -1);
  assert.equal(adjacentChapter(TOC, -1, "next", 0.5), 5, "no current entry: the first one after the position");
});

test("previous chapter goes to the current start first, then the one before", () => {
  assert.equal(adjacentChapter(TOC, 3, "prev", 0.55), 3);
  assert.equal(adjacentChapter(TOC, 3, "prev", 0.4), 2);
  assert.equal(adjacentChapter(TOC, 5, "prev", 0.7), 3, "skips the unresolved entry");
  assert.equal(adjacentChapter(TOC, 0, "prev", 0), -1);
  assert.equal(adjacentChapter([], 0, "prev", 0.5), -1);
});

test("the page's TOC is cleaned", () => {
  const parsed = parseNavEntries([
    { label: "A", href: "a.xhtml", depth: 99, section: 2.4, fraction: 1.5 },
    null,
    { label: 7, href: "", depth: -3, section: -1, fraction: "x" },
  ]);
  assert.deepEqual(parsed, [
    { label: "A", href: "a.xhtml", depth: 10, section: 2, fraction: 1 },
    { label: "", href: null, depth: 0, section: null, fraction: null },
  ]);
  assert.deepEqual(parseNavEntries("nope"), []);
});

test("chapters under volumes get their own ticks (Frankenstein: letters, then three volumes)", () => {
  const toc: NavEntry[] = [e("Letters", 0, 0.01)];
  let at = 0.05;
  for (const volume of ["I", "II", "III"]) {
    toc.push(e(`Volume ${volume}`, 0, (at += 0.005)));
    for (let c = 0; c < 8; c++) toc.push(e(`Chapter ${volume}.${c}`, 1, (at += 0.035)));
  }
  const ticks = chapterTicks(toc);
  assert.equal(ticks.length, 28, "letters, three volume starts, and 24 chapters");
});

test("previous chapter from the first page of a chapter goes to the one before", () => {
  // The relocate's startFraction at a chapter's first page equals the entry's own start.
  assert.equal(adjacentChapter(TOC, 3, "prev", 0.4), 2);
  // foliate's end-of-page fraction would read as inside; that is why the host passes startFraction.
  assert.equal(adjacentChapter(TOC, 3, "prev", 0.4025), 3);
});
