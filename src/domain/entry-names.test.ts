import assert from "node:assert/strict";
import test from "node:test";

import { entryNameSkipped } from "./entry-names.ts";

test("ordinary, non-ASCII, and percent-encoded names are kept", () => {
  assert.equal(entryNameSkipped("OEBPS/text/ch1.xhtml"), false);
  assert.equal(entryNameSkipped("OEBPS/章.xhtml"), false);
  assert.equal(entryNameSkipped("OEBPS/%E7%AB%A0.xhtml"), false);
  assert.equal(entryNameSkipped("item/xhtml/p-001.xhtml"), false);
});

test("dotdot segments, absolute paths, and backslashes are skipped", () => {
  assert.equal(entryNameSkipped("../secret"), true);
  assert.equal(entryNameSkipped("OEBPS/foo/../ch.xhtml"), true);
  assert.equal(entryNameSkipped("/etc/passwd"), true);
  assert.equal(entryNameSkipped("C:/foo.xhtml"), true);
  assert.equal(entryNameSkipped("OEBPS\\win.xhtml"), true);
});
