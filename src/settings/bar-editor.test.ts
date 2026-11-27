import assert from "node:assert/strict";
import { test } from "node:test";

import { addElement, available, barDraftChanged, barDraftValues, defaultTapBars, draftFrom, moveAcross, moveAlong, moveTo, dropFull, placeOf, rebased, removeElement, setArrange, tapBarsAreDefault, withDraft } from "./bar-editor.ts";
import { barRows } from "./bars.ts";
import { defaults } from "./registry.ts";

test("a draft starts as the saved layout and changes nothing until saved", () => {
  const settings = defaults();
  const draft = draftFrom(settings);
  assert.equal(barDraftChanged(draft, settings), false);
  assert.deepEqual(barDraftValues(draft, settings), {});
  assert.deepEqual(withDraft(settings, draft), settings);
});

test("an element is in one place: adding one already placed is refused, and full zones refuse too", () => {
  let draft = draftFrom(defaults());
  assert.equal(addElement(draft, "top", 2, "contents").refused, "placed");
  assert.equal(available(draft, "top").includes("contents"), false);
  draft = removeElement(draft, "contents", "controls");
  draft = addElement(draft, "top", 2, "contents").draft;
  assert.deepEqual(draft["layout.top.end"], ["contents"]);
  assert.deepEqual(placeOf(draft, "contents", "controls"), { region: "top", zone: 2, index: 0 });
  // Header and footer lines are their own kind: a clock in the header doesn't block one in... nowhere else but the lines.
  draft = addElement(draft, "header", 2, "clock").draft;
  assert.equal(addElement(draft, "footer", 0, "clock").refused, "placed");
  assert.equal(addElement(draft, "top", 0, "clock").refused, "placed", "not a control");
  let full = draft;
  for (const e of ["prevChapter", "nextChapter", "percent", "slider", "look", "flow"]) full = removeElement(full, e, "controls");
  for (const e of ["prevChapter", "nextChapter", "percent", "slider", "look", "flow"]) full = addElement(full, "quick", 0, e).draft;
  assert.equal((full["layout.quick.start"] as string[]).length, 6);
  assert.equal(addElement(removeElement(full, "back", "controls"), "quick", 0, "back").refused, "full");
});

test("◀ ▶ step along the region and cross into the next zone at its edge", () => {
  let draft = draftFrom(defaults());
  // Top start is back, title.
  draft = moveAlong(draft, "back", "controls", 1).draft;
  assert.deepEqual(draft["layout.top.start"], ["title", "back"]);
  draft = moveAlong(draft, "back", "controls", 1).draft;
  assert.deepEqual(draft["layout.top.start"], ["title"]);
  assert.deepEqual(draft["layout.top.center"], ["back"]);
  draft = moveAlong(draft, "back", "controls", 1).draft;
  assert.deepEqual(draft["layout.top.end"], ["back"]);
  assert.equal(moveAlong(draft, "back", "controls", 1).refused, "edge");
  draft = moveAlong(draft, "back", "controls", -1).draft;
  assert.deepEqual(draft["layout.top.center"], ["back"]);
});

test("▲ ▼ move to the same zone of the next region of the same kind", () => {
  let draft = draftFrom(defaults());
  draft = moveAcross(draft, "look", "controls", -1).draft;
  assert.deepEqual(draft["layout.quick.center"], ["prevChapter", "slider", "nextChapter", "percent", "look"]);
  assert.deepEqual(draft["layout.bottom.center"], ["contents", "flow"]);
  draft = moveAcross(draft, "look", "controls", -1).draft;
  assert.deepEqual(draft["layout.top.center"], ["look"]);
  assert.equal(moveAcross(draft, "look", "controls", -1).refused, "edge", "the top bar is the top; the header line takes other elements");
  draft = addElement(draft, "header", 0, "title").draft;
  draft = moveAcross(draft, "title", "lines", 1).draft;
  assert.deepEqual(draft["layout.footer.left"], ["title"]);
});

test("Save writes only what changed, and the preview draws the draft", () => {
  const settings = defaults();
  let draft = setArrange(draftFrom(settings), "top", "spread");
  const values = barDraftValues(draft, settings);
  assert.deepEqual(Object.keys(values), ["layout.top.arrange"]);
  assert.equal(barRows(withDraft(settings, draft)).top[0].zone, "all");
});

test("restoring the default tap bars leaves the header and footer lines as they are", () => {
  const settings = defaults();
  let draft = draftFrom(settings);
  assert.equal(tapBarsAreDefault(draft), true);
  draft = { ...moveAlong(draft, "back", "controls", 1).draft, "layout.header.left": ["clock"], "layout.top.arrange": "spread" };
  assert.equal(tapBarsAreDefault(draft), false);
  const restored = defaultTapBars(draft);
  assert.equal(tapBarsAreDefault(restored), true);
  assert.deepEqual(restored["layout.header.left"], ["clock"]);
  assert.deepEqual(barDraftValues(restored, settings), { "layout.header.left": ["clock"] });
});

test("a draft carries only its own edits to settings that changed under it", () => {
  const a = defaults();
  const draft = moveAlong(draftFrom(a), "back", "controls", 1).draft;
  const b = { ...a, "layout.header.right": ["clock"] } as typeof a;
  const over = rebased({ base: draftFrom(a), draft }, b);
  assert.ok(over);
  assert.deepEqual(over["layout.header.right"], ["clock"]);
  assert.deepEqual(over["layout.top.start"], ["title", "back"]);
  assert.deepEqual(barDraftValues(over, b), { "layout.top.start": ["title", "back"] });
  assert.equal(rebased(null, b), null);
});

test("a drag drop reorders within a zone, moves across zones, and never leaves its region", () => {
  const settings = defaults();
  const draft = draftFrom(settings);
  // Bottom row centre: contents, look, flow.
  const reordered = moveTo(draft, "flow", "controls", "bottom", 1, 0);
  assert.deepEqual(reordered.draft["layout.bottom.center"], ["flow", "contents", "look"]);
  const across = moveTo(draft, "look", "controls", "bottom", 2, 0);
  assert.deepEqual(across.draft["layout.bottom.center"], ["contents", "flow"]);
  assert.deepEqual(across.draft["layout.bottom.end"], ["look"]);
  assert.equal(moveTo(draft, "look", "controls", "top", 0, 0).refused, "edge");
  assert.equal(moveTo(draft, "look", "controls", "bottom", 1, 1).draft, draft);
  assert.deepEqual(moveTo(draft, "look", "controls", "bottom", 1, 99).draft["layout.bottom.center"], ["contents", "flow", "look"]);
  const full = { ...draft, "layout.bottom.end": ["a", "b", "c", "d", "e", "f"] };
  assert.equal(dropFull(full, "look", "controls", 2), true);
  assert.equal(moveTo(full, "look", "controls", "bottom", 2, 0).refused, "full");
  assert.equal(dropFull(full, "look", "controls", 1), false);
});
