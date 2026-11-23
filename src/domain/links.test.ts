import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyExternalLink } from "./links.ts";

test("web links ask first and show the host", () => {
  assert.deepEqual(classifyExternalLink(" https://standardebooks.org/ebooks/x "), {
    kind: "confirm",
    url: "https://standardebooks.org/ebooks/x",
    scheme: "https",
    display: "standardebooks.org",
  });
  assert.equal(classifyExternalLink("HTTP://Example.com").kind, "confirm");
});

test("mail links ask first and show the address", () => {
  const result = classifyExternalLink("mailto:editor%40example.org?subject=hi");
  assert.equal(result.kind, "confirm");
  assert.equal(result.kind === "confirm" && result.display, "editor@example.org");
  assert.deepEqual(classifyExternalLink("mailto:"), { kind: "refuse", reason: "malformed" });
});

test("every other scheme is refused", () => {
  for (const href of [
    "javascript:alert(1)",
    "file:///sdcard/x",
    "data:text/html,hi",
    "intent://scan#Intent;scheme=zxing;end",
    "content://media/1",
    "tel:123",
    "ftp://example.com",
    "chapter2.xhtml",
  ]) {
    assert.deepEqual(classifyExternalLink(href), { kind: "refuse", reason: "scheme" }, href);
  }
});

test("empty, spoofed, or credentialed URLs are refused", () => {
  assert.deepEqual(classifyExternalLink(""), { kind: "refuse", reason: "empty" });
  assert.deepEqual(classifyExternalLink(null), { kind: "refuse", reason: "empty" });
  assert.deepEqual(classifyExternalLink("https://exa mple.com"), { kind: "refuse", reason: "malformed" });
  assert.deepEqual(classifyExternalLink("https://good.com\u0000.evil"), { kind: "refuse", reason: "malformed" });
  assert.deepEqual(classifyExternalLink("https://bank.com@evil.example/"), { kind: "refuse", reason: "malformed" });
  assert.deepEqual(classifyExternalLink(`https://x.com/${"a".repeat(3000)}`), { kind: "refuse", reason: "malformed" });
});
