import assert from "node:assert/strict";
import { test } from "node:test";

import { HOST_ACTIONS } from "../renderer/protocol.ts";
import { ACTIONS as REGISTRY_ACTIONS } from "../settings/registry.ts";
import { ACTIONS, classifyTouch, cleanGestures, DEFAULT_GESTURES, PAGE_ACTIONS, tapGesture } from "./gestures.js";

test("the page, the registry and the protocol agree on the actions", () => {
  assert.deepEqual(ACTIONS, [...REGISTRY_ACTIONS]);
  assert.deepEqual([...HOST_ACTIONS].sort(), ACTIONS.filter((a) => a !== "none" && !PAGE_ACTIONS.includes(a)).sort());
});

test("a gesture map keeps known actions and defaults the rest", () => {
  assert.deepEqual(cleanGestures(null), DEFAULT_GESTURES);
  assert.deepEqual(cleanGestures({ tapLeft: "nextPage", swipeUp: "contents", tapCenter: "explode", extra: "look" }), {
    ...DEFAULT_GESTURES,
    tapLeft: "nextPage",
    swipeUp: "contents",
  });
});

test("touches are told apart by distance, direction, time and fingers", () => {
  const at = (x: number, y: number, t: number) => ({ x, y, t });
  assert.equal(classifyTouch(at(100, 500, 0), at(105, 380, 200), 1), "swipeUp");
  assert.equal(classifyTouch(at(100, 300, 0), at(90, 420, 200), 1), "swipeDown");
  // Too short, too slow, or mostly sideways: foliate's turn or nothing.
  assert.equal(classifyTouch(at(100, 500, 0), at(100, 470, 200), 1), null);
  assert.equal(classifyTouch(at(100, 500, 0), at(100, 300, 1500), 1), null);
  assert.equal(classifyTouch(at(100, 500, 0), at(260, 400, 200), 1), null);
  assert.equal(classifyTouch(at(100, 500, 0), at(104, 503, 150), 2), "twoFingerTap");
  assert.equal(classifyTouch(at(100, 500, 0), at(160, 503, 150), 2), null);
  assert.equal(classifyTouch(at(100, 500, 0), at(104, 503, 900), 2), null);
  assert.equal(classifyTouch(at(100, 500, 0), at(104, 503, 150), 3), null);
  assert.equal(classifyTouch(null, at(1, 1, 1), 1), null);
});

test("tap zones name their gestures", () => {
  assert.equal(tapGesture("left"), "tapLeft");
  assert.equal(tapGesture("center"), "tapCenter");
  assert.equal(tapGesture("right"), "tapRight");
});
