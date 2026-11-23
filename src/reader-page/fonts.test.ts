import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanFaces, fontCss, fontFaceCss } from "./fonts.js";

const face = { family: "Quire Literata", file: "literata-latin-400-normal.woff2", weight: 400, style: "normal", range: "U+0000-00FF" };

test("faces are checked before they reach CSS", () => {
  const bad = [
    { ...face, family: 'x"; } body { display:none' },
    { ...face, file: "../../books/x.woff2" },
    { ...face, file: "x.svg" },
    { ...face, range: "U+0000); }" },
    null,
  ];
  const clean = cleanFaces([face, ...bad]);
  assert.equal(clean.length, 2);
  assert.equal(clean[1].range, null);
  assert.equal(cleanFaces("nope").length, 0);
});

test("rules name the format and the unicode range", () => {
  const css = fontFaceCss([face, { ...face, file: "user-ab12.otf", range: null, style: "italic", weight: 7 }], (file: string) => `blob:x/${file}`);
  assert.match(css, /font-family: "Quire Literata"; src: url\("blob:x\/literata-latin-400-normal.woff2"\) format\("woff2"\); font-weight: 400; font-style: normal; font-display: block; unicode-range: U\+0000-00FF;/);
  assert.match(css, /format\("opentype"\); font-weight: 400; font-style: italic; font-display: block; }/);
});

test("files are fetched once, from fonts/ next to the page, and a failure is left out and retried", async () => {
  const asked: string[] = [];
  let fail = true;
  const fetchFn = (async (url: string) => {
    asked.push(url);
    if (url.endsWith("b.woff2") && fail) return { ok: false };
    return { ok: true, blob: async () => new Blob(["wOF2"]) };
  }) as unknown as typeof fetch;
  const faces = [face, { ...face, file: "b.woff2" }];
  const first = await fontCss(faces, "http://127.0.0.1:9/tok/reader.html", fetchFn);
  assert.equal((first.match(/@font-face/g) ?? []).length, 1);
  assert.deepEqual(asked, ["http://127.0.0.1:9/tok/fonts/literata-latin-400-normal.woff2", "http://127.0.0.1:9/tok/fonts/b.woff2"]);
  fail = false;
  const second = await fontCss(faces, "http://127.0.0.1:9/tok/reader.html", fetchFn);
  assert.equal((second.match(/@font-face/g) ?? []).length, 2);
  assert.equal(asked.length, 3);
});
