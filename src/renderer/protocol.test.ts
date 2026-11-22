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
      tocHref: null,
      sectionIndex: null,
      sectionFraction: null,
      sectionCount: 38,
      sinceTapMs: null,
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
    toc: [{ label: "One", href: null, depth: 10, section: null, fraction: null }],
    openMs: null,
    rangeRequests: null,
    restored: false,
    restoredFrom: null,
  });
  assert.deepEqual(
    parseReaderMessage(
      JSON.stringify({ type: "relocate", id: "b1", cfi: "epubcfi(/6/4)", tocHref: "c1.xhtml", sectionIndex: 1, sectionFraction: 0.25 }),
    ),
    {
      type: "relocate",
      id: "b1",
      cfi: "epubcfi(/6/4)",
      fraction: null,
      tocLabel: null,
      tocHref: "c1.xhtml",
      sectionIndex: 1,
      sectionFraction: 0.25,
      sectionCount: null,
      sinceTapMs: null,
    },
  );
  const restoredOpen = parseReaderMessage(JSON.stringify({ type: "opened", id: "b1", restored: true, restoredFrom: "section" }));
  assert.equal(restoredOpen?.type === "opened" && restoredOpen.restoredFrom, "section");
  const oddOpen = parseReaderMessage(JSON.stringify({ type: "opened", id: "b1", restoredFrom: "elsewhere" }));
  assert.equal(oddOpen?.type === "opened" && oddOpen.restoredFrom, null);
  assert.deepEqual(parseReaderMessage('{"type":"back-stack","id":"b1","depth":2.7,"label":"Two"}'), {
    type: "back-stack",
    id: "b1",
    depth: 2,
    label: "Two",
  });
  assert.deepEqual(parseReaderMessage('{"type":"back-stack","id":"b1","depth":-4}'), {
    type: "back-stack",
    id: "b1",
    depth: 0,
    label: null,
  });
  assert.deepEqual(parseReaderMessage('{"type":"failed","id":"b1"}'), {
    type: "failed",
    id: "b1",
    error: "unknown error",
  });
});
