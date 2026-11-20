import assert from "node:assert/strict";
import test from "node:test";

import { BOOK_CSP, ensureBookCsp, hasBookCsp } from "./book-csp.ts";

const chapter = `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Scripted</title></head><body><script>bad()</script><p>SCRIPTED-BOOK-TEXT</p></body></html>`;

test("CSP is the first element in head and blocks scripts", () => {
  const html = ensureBookCsp(chapter);
  const metaAt = html.indexOf('http-equiv="Content-Security-Policy"');
  const scriptAt = html.indexOf("<script>");
  assert.ok(metaAt > 0 && metaAt < scriptAt);
  assert.ok(html.includes(`content="${BOOK_CSP}"`));
  assert.ok(html.includes("script-src 'none'"));
});

test("a second pass does not add another policy", () => {
  const once = ensureBookCsp(chapter);
  const twice = ensureBookCsp(once);
  assert.equal(twice, once);
  assert.equal(hasBookCsp(twice), true);
});

test("a document with no head still receives the policy", () => {
  const html = ensureBookCsp("<html><body><p>Hi</p></body></html>");
  assert.equal(hasBookCsp(html), true);
  assert.ok(html.startsWith("<html><head><meta"));
});
