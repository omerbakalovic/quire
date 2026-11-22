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

test("accepts the reading messages and cleans their fields", () => {
  assert.deepEqual(
    parseReaderMessage(
      JSON.stringify({
        type: "relocate",
        id: "b1",
        cfi: "epubcfi(/6/4!/4/2)",
        fraction: 0.5,
        tocLabel: "Letter I",
        sectionIndex: "3",
        sectionCount: 38,
      }),
    ),
    {
      type: "relocate",
      id: "b1",
      cfi: "epubcfi(/6/4!/4/2)",
      fraction: 0.5,
      tocLabel: "Letter I",
      sectionIndex: null,
      sectionCount: 38,
    },
  );
  assert.equal(parseReaderMessage('{"type":"relocate","id":"b1","cfi":""}'), null);
  assert.deepEqual(parseReaderMessage('{"type":"tap","id":"b1","zone":"center"}'), {
    type: "tap",
    id: "b1",
    zone: "center",
  });
  assert.equal(parseReaderMessage('{"type":"tap","id":"b1","zone":"left"}'), null);
  const opened = parseReaderMessage(
    JSON.stringify({ type: "opened", id: "b1", title: 7, sections: 4, toc: [{ label: "One", depth: 99 }, null] }),
  );
  assert.deepEqual(opened, {
    type: "opened",
    id: "b1",
    title: null,
    sections: 4,
    toc: [{ label: "One", href: null, depth: 10 }],
    openMs: null,
  });
  assert.deepEqual(parseReaderMessage('{"type":"failed","id":"b1"}'), {
    type: "failed",
    id: "b1",
    error: "unknown error",
  });
});
