import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { parseLibrary, serializeLibrary } from "./library.ts";
import { resolvedFor } from "../settings/customization.ts";

/**
 * Migration rule 7 (docs/customization-roadmap.md, section 3): a library
 * saved by the version 1 build parses into the current format with every
 * book, position, profile, override, font and pill colour unchanged.
 */
const raw = readFileSync(new URL("./fixtures/library-v1.json", import.meta.url), "utf8");
const v1 = JSON.parse(raw);

test("a version 1 library keeps everything when read by this build", () => {
  const library = parseLibrary(raw);
  assert.equal(library.version, 2);
  assert.equal(library.flow, "scrolled");
  assert.deepEqual(library.settings, v1.settings);
  // The shelf options moved to the registry (C6); the book colours and file names stay in the look.
  const { style, showCovers, showAuthor, showProgress, ...bookData } = v1.look;
  assert.deepEqual(library.look, bookData);
  const shelf = resolvedFor(library.custom, null);
  assert.deepEqual([shelf["library.style"], shelf["library.showCovers"], shelf["library.showAuthor"], shelf["library.showProgress"]], [style, showCovers, showAuthor, showProgress]);
  assert.equal(library.books.length, 2);
  for (const book of v1.books) {
    const now = library.books.find((b) => b.id === book.id);
    assert.ok(now, book.title);
    for (const key of ["cfi", "fraction", "sectionIndex", "sectionFraction", "title", "lastOpenedAt"]) assert.deepEqual(now[key as keyof typeof now], book[key], `${book.title} ${key}`);
  }
  assert.deepEqual(library.custom.global, { ...v1.custom.global, "library.style": "pills", "library.showCovers": true, "library.showAuthor": false });
  assert.deepEqual(library.custom.books, v1.custom.books);
  assert.equal(library.custom.activeProfile, "night");
  assert.deepEqual(
    library.custom.profiles.map((p) => [p.id, p.name, p.values]),
    v1.custom.profiles.map((p: { id: string; name: string; values: unknown }) => [p.id, p.name, p.values]),
  );
  assert.deepEqual(library.custom.fonts.map((f) => f.id), ["user-abcd1234"]);
});

test("the settings in use for each book are the same after the upgrade", () => {
  const library = parseLibrary(raw);
  const again = parseLibrary(serializeLibrary(library));
  for (const id of [null, ...v1.books.map((b: { id: string }) => b.id)]) {
    assert.deepEqual(resolvedFor(again.custom, id), resolvedFor(library.custom, id));
  }
  const moby = resolvedFor(library.custom, "aaaa1111bbbb2222cccc3333dddd4444");
  assert.equal(moby["type.fontSize"], 90);
  assert.equal(moby["theme.id"], "light");
  assert.equal(moby["light.dimmer"], 0.3);
  assert.equal(moby["type.fontFamily"], "user-abcd1234");
  const frank = resolvedFor(library.custom, "eeee5555ffff6666aaaa7777bbbb8888");
  assert.equal(frank["type.fontSize"], 130);
  assert.equal(frank["page.marginX"], 8);
});

test("the shelf moves to the settings once: a file saved since keeps its own values", () => {
  const library = parseLibrary(raw);
  const saved = JSON.parse(serializeLibrary(library));
  assert.equal("style" in saved.look, false);
  // Changed since in the app (to minimal, the default, so dropped from global), then read again.
  const changed = { ...saved, look: { ...saved.look, style: "pills" }, custom: { ...saved.custom, global: { ...saved.custom.global, "library.style": "minimal" } } };
  assert.equal(resolvedFor(parseLibrary(JSON.stringify(changed)).custom, null)["library.style"], "minimal");
});

test("the saved file starts with its version, where the native backup looks for it", () => {
  assert.match(serializeLibrary(parseLibrary(raw)), /^\{"version":2,/);
});
