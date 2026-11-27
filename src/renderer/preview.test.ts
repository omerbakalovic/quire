import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { openMessage, PREVIEW_GESTURES, previewOpenMessage } from "../reader/open-message.ts";

const SAMPLE = fileURLToPath(new URL("../../assets/sample/quire-sample.epub", import.meta.url));

/** Roadmap section 4, rule 2: the preview opens its sample through the reader's own open message. */
test("the preview's open message is the reader's, with a fixed start and no bars", () => {
  const look = { css: "p{}", gap: "4%", maxInlineSize: "720px", page: "#fff", ink: "#000", muted: "#555", link: "#00f", chrome: "#eee", chromeInk: "#000", fonts: [], band: 22, fontScale: 1.2, faintFix: false };
  const insets = { top: 0, bottom: 0, left: 0, right: 0 };
  const preview = previewOpenMessage("abc", "http://127.0.0.1:1/book/abc", look, insets);
  const reader = openMessage({ id: "abc", url: "http://127.0.0.1:1/book/abc", flow: "paginated", position: null, look, settings: { tapZones: "screen", gestures: PREVIEW_GESTURES, turns: false }, insets });
  assert.deepEqual(preview, reader);
  assert.equal(preview.look, look, "the same look object the reader would send");
  assert.equal(preview.settings.gestures?.tapCenter, "none");
  assert.equal(preview.settings.turns, false);
});

test("the sample chapter has every kind of content the preview promises", () => {
  const list = execFileSync("unzip", ["-Z1", SAMPLE], { encoding: "utf8" });
  assert.match(list, /^mimetype$/m);
  assert.match(list, /OEBPS\/lighthouse\.png/);
  const chapter = execFileSync("unzip", ["-p", SAMPLE, "OEBPS/chapter.xhtml"], { encoding: "utf8" });
  for (const tag of ["<h1", "<h2", "<h3", "<em>", "<strong>", "<blockquote", "<ol>", "<ul>", "<figure", "<img", "<figcaption", "<table", 'epub:type="noteref"', 'href="https://', 'href="#figure-1"']) {
    assert.ok(chapter.includes(tag), tag);
  }
  const css = execFileSync("unzip", ["-p", SAMPLE, "OEBPS/styles.css"], { encoding: "utf8" });
  assert.match(css, /figure img \{[^}]*border/, "the figure has a border");
  assert.match(css, /\.callout \{[^}]*background/, "a publisher colour to show book-colour settings");
});
