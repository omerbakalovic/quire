import assert from "node:assert/strict";
import { test } from "node:test";

import { decideImport, type ImportReport } from "./import-outcome.ts";

const base = {
  ok: true as const,
  id: "abc",
  hash: "abcdef",
  size: 100,
  duplicate: false,
  title: "T",
  authors: [],
  language: null,
  publisher: null,
  series: null,
  seriesIndex: null,
  coverUri: null,
  encryptionXml: null,
  warnings: [],
};

const DRM_XML = `<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/></EncryptedData></encryption>`;
const FONT_XML = `<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/></EncryptedData></encryption>`;

test("a plain book is added", () => {
  const outcome = decideImport(base);
  assert.equal(outcome.kind, "added");
});

test("a DRM book is refused and its new copy removed", () => {
  assert.deepEqual(decideImport({ ...base, encryptionXml: DRM_XML }), { kind: "drm", id: "abc", removeFile: true });
  assert.deepEqual(decideImport({ ...base, encryptionXml: DRM_XML, duplicate: true }), {
    kind: "drm",
    id: "abc",
    removeFile: false,
  });
});

test("font obfuscation is not DRM", () => {
  assert.equal(decideImport({ ...base, encryptionXml: FONT_XML }).kind, "added");
});

test("same bytes twice is a duplicate", () => {
  assert.equal(decideImport({ ...base, duplicate: true }).kind, "duplicate");
});

test("a file that is not an EPUB is reported", () => {
  const report: ImportReport = { ok: false, reason: "not-epub", detail: "not a zip" };
  assert.deepEqual(decideImport(report), { kind: "not-epub", detail: "not a zip" });
});
