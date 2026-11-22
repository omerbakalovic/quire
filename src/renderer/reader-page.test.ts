import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import paginatorTurnWait from "../../patches/foliate/paginator-turn-wait.mjs";
import { tapZone } from "../reader-page/tap-zones.js";

test("tap zones are the outer thirds and the middle", () => {
  assert.equal(tapZone(10, 400), "left");
  assert.equal(tapZone(119, 400), "left");
  assert.equal(tapZone(200, 400), "center");
  assert.equal(tapZone(281, 400), "right");
  assert.equal(tapZone(399, 400), "right");
  assert.equal(tapZone(Number.NaN, 400), "center");
  assert.equal(tapZone(10, 0), "center");
});

test("the paginator patch matches the pinned file exactly once", () => {
  const source = readFileSync(new URL("../../vendor/foliate-js/paginator.js", import.meta.url), "utf8").replace(
    /\r\n/g,
    "\n",
  );
  assert.equal(source.split(paginatorTurnWait.find).length - 1, 1);
  assert.ok(!paginatorTurnWait.replace.includes("wait(100)"));
});
