import assert from "node:assert/strict";
import { test } from "node:test";

import {
  changeSetting,
  deleteProfile,
  emptyCustomization,
  forgetBook,
  parseCustomization,
  resolvedFor,
  saveProfile,
  setActiveProfile,
} from "./customization.ts";

test("parsing keeps valid parts and drops the rest", () => {
  const custom = parseCustomization({
    global: { "type.fontSize": 120, "type.fontFamily": "wingdings" },
    profiles: [
      { id: "night", name: " Night ", values: { "theme.id": "night", "turn.followReduceMotion": false } },
      { id: "night", name: "dupe", values: {} },
      { id: "bad id!", name: "x", values: {} },
    ],
    activeProfile: "ghost",
    books: { b1: { "type.fontSize": 140 }, "../x": { "type.fontSize": 1 }, b2: { junk: 1 } },
  });
  assert.deepEqual(custom, {
    global: { "type.fontSize": 120 },
    profiles: [{ id: "night", name: "Night", values: { "theme.id": "night" } }],
    activeProfile: null,
    books: { b1: { "type.fontSize": 140 } },
    fonts: [],
    themes: [],
  });
  assert.deepEqual(parseCustomization(null), emptyCustomization());
  assert.deepEqual(parseCustomization(JSON.parse(JSON.stringify(custom))), custom, "round-trips");
});

test("a book override beats the profile, which beats global", () => {
  let custom = changeSetting(emptyCustomization(), "global", "type.fontSize", 110, null);
  custom = saveProfile(custom, "night", "Night", { "theme.id": "night", "type.fontSize": 120 });
  custom = setActiveProfile(custom, "night");
  custom = changeSetting(custom, "book", "type.fontSize", 150, "b1");
  assert.equal(resolvedFor(custom, "b1")["type.fontSize"], 150);
  assert.equal(resolvedFor(custom, "b2")["type.fontSize"], 120);
  assert.equal(resolvedFor(custom, "b2")["theme.id"], "night");
  assert.equal(resolvedFor(custom, "b2", { "type.fontSize": 200 })["type.fontSize"], 200, "session wins, unsaved");
  custom = setActiveProfile(custom, null);
  assert.equal(resolvedFor(custom, "b2")["type.fontSize"], 110);
});

test("a book override equal to what is below is not kept", () => {
  let custom = changeSetting(emptyCustomization(), "book", "theme.id", "dark", "b1");
  assert.deepEqual(custom.books, { b1: { "theme.id": "dark" } });
  custom = changeSetting(custom, "book", "theme.id", "light", "b1");
  assert.deepEqual(custom.books, {});
  assert.equal(changeSetting(custom, "book", "theme.id", "dark", null), custom);
});

test("profile writes need an active profile", () => {
  const custom = emptyCustomization();
  assert.equal(changeSetting(custom, "profile", "theme.id", "dark", null), custom);
  let withProfile = setActiveProfile(saveProfile(custom, "day", "Day", {}), "day");
  withProfile = changeSetting(withProfile, "profile", "theme.id", "paper", null);
  assert.deepEqual(withProfile.profiles[0].values, { "theme.id": "paper" });
  assert.equal(deleteProfile(withProfile, "day").activeProfile, null);
  assert.equal(setActiveProfile(custom, "missing"), custom);
});

test("removing a book forgets its overrides", () => {
  const custom = changeSetting(emptyCustomization(), "book", "type.fontSize", 130, "b1");
  assert.deepEqual(forgetBook(custom, "b1").books, {});
  assert.equal(forgetBook(custom, "zz"), custom);
});

test("profiles can be renamed, duplicated, updated and restored after a delete", async () => {
  const m = await import("./customization.ts");
  let custom = m.parseCustomization({
    global: { "type.fontSize": 110 },
    profiles: [
      { id: "night", name: "Night", values: { "theme.id": "night" } },
      { id: "day", name: "Day", values: {} },
    ],
    activeProfile: "night",
  });
  custom = m.renameProfile(custom, "night", "  Late night ");
  assert.equal(custom.profiles[0].name, "Late night");
  assert.equal(m.renameProfile(custom, "night", "   "), custom);

  const dup = m.duplicateProfile(custom, "night", "Late night copy");
  assert.equal(dup.id, "late-night-copy");
  assert.deepEqual(dup.custom.profiles.map((p) => p.id), ["night", "late-night-copy", "day"]);
  assert.deepEqual(dup.custom.profiles[1].values, { "theme.id": "night" });
  assert.equal(m.profileIdFor(dup.custom, "Late night copy"), "late-night-copy-2");

  custom = m.changeSetting(dup.custom, "global", "type.fontSize", 140, null);
  custom = m.updateProfileFromCurrent(custom, "day");
  assert.deepEqual(custom.profiles.find((p) => p.id === "day")?.values, { "type.fontSize": 140, "theme.id": "night" });

  const before = custom;
  const gone = m.deleteProfile(custom, "night");
  assert.equal(gone.activeProfile, null);
  const back = m.restoreProfile(gone, before.profiles[0], 0, true);
  assert.deepEqual(back.profiles, before.profiles);
  assert.equal(back.activeProfile, "night");
});

test("revert puts layers and the active profile back, but keeps fonts as they are", async () => {
  const m = await import("./customization.ts");
  const snapshot = m.parseCustomization({
    global: { "type.fontSize": 110, "type.fontFamily": "user-abcd1234" },
    profiles: [{ id: "night", name: "Night", values: { "theme.id": "night" } }],
    activeProfile: null,
    books: { book1: { "page.marginX": 6 } },
    fonts: [{ id: "user-abcd1234", label: "Mine", file: "user-abcd1234.ttf" }],
  });
  let now = m.changeSetting(snapshot, "global", "type.fontSize", 150, null);
  now = m.setActiveProfile(now, "night");
  now = m.changeSetting(now, "book", "page.marginX", 10, "book1");
  now = m.renameProfile(now, "night", "Dark");
  now = m.removeUserFont(now, "user-abcd1234");
  assert.equal(m.changedSince(now, snapshot), true);

  const reverted = m.revertTo(now, snapshot);
  assert.equal(reverted.global["type.fontSize"], 110);
  assert.equal(reverted.global["type.fontFamily"], undefined, "a deleted font is not brought back as a dangling value");
  assert.equal(reverted.activeProfile, null);
  assert.equal(reverted.profiles[0].name, "Night");
  assert.deepEqual(reverted.books, { book1: { "page.marginX": 6 } });
  assert.deepEqual(reverted.fonts, []);
  assert.equal(m.changedSince(snapshot, snapshot), false);
});
