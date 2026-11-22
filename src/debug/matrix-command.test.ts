import assert from "node:assert/strict";
import { test } from "node:test";

import { parseMatrixCommand, readerDebug, setReaderDebug } from "./matrix-command.ts";

test("matrix commands parse only known shapes", () => {
  assert.deepEqual(parseMatrixCommand('{"seq":1,"cmd":"hello"}'), { seq: 1, cmd: "hello" });
  assert.deepEqual(parseMatrixCommand('{"seq":2,"cmd":"open","id":"abc_12"}'), { seq: 2, cmd: "open", id: "abc_12" });
  assert.equal(parseMatrixCommand('{"seq":2,"cmd":"open","id":"../x"}'), null);
  assert.equal(parseMatrixCommand('{"seq":-1,"cmd":"hello"}'), null);
  assert.equal(parseMatrixCommand('{"seq":1.5,"cmd":"hello"}'), null);
  assert.equal(parseMatrixCommand('{"seq":1,"cmd":"rm"}'), null);
  assert.equal(parseMatrixCommand("not json"), null);
  assert.equal(parseMatrixCommand('{"seq":3,"cmd":"settings","tapZones":"sideways"}'), null);
  assert.deepEqual(parseMatrixCommand('{"seq":4,"cmd":"reader","action":"find-notes","args":{"min":3}}'), {
    seq: 4,
    cmd: "reader",
    action: "find-notes",
    args: { min: 3 },
  });
  assert.equal(parseMatrixCommand('{"seq":5,"cmd":"reader","action":"Bad Action"}'), null);
  assert.deepEqual(parseMatrixCommand('{"seq":6,"cmd":"reader","action":"state","args":[1]}'), {
    seq: 6,
    cmd: "reader",
    action: "state",
    args: {},
  });
});

test("only the latest reader screen receives reader commands", async () => {
  const offA = setReaderDebug("a", async () => "a");
  const offB = setReaderDebug("b", async () => "b");
  offA();
  assert.equal(readerDebug()?.id, "b");
  offB();
  assert.equal(readerDebug(), null);
});
