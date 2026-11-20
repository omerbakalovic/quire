import assert from "node:assert/strict";
import test from "node:test";

import { parseReaderMessage } from "./protocol.ts";

test("accepts a pong with an id", () => {
  assert.deepEqual(parseReaderMessage('{"type":"pong","id":"bridge-1"}'), {
    type: "pong",
    id: "bridge-1",
  });
});

test("rejects anything that is not a reader message", () => {
  assert.equal(parseReaderMessage('{"type":"ping","id":"x"}'), null);
  assert.equal(parseReaderMessage('{"type":"pong"}'), null);
  assert.equal(parseReaderMessage("not json"), null);
  assert.equal(parseReaderMessage('{"type":"result","id":"x","report":{}}'), null);
});

test("accepts an encryption excerpt and a check result", () => {
  assert.deepEqual(parseReaderMessage('{"type":"encryption","id":"drm","xml":null}'), {
    type: "encryption",
    id: "drm",
    xml: null,
  });
  assert.deepEqual(
    parseReaderMessage('{"type":"first","id":"font","report":{"engineOpened":true}}'),
    { type: "first", id: "font", report: { engineOpened: true } },
  );
  assert.deepEqual(
    parseReaderMessage('{"type":"result","id":"scripted","report":{"engineOpened":true,"scriptRan":false}}'),
    {
      type: "result",
      id: "scripted",
      report: { engineOpened: true, scriptRan: false },
    },
  );
});
