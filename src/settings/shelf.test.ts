import assert from "node:assert/strict";
import { test } from "node:test";

import { defaults, type Resolved } from "./registry.ts";
import { shelfInk, shelfOf, shelfPillColour } from "./shelf.ts";

test("the default shelf is the one Quire drew before C6", () => {
  const shelf = shelfOf(defaults());
  assert.equal(shelf.pills, false);
  assert.deepEqual([shelf.showCovers, shelf.showAuthor, shelf.showProgress], [false, true, true]);
  assert.deepEqual(shelf.padding, { horizontal: 18, vertical: 14 });
  assert.equal(shelf.gap, 10);
  assert.equal(shelf.radius, 28);
  assert.deepEqual(shelf.cover, { width: 40, height: 60, side: "start" });
  assert.deepEqual(shelf.title, { size: 17, weight: "600", lines: 2 });
  assert.equal(shelf.detailSize, 13);
});

test("a pill's colour: the reader's pick, then the cover or the theme by choice", () => {
  const cover = shelfOf(defaults());
  assert.equal(shelfPillColour(cover, "#AA0000", "#336699", "#E4E4E7"), "#AA0000");
  assert.equal(shelfPillColour(cover, undefined, "#336699", "#E4E4E7"), "#336699");
  assert.equal(shelfPillColour(cover, undefined, undefined, "#E4E4E7"), "#E4E4E7");
  const theme = shelfOf({ ...defaults(), "library.pillColour": "theme" } as Resolved);
  assert.equal(shelfPillColour(theme, undefined, "#336699", "#E4E4E7"), "#E4E4E7");
  assert.equal(shelfPillColour(theme, "#AA0000", "#336699", "#E4E4E7"), "#AA0000");
});

test("text on pills: auto by contrast, or always light or dark", () => {
  const settings = defaults();
  assert.equal(shelfInk(shelfOf(settings), "#000000"), "#000000");
  assert.equal(shelfInk(shelfOf({ ...settings, "library.pillInk": "light" } as Resolved), "#000000"), "#FFFFFF");
  assert.equal(shelfInk(shelfOf({ ...settings, "library.pillInk": "dark" } as Resolved), "#FFFFFF"), "#000000");
  const big = shelfOf({ ...settings, "library.coverSize": "large", "library.coverSide": "end", "library.titleWeight": "regular" } as Resolved);
  assert.deepEqual([big.cover, big.title.weight], [{ width: 56, height: 84, side: "end" }, "400"]);
});
