import assert from "node:assert/strict";
import test from "node:test";

import { decideOpen } from "./open-decision.ts";

test("only DRM is refused before the engine opens", () => {
  assert.equal(decideOpen("drm"), false);
  assert.equal(decideOpen("font-obfuscation"), true);
  assert.equal(decideOpen("none"), true);
});
