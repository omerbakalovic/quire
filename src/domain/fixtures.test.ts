import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const chapter = new URL(
  "../../test-books/src/noteref/OEBPS/chapter-1.xhtml",
  import.meta.url,
);
const endnotes = new URL(
  "../../test-books/src/noteref/OEBPS/endnotes.xhtml",
  import.meta.url,
);

test("the noteref fixture contains every required case", () => {
  const text = readFileSync(chapter, "utf8") + readFileSync(endnotes, "utf8");
  for (const marker of [
    'epub:type="noteref"',
    'role="doc-noteref"',
    'epub:type="footnote"',
    'role="doc-footnote"',
    'epub:type="endnote"',
    'href="endnotes.xhtml#en1"',
    'href="endnotes.xhtml#en-rich"',
    'href="endnotes.xhtml#en-nested"',
    'href="chapter-2.xhtml#item-3"',
    'href="chapter-2.xhtml"',
    'id="en-empty"',
    "CHAPTER-ONE-START",
    "CHAPTER-ONE-END",
  ]) {
    assert.ok(text.includes(marker), marker);
  }
});
