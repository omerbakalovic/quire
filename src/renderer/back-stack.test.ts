import assert from "node:assert/strict";
import { test } from "node:test";

import { BackStack } from "../reader-page/back-stack.js";

test("jumps push, back pops, several levels deep", () => {
  const stack = new BackStack();
  assert.deepEqual(stack.summary(), { depth: 0, label: null });
  stack.push({ cfi: "epubcfi(/6/4!/4/2)", label: "One" });
  stack.push({ cfi: "epubcfi(/6/8!/4/2)", label: "Three" });
  assert.deepEqual(stack.summary(), { depth: 2, label: "Three" });
  assert.equal(stack.pop()?.cfi, "epubcfi(/6/8!/4/2)");
  assert.equal(stack.pop()?.label, "One");
  assert.equal(stack.pop(), null);
});

test("the same place twice in a row is one entry", () => {
  const stack = new BackStack();
  assert.equal(stack.push({ cfi: "epubcfi(/6/4)", label: null }), true);
  assert.equal(stack.push({ cfi: "epubcfi(/6/4)", label: "x" }), false);
  assert.equal(stack.depth, 1);
});

test("entries without a CFI are ignored", () => {
  const stack = new BackStack();
  assert.equal(stack.push(null), false);
  assert.equal(stack.push({ cfi: "" }), false);
  assert.equal(stack.depth, 0);
});

test("the oldest entries drop past the limit", () => {
  const stack = new BackStack(3);
  for (let i = 0; i < 5; i++) stack.push({ cfi: `epubcfi(/6/${2 * (i + 1)})`, label: String(i) });
  assert.equal(stack.depth, 3);
  assert.equal(stack.pop()?.label, "4");
  assert.equal(stack.pop()?.label, "3");
  assert.equal(stack.pop()?.label, "2");
  stack.push({ cfi: "epubcfi(/6/2)" });
  stack.clear();
  assert.equal(stack.depth, 0);
});
