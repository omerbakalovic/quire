import assert from "node:assert/strict";
import { test } from "node:test";

import { EMPTY_SPEED, formatDuration, recordTurn, speedOf, timeLeft, type Turn } from "./reading-speed.ts";

const turn = (at: number, page: number, fraction: number, section = 3): Turn => ({ at: at * 1000, section, page, fraction });

test("speed comes from one-page forward turns at reading pace", () => {
  let state = EMPTY_SPEED;
  state = recordTurn(state, turn(0, 1, 0.1));
  state = recordTurn(state, turn(30, 2, 0.101));
  state = recordTurn(state, turn(60, 3, 0.102));
  assert.equal(speedOf(state).secondsPerPage, null, "two samples are too few");
  state = recordTurn(state, turn(62, 4, 0.103)); // a skim: left out
  state = recordTurn(state, turn(100, 5, 0.104));
  state = recordTurn(state, turn(1000, 6, 0.105)); // a break: left out
  state = recordTurn(state, turn(1040, 8, 0.107)); // a jump: left out
  state = recordTurn(state, turn(1070, 1, 0.108, 4)); // a new chapter: left out
  assert.deepEqual(state.perPage, [30, 30, 38]);
  const speed = speedOf(state);
  assert.equal(speed.secondsPerPage, 30);
  assert.ok(Math.abs((speed.secondsPerBook ?? 0) - 30_000) < 1);
});

test("time left uses the pages left in the chapter and the rest of the book", () => {
  const speed = { secondsPerPage: 30, secondsPerBook: 30_000 };
  assert.deepEqual(timeLeft(speed, { page: 4, pages: 10, fraction: 0.5 }), { chapter: 180, book: 15_000 });
  assert.deepEqual(timeLeft(speed, { page: null, pages: null, fraction: null }), { chapter: null, book: null });
  assert.deepEqual(timeLeft({ secondsPerPage: null, secondsPerBook: null }, { page: 4, pages: 10, fraction: 0.5 }), { chapter: null, book: null });
});

test("durations read in minutes and hours", () => {
  assert.equal(formatDuration(20), "<1 min");
  assert.equal(formatDuration(180), "3 min");
  assert.equal(formatDuration(3600), "1 h");
  assert.equal(formatDuration(7500), "2 h 5 min");
});
