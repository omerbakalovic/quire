import assert from "node:assert/strict";
import { test } from "node:test";

import { THEMES } from "./themes.ts";
import {
  draftChanged,
  draftTokens,
  duplicateDraft,
  pushRecent,
  renameDraft,
  resetDraftToken,
  setDraftDark,
  setDraftToken,
  startDraft,
  swatchesFor,
  themesWithDraft,
  TOKEN_GROUPS,
} from "./theme-editor.ts";
import type { UserTheme } from "./user-themes.ts";

const names = (id: string) => ({ light: "Light", night: "Night" })[id] ?? id;
const mine: UserTheme = { id: "theme-mine0001", name: "Mine", base: "night", tokens: { link: "#ff8800" } };

test("editing a built-in starts a copy; editing your own theme edits it", () => {
  const copy = startDraft("night", [], names, "copy", () => 0.5);
  assert.equal(copy.isNew, true);
  assert.equal(copy.theme.base, "night");
  assert.equal(copy.theme.name, "Night (copy)");
  assert.deepEqual(copy.theme.tokens, {});
  assert.deepEqual(draftTokens(copy), THEMES.night);
  assert.equal(startDraft("night", [{ ...mine, name: "Night (copy)" }], names).theme.name, "Night (copy 2)");
  const own = startDraft(mine.id, [mine], names);
  assert.equal(own.isNew, false);
  assert.equal(own.theme.id, mine.id);
  assert.equal(draftChanged(own), false);
  // The draft is a copy: changing it leaves the saved theme alone.
  const changed = setDraftToken(own, "ink", "#ffffff");
  assert.deepEqual(mine.tokens, { link: "#ff8800" });
  assert.equal(draftChanged(changed), true);
  assert.equal(draftChanged(renameDraft(own, "Mine 2")), true);
});

test("duplicating keeps the colours under a new id and a free name", () => {
  const copy = duplicateDraft(mine.id, [mine], names);
  assert.notEqual(copy.theme.id, mine.id);
  assert.equal(copy.theme.name, "Mine (copy)");
  assert.deepEqual(copy.theme.tokens, mine.tokens);
  assert.equal(duplicateDraft("light", [mine], names).theme.base, "light");
});

test("a token set back to what the base gives stops being stored", () => {
  let draft = startDraft(mine.id, [mine], names);
  draft = setDraftToken(draft, "ink", "#ABCDEF");
  assert.equal(draft.theme.tokens.ink, "#abcdef");
  assert.equal(draftTokens(draft).heading, "#abcdef", "heading follows the text colour");
  draft = setDraftToken(draft, "ink", THEMES.night.ink);
  assert.equal("ink" in draft.theme.tokens, false);
  assert.equal(setDraftToken(draft, "ink", "nonsense"), draft);
  draft = resetDraftToken(draft, "link");
  assert.deepEqual(draft.theme.tokens, {});
  draft = setDraftDark(draft, false);
  assert.equal(draft.theme.tokens.dark, false);
  assert.equal("dark" in setDraftDark(draft, true).theme.tokens, false);
});

test("the preview gets the draft in place of the saved theme, or added", () => {
  const own = setDraftToken(startDraft(mine.id, [mine], names), "page", "#101010");
  assert.equal(themesWithDraft([mine], own)[0].tokens.page, "#101010");
  const copy = startDraft("light", [mine], names);
  assert.equal(themesWithDraft([mine], copy).length, 2);
  assert.deepEqual(themesWithDraft([mine], null), [mine]);
});

test("every editable token is listed once", () => {
  const all = TOKEN_GROUPS.flatMap((g) => g.tokens);
  assert.equal(new Set(all).size, all.length);
  for (const key of all) assert.ok(key in THEMES.light, key);
});

test("recent colours: newest first, no repeats, eight at most", () => {
  let recent: string[] = [];
  for (const hex of ["#000000", "#111111", "#000000"]) recent = pushRecent(recent, hex);
  assert.deepEqual(recent, ["#000000", "#111111"]);
  for (let i = 0; i < 10; i++) recent = pushRecent(recent, `#00000${i}`);
  assert.equal(recent.length, 8);
  assert.deepEqual(pushRecent(recent, "bad"), recent);
  const swatches = swatchesFor(THEMES.light, ["#123456", THEMES.light.page]);
  assert.equal(swatches.filter((s) => s === THEMES.light.page).length, 1);
  assert.equal(swatches.at(-1), "#123456");
});
