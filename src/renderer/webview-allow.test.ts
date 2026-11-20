import assert from "node:assert/strict";
import test from "node:test";

import { allowReaderNavigation } from "./webview-allow.ts";

test("the reader WebView allows its own page, blank frames, and chapter blobs", () => {
  assert.equal(allowReaderNavigation("http://127.0.0.1:8765/reader.html"), true);
  assert.equal(
    allowReaderNavigation("http://127.0.0.1:8765/books/fixtures/scripted.epub"),
    true,
  );
  assert.equal(allowReaderNavigation("http://localhost:8765/reader.js"), true);
  assert.equal(allowReaderNavigation("about:blank"), true);
  assert.equal(
    allowReaderNavigation("blob:http://127.0.0.1:8765/74ad7126-23b3-404b-963f-4cfebf88cfe2"),
    true,
  );
});

test("the reader WebView refuses other origins", () => {
  assert.equal(allowReaderNavigation("https://example.com/"), false);
  assert.equal(allowReaderNavigation("javascript:alert(1)"), false);
  assert.equal(allowReaderNavigation("http://127.0.0.1:8766/reader.html"), false);
  assert.equal(allowReaderNavigation("file:///sdcard/book.epub"), false);
});
