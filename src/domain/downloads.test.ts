import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const BOOKS = [
  "se-frankenstein.epub",
  "pg1342.epub",
  "pg2600.epub",
  "pg1184-images.epub",
];

for (const name of BOOKS) {
  test(`downloaded book ${name}`, async (t) => {
    const path = new URL(`../../test-books/downloaded/${name}`, import.meta.url);
    try {
      await access(path);
    } catch {
      t.skip(`${name} is not downloaded`);
      return;
    }
    const bytes = await readFile(path);
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);
  });
}
