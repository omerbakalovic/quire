import assert from "node:assert/strict";
import test from "node:test";

import { parseReaderMessage } from "./protocol.ts";

test("accepts a pong with an id", () => {
  assert.deepEqual(parseReaderMessage('{"type":"pong","id":"bridge-1"}'), {
    type: "pong",
    id: "bridge-1",
  });
});

test("rejects anything that is not a pong", () => {
  assert.equal(parseReaderMessage('{"type":"ping","id":"x"}'), null);
  assert.equal(parseReaderMessage('{"type":"pong"}'), null);
  assert.equal(parseReaderMessage("not json"), null);
});
