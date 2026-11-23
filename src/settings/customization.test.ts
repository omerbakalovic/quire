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
