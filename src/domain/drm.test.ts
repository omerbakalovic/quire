import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { classifyEncryption } from "./drm.ts";

const drmFixture = new URL(
  "../../test-books/src/drm/META-INF/encryption.xml",
  import.meta.url,
);

test("missing encryption is not DRM", () => {
  assert.equal(classifyEncryption(null), "none");
  assert.equal(classifyEncryption("   "), "none");
  assert.equal(classifyEncryption("<encryption></encryption>"), "none");
});

test("IDPF and Adobe font obfuscation are not DRM", () => {
  const xml = `
    <enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>
    <enc:EncryptionMethod Algorithm="http://ns.adobe.com/pdf/enc#RC"/>
  `;
  assert.equal(classifyEncryption(xml), "font-obfuscation");
});

test("the font fixture is obfuscation and does not count as DRM", () => {
  const xml = readFileSync(
    new URL("../../test-books/src/font-obfuscation/META-INF/encryption.xml", import.meta.url),
    "utf8",
  );
  assert.equal(classifyEncryption(xml), "font-obfuscation");
});

test("a content cipher is DRM, including when mixed with font obfuscation", () => {
  const xml = readFileSync(drmFixture, "utf8");
  assert.equal(classifyEncryption(xml), "drm");
  const mixed = `
    <enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>
    <enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/>
  `;
  assert.equal(classifyEncryption(mixed), "drm");
});
