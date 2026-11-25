#!/usr/bin/env node
/**
 * The M1b phone matrix as one command, for a debug build on an Android phone
 * over USB. It drives the app through the debug-only command channel
 * (files/quire-cmd/, see src/debug/MatrixChannel.tsx), taps the page for real
 * with `adb shell input`, and reads the answers and the reader's own
 * measurements from files/quire-report.jsonl.
 *
 *   npm run phone-matrix -- [--quick] [--fresh] [--only frank,arabic]
 *     [--skip-books] [--skip-notes] [--skip-taps] [--skip-lifecycle]
 *     [--background-s 90] [--apk-reader] [--serial SERIAL] [--adb PATH] [--out DIR]
 *     [--package ID] [--stall-s 90] [--wait-you-s 300]
 *     [--phone] [--avd quire] [--keep-emulator] [--install]
 *
 * Before it: the debug APK is built, Metro runs (`npx expo start`), and the
 * books are downloaded (`npm run books`).
 *
 * It drives an emulator by default, so the person's phone stays free: a running
 * one, or the "quire" AVD started without a window and stopped at the end. On
 * an emulator a missing Quire Dev is installed from android/app/build (--install
 * reinstalls it anywhere). --phone drives the phone on USB, for a short final pass.
 *
 * --quick checks a fix in a few minutes: five books that cover the usual
 * breakage, notes in two of them, the tap setting, no lifecycle. Run the full
 * matrix before closing a milestone.
 * --fresh clears the app's data and imports every book again. Only needed when
 * import code changed; a reinstall keeps the library.
 * The reader page is rebuilt from this checkout and pushed to the debug build,
 * so reader-page changes need no gradle build (app code comes from Metro).
 * --apk-reader tests the reader page built into the APK instead.
 *
 * Output goes to ../quire-matrix/run-<time>/ unless --out says otherwise:
 * screenshots per book, summary.md, index.html, results.json and the app's
 * report.jsonl. The exit code is 1 when a check fails.
 *
 * Stalls: a watchdog says what is wrong instead of waiting silently. After 30 s
 * with no output it prints a heartbeat; status.json in the output folder always
 * says which step it is on. Before each tap or swipe it checks the window in
 * front and pauses ("PAUSED") while the notification shade, a prompt or another
 * app is over Quire. After --stall-s of no progress it diagnoses adb, the phone,
 * Metro and the app (scripts/phone-health.mjs, also `npm run phone-doctor`),
 * fixes what a script can, gives up that step and goes on ("RETRY"). A second
 * stall, or something only a person can fix that stays for --wait-you-s, ends
 * the run with "STALLED" and "NEEDS YOU" / "NEEDS PC" lines and exit code 3.
 * Report those lines to the person at once.
 * While it runs the PC is kept awake (no power settings change).
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readdirSync, readFileSync, statSync } from "node:fs";
import * as zlib from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import { autoFix, classifyFocus, describe, diagnose, adbRunner, findAdb as sdkAdb, keepAwake, needs } from "./phone-health.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const { values: opts } = parseArgs({
  options: {
    quick: { type: "boolean", default: false },
    fresh: { type: "boolean", default: false },
    "apk-reader": { type: "boolean", default: false },
    only: { type: "string" },
    "skip-books": { type: "boolean", default: false },
    "skip-notes": { type: "boolean", default: false },
    "skip-taps": { type: "boolean", default: false },
    "skip-lifecycle": { type: "boolean", default: false },
    "background-s": { type: "string", default: "90" },
    "stall-s": { type: "string", default: "90" },
    "wait-you-s": { type: "string", default: "300" },
    package: { type: "string", default: "app.quire.reader.dev" },
    phone: { type: "boolean", default: false },
    avd: { type: "string", default: "quire" },
    "keep-emulator": { type: "boolean", default: false },
    install: { type: "boolean", default: false },
    serial: { type: "string" },
    adb: { type: "string" },
    out: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
});

// Debug builds install as app.quire.reader.dev ("Quire Dev", plugins/withDevVariant.js),
// beside the everyday release app, so a run never touches the reader's own library.
// --package app.quire.reader drives a debug build from before that split.
const PKG = opts.package;
const ACTIVITY = `${PKG}/app.quire.reader.MainActivity`;
const REPORT = "files/quire-report.jsonl";
const COMMANDS = "files/quire-cmd";
const EXTERNAL = `/sdcard/Android/data/${PKG}/files`;
const DEV_READER = "files/quire-dev";
const deflate = promisify(zlib.deflate);

// --quick: the books that catch most breakage, in a few minutes.
const QUICK = ["frankenstein", "arabic", "sous-le-vent", "noteref", "pmd-link"];

// Each book is here for a reason; the reason is printed in the summary.
const CATALOG = [
  { file: "se-frankenstein.epub", dir: "downloaded", why: "baseline, restore and lifecycle", key: "frankenstein" },
  { file: "pg1342.epub", dir: "downloaded", why: "plain Gutenberg EPUB" },
  { file: "pg2600.epub", dir: "downloaded", why: "367 sections" },
  { file: "pg1184-images.epub", dir: "downloaded", why: "81 MB with images", openTimeoutMs: 180000 },
  { file: "moby-dick.epub", dir: "downloaded", why: "IDPF sample" },
  { file: "wasteland.epub", dir: "downloaded", why: "IDPF sample with notes", notes: true },
  { file: "georgia-cfi.epub", dir: "downloaded", why: "IDPF CFI sample" },
  { file: "regime-anticancer-arabic.epub", dir: "downloaded", why: "right to left", key: "arabic" },
  { file: "kusamakura-japanese-vertical-writing.epub", dir: "downloaded", why: "vertical writing" },
  { file: "sous-le-vent.epub", dir: "downloaded", why: "fixed layout" },
  { file: "noteref.epub", dir: "fixtures", why: "every kind of note", notes: true },
  { file: "malformed.epub", dir: "fixtures", why: "broken markup" },
  { file: "drm.epub", dir: "fixtures", why: "DRM, must be refused", expect: "drm" },
  { file: "scripted.epub", dir: "fixtures", why: "scripts must not run" },
  { file: "font-obfuscation.epub", dir: "fixtures", why: "obfuscated fonts" },
  {
    file: "Moby-Dick.Power.foot.-.Herman.Melville.epub",
    as: "pmd-foot.epub",
    dir: "mine",
    why: "Power Moby-Dick, popup footnotes",
    notes: true,
    optional: true,
    openTimeoutMs: 120000,
  },
  {
    file: "Moby-Dick.Power.link.-.Herman.Melville.epub",
    as: "pmd-link.epub",
    dir: "mine",
    why: "Power Moby-Dick, linked notes",
    notes: true,
    optional: true,
    openTimeoutMs: 120000,
  },
];


if (opts.help) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
  process.exit(0);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const stem = (name) => name.replace(/\.epub$/i, "").replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 48);
let lastOutput = Date.now();
const print = (...parts) => {
  lastOutput = Date.now();
  console.log(new Date().toLocaleTimeString(), ...parts);
};
// Code left running in a step the watchdog gave up on stays quiet.
const say = (...parts) => {
  if (abandoned()) return;
  progress();
  print(...parts);
};

function findAdb() {
  return sdkAdb(opts.adb);
}

const ADB = findAdb();
let serial = opts.serial ?? process.env.ANDROID_SERIAL ?? null;

function adb(args, { buffer = false, timeout = 60000 } = {}) {
  alive();
  const full = serial ? ["-s", serial, ...args] : args;
  return new Promise((done, fail) => {
    execFile(
      ADB,
      full,
      { encoding: buffer ? "buffer" : "utf8", maxBuffer: 256 * 1024 * 1024, timeout, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          error.message = `adb ${args.join(" ")}: ${error.message} ${String(stderr ?? "").trim()}`;
          fail(error);
        } else done(stdout);
      },
    );
  });
}

/**
 * One long-lived `adb shell` for many commands. Starting adb.exe costs 100 to
 * 300 ms on Windows, and a run sends well over a thousand commands; through an
 * open shell each one costs a few milliseconds. Each command is followed by a
 * marker that carries its exit code, which is how its output is cut out.
 */
class OpenShell {
  #proc = null;
  #buf = Buffer.alloc(0);
  #queue = Promise.resolve();
  #n = 0;
  #wake = null;
  #closed = true;

  constructor(name, command) {
    this.name = name;
    this.command = command;
  }

  #start() {
    const args = [...(serial ? ["-s", serial] : []), "shell", "-T", ...this.command];
    const proc = spawn(ADB, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    this.#proc = proc;
    this.#buf = Buffer.alloc(0);
    this.#closed = false;
    proc.stdout.on("data", (chunk) => {
      this.#buf = this.#buf.length ? Buffer.concat([this.#buf, chunk]) : chunk;
      this.#wake?.();
    });
    proc.stderr.on("data", () => {});
    proc.stdin.on("error", () => {});
    proc.on("error", () => {});
    proc.on("exit", () => {
      if (this.#proc === proc) this.#closed = true;
      this.#wake?.();
    });
  }

  run(command, { timeout = 60000, buffer = false } = {}) {
    const job = this.#queue.then(() => this.#exec(command, timeout)).then((out) => (buffer ? out : out.toString("utf8")));
    this.#queue = job.catch(() => {});
    return job;
  }

  async #exec(command, timeout) {
    if (this.#closed) this.#start();
    const n = ++this.#n;
    const marker = Buffer.from(`\n__QM_${n}_`);
    // stdin is the command stream: nothing a command runs may read it.
    this.#proc.stdin.write(`{ ${command}\n} </dev/null\nprintf '\\n__QM_${n}_%s__\\n' "$?"\n`);
    const end = Date.now() + timeout;
    for (;;) {
      const at = this.#buf.indexOf(marker);
      const close = at >= 0 ? this.#buf.indexOf("__\n", at + marker.length) : -1;
      if (close >= 0) {
        const code = Number(this.#buf.subarray(at + marker.length, close).toString());
        const out = this.#buf.subarray(0, at);
        this.#buf = this.#buf.subarray(close + 3);
        if (code !== 0) throw new Error(`${this.name}: exit ${code} from ${command.slice(0, 160)}: ${out.toString("utf8").slice(0, 300)}`);
        return out;
      }
      if (this.#closed) throw new Error(`${this.name}: adb shell closed during ${command.slice(0, 160)}`);
      if (Date.now() > end) {
        this.close();
        throw new Error(`${this.name}: no answer within ${timeout} ms to ${command.slice(0, 160)}`);
      }
      await new Promise((done) => {
        this.#wake = done;
        setTimeout(done, Math.min(250, Math.max(1, end - Date.now())));
      });
      this.#wake = null;
    }
  }

  close() {
    const proc = this.#proc;
    this.#proc = null;
    this.#closed = true;
    try {
      proc?.stdin.end();
      proc?.kill();
    } catch {
      // already gone
    }
  }
}

let plainShell = null;
let appShell = null;

/** Open the two shells, or keep using one adb process per command when they do not work here. */
async function openShells() {
  const plain = new OpenShell("shell", []);
  const app = new OpenShell("run-as", ["run-as", PKG, "sh"]);
  try {
    const a = await plain.run("echo quire-ok", { timeout: 8000 });
    const b = await app.run("echo quire-ok", { timeout: 8000 });
    if (a.trim() !== "quire-ok" || b.trim() !== "quire-ok") throw new Error(`unexpected echo: ${a.trim()} / ${b.trim()}`);
    plainShell = plain;
    appShell = app;
    say("adb: commands go through two open shells");
  } catch (error) {
    plain.close();
    app.close();
    say(`adb: open shells did not work (${error.message}); starting adb per command, which is slower`);
  }
}

function closeShells() {
  plainShell?.close();
  appShell?.close();
}

let usbDrops = 0;
let reconnecting = null;

/**
 * After an adb failure: is the phone still there? When it dropped off USB, wait
 * for it (a loose cable is common), restore `adb reverse` for Metro and reopen
 * the shells. Resolves true when the phone had gone and is back, false when it
 * never left (the failure was something else). Ends the run if it stays away.
 */
function deviceBack(reason) {
  reconnecting ??= (async () => {
    let hung = false;
    const present = await (healthAdb ?? adb)(["get-state"], { timeout: 8000 })
      .then((out) => out.trim() === "device")
      .catch((error) => {
        hung = Boolean(error.timedOut);
        return false;
      });
    if (present) return false;
    if (hung) {
      // adb itself stopped answering, which is not the cable: restart its server.
      print("adb stopped answering; restarting the adb server (a scrcpy mirror closes with it)");
      plainShell?.close();
      appShell?.close();
      await autoFix([{ id: "adb-hung", who: "auto" }], { adb: healthAdb, pkg: PKG });
      const back = await healthAdb(["get-state"], { timeout: 8000 }).catch(() => "");
      if (back.trim() === "device") {
        await adb(["reverse", "tcp:8081", "tcp:8081"]).catch(() => {});
        print("adb answers again; continuing");
        return true;
      }
    }
    usbDrops++;
    print(`the phone dropped off USB (${reason.slice(0, 120)}); waiting up to ${WAIT_YOU_MS / 1000} s for it`);
    print("NEEDS YOU: Plug the phone back in (the cable or port is loose)");
    plainShell?.close();
    appShell?.close();
    watch.waiting = "the phone is off USB";
    try {
      await adb(["wait-for-device"], { timeout: WAIT_YOU_MS });
    } catch {
      throw new Fatal(`the phone dropped off USB and did not come back within ${WAIT_YOU_MS / 1000} s`);
    } finally {
      watch.waiting = null;
    }
    await adb(["reverse", "tcp:8081", "tcp:8081"]).catch(() => {});
    say("the phone is back; continuing");
    return true;
  })().finally(() => {
    reconnecting = null;
  });
  return reconnecting;
}

/** Run an adb step; if it failed because the phone dropped off USB, wait for it and fail only this step. */
async function onDevice(step) {
  alive();
  try {
    return await step();
  } catch (error) {
    if (error instanceof Fatal) throw error;
    if (await deviceBack(error.message)) {
      const lost = new Error(`the phone dropped off USB here (${error.message.slice(0, 120)}); it came back and the run went on`);
      lost.recovered = true;
      throw lost;
    }
    throw error;
  }
}

const shell = (command, options) => onDevice(() => (plainShell ? plainShell.run(command, options) : adb(["shell", command], options)));

/** A command in the app's own files, as the app user. No single quotes inside. */
function runAs(command, options) {
  if (command.includes("'")) throw new Error(`run-as command must not contain a single quote: ${command}`);
  return onDevice(() => (appShell ? appShell.run(command, options) : adb(["shell", `run-as ${PKG} sh -c '${command}'`], options)));
}

// `cmd input` talks to the input service directly; `input` starts a Java VM
// for every tap, which costs a few hundred ms. Chosen once at the start.
let INPUT = "input";

async function pickInput() {
  try {
    // KEYCODE_UNKNOWN does nothing, so this only asks whether `cmd input` exists here.
    const out = await shell("cmd input keyevent 0 2>&1");
    if (!/no shell command|can.t find service|unknown command|usage|exception|error/i.test(out)) INPUT = "cmd input";
  } catch {
    // keep `input`
  }
  say(`input: ${INPUT}`);
}

const b64 = (text) => Buffer.from(text, "utf8").toString("base64");

/**
 * files/quire-report.jsonl. Each poll reads the file and keeps what is past the
 * last complete line seen. The log is cleared at the start of a run, so it stays
 * a few hundred KB, which adb moves in a few tens of milliseconds.
 */
class Log {
  offset = 0;
  lines = [];

  reset() {
    this.offset = 0;
    this.lines = [];
  }

  async clear() {
    await runAs(`: > ${REPORT}`);
    this.reset();
  }

  async poll() {
    let chunk;
    try {
      if (appShell) {
        // Only the bytes past what was read before. The first line is the file's size,
        // which tells a log cleared by someone else from one that did not grow.
        const out = await appShell.run(
          `s=$(stat -c %s ${REPORT} 2>/dev/null || echo 0); echo $s; if [ $s -gt ${this.offset} ]; then tail -c +${this.offset + 1} ${REPORT}; fi`,
          { buffer: true, timeout: 10000 },
        );
        const newline = out.indexOf(0x0a);
        const size = Number(out.subarray(0, newline).toString());
        if (size < this.offset) {
          this.offset = 0;
          return;
        }
        chunk = out.subarray(newline + 1);
      } else {
        const whole = await adb(["exec-out", `run-as ${PKG} cat ${REPORT}`], { buffer: true });
        if (whole.length < this.offset) this.offset = 0;
        chunk = whole.subarray(this.offset);
      }
    } catch (error) {
      // A phone that dropped off USB is waited for; the wait for the answer goes on after.
      await deviceBack(error.message);
      return;
    }
    const end = chunk.lastIndexOf(0x0a);
    if (end < 0) return;
    const complete = chunk.subarray(0, end + 1);
    this.offset += complete.length;
    progress();
    for (const line of complete.toString("utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        this.lines.push(JSON.parse(line));
      } catch {
        this.lines.push({ unparsed: line });
      }
    }
  }

  mark() {
    return this.lines.length;
  }

  since(from) {
    return this.lines.slice(from);
  }

  async waitFor(match, { from = 0, timeout = 10000 } = {}) {
    const end = Date.now() + timeout;
    let checked = from;
    for (;;) {
      for (; checked < this.lines.length; checked++) if (match(this.lines[checked])) return this.lines[checked];
      if (Date.now() > end) return null;
      await this.poll();
      if (checked >= this.lines.length) await sleep(appShell ? 40 : 200);
    }
  }
}

const log = new Log();
let seq = 0;

/** The run cannot go on: the app is gone and does not come back. Every routine passes it up. */
class Fatal extends Error {}

const passFatal = (error) => {
  if (error instanceof Fatal) throw error;
};

/*
 * Stall watchdog. Every routine runs inside guard(). Every 5 s the watchdog
 * looks at when anything last moved: a check, a console line, a line from the
 * app. After --stall-s of nothing it looks at the phone, Metro and the app
 * (phone-health.mjs), fixes what a script can (wake the screen, bring the app
 * back, restart adb, restore adb reverse), abandons the stuck step and goes on.
 * That is the one retry. A second stall before any check passes again, a
 * problem only the PC can fix (Metro), or one only a person can fix that is
 * still there after --wait-you-s ends the run with STALLED and NEEDS lines and
 * exit code 3. After 30 s of silence it prints a heartbeat, and status.json in
 * the output folder always says where the run is.
 */
const STALL_MS = Math.max(20, Number(opts["stall-s"]) || 90) * 1000;
const WAIT_YOU_MS = Math.max(10, Number(opts["wait-you-s"]) || 300) * 1000;
const frames = new AsyncLocalStorage();
const watch = {
  state: "running",
  step: "starting",
  stepSince: Date.now(),
  last: Date.now(),
  allow: 0,
  allowWhy: "",
  waiting: null,
  frame: null,
  stalls: 0,
  passedSinceStall: true,
  busy: false,
  stalled: null,
  timer: null,
};
let healthAdb = null;

/** A step that stalled and was given up; the run goes on without it. */
class StallError extends Error {
  recovered = true;
}

/** Code that kept running inside an abandoned step. It stops at its next phone command. */
class Abandoned extends Error {}

function progress() {
  watch.last = Date.now();
}

function abandoned() {
  for (let frame = frames.getStore(); frame; frame = frame.parent) if (frame.dead) return frame;
  return null;
}

function alive() {
  const frame = abandoned();
  if (frame) throw new Abandoned(`"${frame.label}" was abandoned after a stall`);
}

/** Runs one routine as a watched step, which the watchdog can abandon. */
function guard(label, fn) {
  const parent = frames.getStore() ?? null;
  return new Promise((resolve, reject) => {
    const frame = { label, parent, dead: false, reject };
    watch.frame = frame;
    watch.step = label;
    watch.stepSince = Date.now();
    progress();
    frames.run(frame, () => Promise.resolve().then(fn)).then(
      (value) => {
        leave(frame);
        resolve(value);
      },
      (error) => {
        if (error instanceof Fatal) watch.fatalStep ??= label;
        leave(frame);
        reject(error);
      },
    );
  });
}

function leave(frame) {
  if (watch.frame !== frame) return;
  watch.frame = frame.parent;
  watch.step = frame.parent?.label ?? "finishing";
}

/** A wait that is expected to be long and silent: a first Metro bundle, a big import, the app sent to the background on purpose. */
async function quietly(ms, why, fn) {
  const before = [watch.allow, watch.allowWhy];
  watch.allow = ms;
  watch.allowWhy = why;
  progress();
  try {
    return await fn();
  } finally {
    [watch.allow, watch.allowWhy] = before;
    progress();
  }
}

const secondsSince = (t) => Math.round((Date.now() - t) / 1000);

async function writeStatus() {
  if (!OUT) return;
  const status = {
    state: watch.state,
    step: watch.step,
    stepSeconds: secondsSince(watch.stepSince),
    quietSeconds: secondsSince(watch.last),
    waitingFor: watch.waiting,
    checks: results.checks.length,
    failed: results.checks.filter((c) => c.pass === false).length,
    stalls: watch.stalls,
    stalled: watch.stalled,
    updated: new Date().toISOString(),
  };
  await writeFile(join(OUT, "status.json"), JSON.stringify(status, null, 2)).catch(() => {});
}

function startWatchdog() {
  watch.timer = setInterval(() => void tick(), 5000);
}

function stopWatchdog(state) {
  clearInterval(watch.timer);
  watch.state = state;
  return writeStatus();
}

async function tick() {
  if (watch.busy || watch.state !== "running") return;
  const quiet = Date.now() - watch.last;
  if (Date.now() - lastOutput >= 30000) {
    const what = watch.waiting ? `paused, ${watch.waiting}` : watch.allow ? watch.allowWhy : `on "${watch.step}"`;
    print(`· still ${what}: ${secondsSince(watch.stepSince)} s in this step, ${Math.round(quiet / 1000)} s since anything moved`);
  }
  void writeStatus();
  if (watch.waiting || quiet < Math.max(STALL_MS, watch.allow)) return;
  watch.busy = true;
  try {
    await onStall(Math.round(quiet / 1000));
  } catch (error) {
    print(`the watchdog itself failed: ${error.message}`);
  } finally {
    watch.busy = false;
    progress();
  }
}

async function onStall(quietS) {
  const frame = watch.frame;
  const where = watch.step;
  print(`STALL: nothing moved for ${quietS} s in "${where}". Looking at the phone, Metro and the app.`);
  let found = await diagnose({ adb: healthAdb, pkg: PKG });
  for (const line of describe(found.problems)) print(`  ${line}`);
  const again = watch.stalls > 0 && !watch.passedSinceStall;
  watch.stalls++;
  watch.passedSinceStall = false;
  results.stalls.push({ step: where, quietS, facts: found.facts, problems: found.problems.map((p) => `[${p.who}] ${p.what}`) });
  if (again) return stop(where, "it stalled again before any check passed", found.problems);
  if (found.problems.some((p) => p.who === "pc")) return stop(where, "the PC has to fix this", found.problems);
  if (found.problems.some((p) => p.who === "you")) {
    found = await waitForPerson(found.problems);
    if (found.problems.some((p) => p.who !== "auto")) return stop(where, `nobody fixed it within ${WAIT_YOU_MS / 1000} s`, found.problems);
  }
  const fixes = await autoFix(found.problems, { adb: healthAdb, pkg: PKG, activity: ACTIVITY });
  // A command stuck in an open shell holds up everything queued behind it; new shells start clean.
  plainShell?.close();
  appShell?.close();
  print(`RETRY: ${fixes.length ? `${fixes.join(", ")}; ` : ""}giving up "${where}" and going on.`);
  const why = found.problems.length ? found.problems.map((p) => p.what).join("; ") : "the phone, Metro and the app looked fine";
  abandon(frame, new StallError(`stalled for ${quietS} s (${why}); the step was given up and the run went on`));
}

/**
 * Something only a person can fix is on the phone (a prompt, the shade, a
 * locked screen, a loose cable). Say so at once, then look again every 5 s.
 * A problem with lateFix (the shade) is fixed by the script after that long.
 */
async function waitForPerson(problems) {
  const start = Date.now();
  let found = { problems };
  let said = 0;
  watch.waiting = problems.filter((p) => p.who === "you").map((p) => p.what).join("; ");
  try {
    while (Date.now() - start < WAIT_YOU_MS) {
      if (Date.now() - said >= 60000) {
        for (const line of needs(found.problems)) print(line);
        said = Date.now();
      }
      const late = found.problems.filter((p) => p.lateFix && Date.now() - start >= p.lateFix);
      if (late.length) {
        const fixes = await autoFix(late.map((p) => ({ ...p, forceFix: true })), { adb: healthAdb, pkg: PKG, activity: ACTIVITY });
        print(`nobody closed it, so the script did: ${fixes.join(", ")}`);
      }
      await sleep(5000);
      found = await diagnose({ adb: healthAdb, pkg: PKG });
      if (!found.problems.some((p) => p.who !== "auto")) {
        print("the phone is clear again; going on");
        return found;
      }
      watch.waiting = found.problems.filter((p) => p.who !== "auto").map((p) => p.what).join("; ");
    }
    return found;
  } finally {
    watch.waiting = null;
  }
}

function abandon(frame, error) {
  if (!frame) return;
  frame.dead = true;
  leave(frame);
  frame.reject(error);
}

/** Ends the run: the stuck step and everything around it are abandoned and the results so far are written. */
function stop(where, why, problems) {
  const lines = needs(problems);
  watch.stalled = {
    step: where,
    why,
    problems: problems.map((p) => `[${p.who}] ${p.what}`),
    needs: lines.length ? lines : ["NEEDS PC: nothing wrong was found on the phone; look at the console and the last screenshots"],
  };
  print(`STALLED: "${where}": ${why}.`);
  for (const line of watch.stalled.needs) print(line);
  let root = watch.frame;
  while (root?.parent) root = root.parent;
  if (!root) return;
  root.dead = true;
  watch.frame = null;
  root.reject(new Fatal(`stalled in "${where}": ${why}`));
}

/*
 * The window in front, watched all the time through its own adb shell, so a
 * tap or swipe never lands on the notification shade, a prompt or another
 * app. Before each input the script looks at the latest answer (at most about
 * a second old); when something is in the way it pauses until it is gone.
 */
const front = { shell: null, running: false, focus: "", at: 0 };

async function startFrontWatch() {
  front.shell = new OpenShell("focus", []);
  front.running = true;
  void (async () => {
    while (front.running) {
      try {
        front.focus = (await front.shell.run("dumpsys window | grep -m1 'mCurrentFocus='; true", { timeout: 5000 })).trim();
        front.at = Date.now();
      } catch {
        front.at = 0;
        await sleep(1000);
      }
      await sleep(400);
    }
  })();
}

function stopFrontWatch() {
  front.running = false;
  front.shell?.close();
}

async function frontNow() {
  if (Date.now() - front.at > 1500) {
    front.focus = (await shell("dumpsys window | grep -m1 'mCurrentFocus='; true", { timeout: 8000 }).catch(() => "")).trim();
    front.at = Date.now();
  }
  return classifyFocus(front.focus, PKG);
}

/** Waits until the app is in front and nothing is over it. */
async function clearFront() {
  if (!front.running) return;
  let found = await frontNow();
  if (!found) return;
  const start = Date.now();
  let said = false;
  let fixed = false;
  try {
    // On Android 12 and later the lock screen is the shade's window, so ask once what it really is.
    const looked = await diagnose({ adb: healthAdb, pkg: PKG, metro: false, needApp: false });
    if (looked.problems.some((p) => p.id === "asleep" && p.who === "auto")) {
      await autoFix(looked.problems.filter((p) => p.id === "asleep"), { adb: healthAdb, pkg: PKG });
      await sleep(1000);
      front.at = 0;
      found = await frontNow();
      if (!found) return;
    }
    found = looked.problems.find((p) => p.id === "locked" || (p.id === "asleep" && p.who === "you")) ?? found;
    for (;;) {
      if (found.id === "anr") {
        await autoFix([found], { adb: healthAdb, pkg: PKG, activity: ACTIVITY });
        const error = new Error(`${found.what}; restarted the app`);
        error.recovered = true;
        throw error;
      }
      const waited = Date.now() - start;
      // Another app in front: give a person 15 s, then bring the app back. The shade: a minute, then close it.
      const late = found.id === "other-app" ? 15000 : found.lateFix;
      if (late && waited >= late && !fixed) {
        const fixes = await autoFix([{ ...found, forceFix: true }], { adb: healthAdb, pkg: PKG, activity: ACTIVITY });
        print(`${found.what} for ${secondsSince(start)} s; ${fixes.join(", ") || "nothing a script can do"}`);
        fixed = true;
        await sleep(1200);
        front.at = 0;
      } else if (waited >= WAIT_YOU_MS) {
        throw new Fatal(`${found.what}, and it was still there after ${WAIT_YOU_MS / 1000} s`);
      } else if (!said) {
        print(`PAUSED: ${found.what}. The run waits and goes on by itself once it is gone.`);
        if (found.who === "you") for (const line of needs([found])) print(line);
        said = true;
        watch.waiting = found.what;
      }
      await sleep(500);
      const now = await frontNow();
      if (!now && (found.id !== "locked" || !(await diagnose({ adb: healthAdb, pkg: PKG, metro: false, needApp: false })).problems.some((p) => p.id === "locked"))) {
        if (said) print("the app is in front again; going on");
        return;
      }
      if (now && now.id !== found.id && found.id !== "locked") found = now;
    }
  } finally {
    if (said) watch.waiting = null;
  }
}

/** Every tap, swipe and key the script sends goes through here. */
async function input(args) {
  await clearFront();
  return shell(`${INPUT} ${args}`);
}

let recoveries = 0;

/** One command through files/quire-cmd/, answered by one "matrix" line in the report. */
async function send(cmd, fields = {}, { timeout = 15000, recover = true } = {}) {
  const id = ++seq;
  const name = String(id).padStart(8, "0");
  const from = log.mark();
  const payload = b64(JSON.stringify({ seq: id, cmd, ...fields }));
  await runAs(
    `mkdir -p ${COMMANDS} && echo ${payload} | base64 -d > ${COMMANDS}/.next && mv ${COMMANDS}/.next ${COMMANDS}/${name}.json`,
  );
  const answer = await log.waitFor((line) => line.source === "matrix" && line.seq === id, { from, timeout });
  if (!answer) {
    const reason = `no answer to "${cmd}" within ${timeout} ms`;
    if (!recover) throw new Error(reason);
    const error = new Error(await bringBack(reason));
    error.recovered = true;
    throw error;
  }
  // An answer to a real step, not just the hello that bringing the app back sends, resets the count.
  if (cmd !== "hello") recoveries = 0;
  if (!answer.ok) throw new Error(`${cmd}: ${answer.error}`);
  return answer.result;
}

/**
 * The app stopped answering. Usually it is no longer in front: a tap landed on a
 * system bar, and React Native pauses JS timers in the background, so the command
 * channel waits. Commands queued meanwhile are dropped, the app is brought back
 * (or restarted), and the step that waited fails while the run goes on. Three in
 * a row without an answer between them end the run, instead of letting every
 * later step wait out its timeout.
 */
async function bringBack(reason) {
  if (await deviceBack(reason)) return `${reason}: the phone had dropped off USB; it came back and the run went on`;
  if (++recoveries > 3) throw new Fatal(`${reason}, and the app stopped answering three times in a row`);
  const focus = (await shell("dumpsys window | grep -E mCurrentFocus | head -1").catch(() => "")).trim();
  const inFront = focus.includes(PKG);
  await runAs(`rm -f ${COMMANDS}/*.json`).catch(() => {});
  if (!inFront) {
    say(`${reason}; the app is not in front (${focus || "unknown focus"}), bringing it back`);
    await shell(`am start -n ${ACTIVITY}`).catch(() => {});
    try {
      await hello(10000);
      return `${reason}: the app had left the foreground (${focus || "unknown focus"}); brought it back`;
    } catch {
      // restart below
    }
  } else {
    say(`${reason}; the app is in front but stuck, restarting it`);
  }
  await shell(`am force-stop ${PKG}`).catch(() => {});
  await sleep(800);
  try {
    await launch();
  } catch (error) {
    throw new Fatal(`${reason}, and the app did not come back after a restart: ${error.message}`);
  }
  return `${reason}: restarted the app`;
}

async function reader(action, args = {}, timeout = 12000) {
  return send("reader", { action, args: { ...args, timeoutMs: timeout - 2000 } }, { timeout });
}

/** The reader page's measurements plus where the screen is, in one object. */
async function state() {
  const answer = await reader("state");
  if (answer.page?.error) throw new Error(answer.page.error);
  return { ...answer.page, native: answer.native };
}

async function readerReady(timeout = 20000) {
  const end = Date.now() + timeout;
  for (;;) {
    try {
      return await reader("layout", {}, 4000);
    } catch (error) {
      if (error.recovered || error instanceof Fatal || Date.now() > end) throw error;
      await sleep(300);
    }
  }
}

async function hello(timeout = 40000) {
  const end = Date.now() + timeout;
  for (;;) {
    try {
      return await send("hello", {}, { timeout: 6000, recover: false });
    } catch (error) {
      if (Date.now() > end) throw error;
      await sleep(500);
    }
  }
}

/** Start the app and wait for the command channel. A first launch can hang on the splash, so try twice. */
function launch() {
  return quietly(180000, "waiting for the app to start (Metro may be bundling)", launchOnce);
}

async function launchOnce() {
  for (let attempt = 1; attempt <= 2; attempt++) {
    await shell(`am start -n ${ACTIVITY}`);
    try {
      return await hello();
    } catch (error) {
      if (attempt === 2) {
        throw new Error(
          `the app does not answer (${error.message}). Is Metro running (npx expo start), is "adb reverse tcp:8081 tcp:8081" set, and is this a debug build?`,
        );
      }
      say("no answer from the app, restarting it once");
      await shell(`am force-stop ${PKG}`);
      await sleep(1500);
    }
  }
}

// CSS pixels in the reader page to screen pixels for `input tap`.
function toPx(st, x, y) {
  const { screen, scale } = st.native;
  const k = screen.width / st.viewport.width;
  return [Math.round((screen.x + x * k) * scale), Math.round((screen.y + y * k) * scale)];
}

function zonePoint(st, zone) {
  const fraction = zone === "left" ? 0.15 : zone === "right" ? 0.85 : 0.5;
  return toPx(st, st.viewport.width * fraction, st.viewport.height * 0.5);
}

const tap = ([x, y]) => input(`tap ${x} ${y}`);

let OUT = "";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffers) {
  // Node 22.2 and later have it built in.
  if (zlib.crc32) return buffers.reduce((value, buffer) => zlib.crc32(buffer, value), 0);
  let c = 0xffffffff;
  for (const buffer of buffers) for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32([head.subarray(4), data]));
  return Buffer.concat([head, data, crc]);
}

/** A PNG from `screencap`'s raw RGBA frame: a 12 or 16 byte header (width, height, format[, color space]), then pixels. */
async function pngFromRaw(raw) {
  const width = raw.readUInt32LE(0);
  const height = raw.readUInt32LE(4);
  const format = raw.readUInt32LE(8);
  const header = raw.length - width * height * 4;
  if (!width || !height || (format !== 1 && format !== 2) || (header !== 12 && header !== 16)) return null;
  const rows = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    let out = y * (1 + width * 3) + 1;
    let at = header + y * width * 4;
    for (let x = 0; x < width; x++, at += 4) {
      rows[out++] = raw[at];
      rows[out++] = raw[at + 1];
      rows[out++] = raw[at + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, pngChunk("IHDR", ihdr), pngChunk("IDAT", await deflate(rows, { level: 3 })), pngChunk("IEND", Buffer.alloc(0))]);
}

const pendingShots = [];

/**
 * A screenshot. The phone sends its raw frame, which is quicker than having it
 * encode a PNG, and the PNG is written here in the background while the run goes on.
 */
async function shot(dir, name) {
  try {
    const frame = await onDevice(() => adb(["exec-out", "screencap"], { buffer: true, timeout: 20000 }));
    const path = join(dir, name);
    const isPng = frame.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    pendingShots.push(
      (isPng ? Promise.resolve(frame) : pngFromRaw(frame))
        .then(async (png) => writeFile(path, png ?? (await adb(["exec-out", "screencap", "-p"], { buffer: true, timeout: 20000 }))))
        .catch((error) => say(`screenshot ${name} could not be saved: ${error.message}`)),
    );
    return relative(OUT, path).replaceAll("\\", "/");
  } catch (error) {
    say(`screenshot ${name} failed: ${error.message}`);
    return null;
  }
}

const results = { checks: [], books: [], notes: [], taps: [], lifecycle: [], imports: [], notCovered: [], stalls: [] };

/** pass: true, false, or null for "does not apply". */
function check(scope, name, pass, detail = "") {
  if (abandoned()) return null;
  const value = pass === null || pass === undefined ? null : Boolean(pass);
  results.checks.push({ scope, name, pass: value, detail: String(detail ?? "") });
  if (value) watch.passedSinceStall = true;
  const mark = value === null ? "–" : value ? "✓" : "✗";
  say(`${mark} ${scope}: ${name}${detail ? ` (${detail})` : ""}`);
  return value;
}

// An image that did not load shows nothing, so it does not count.
const hasContent = (st) => (st?.textLength ?? 0) > 0 || (st?.images ?? 0) - (st?.broken ?? 0) > 0;

function words(text, count = 6) {
  return (text ?? "").split(/\s+/).filter((word) => word.length > 2).slice(0, count);
}

/**
 * The same place: the same CFI, or the text that starts one screen is on the
 * other. A page and a scrolled screen hold different amounts of text, so either
 * may contain the other's start.
 */
function samePlace(a, b, within = 0.0005) {
  if (!a || !b) return false;
  if (a.cfi && a.cfi === b.cfi) return true;
  if (a.section !== b.section) return false;
  // Front matter and covers have little or no text to compare; the same spot to within a page is the same place.
  if (typeof a.fraction === "number" && typeof b.fraction === "number" && Math.abs(a.fraction - b.fraction) < within) return true;
  const phrase = (st) => words(st.text, 5).join(" ");
  const contains = (st, text) => text.length > 0 && (st.pageText ?? st.text ?? "").includes(text);
  const startOf = (st) => (st.pageText ?? st.text ?? "").split(/\s+/).slice(0, 5).join(" ");
  return contains(b, startOf(a)) || contains(a, startOf(b)) || (phrase(a).length > 0 && contains(b, phrase(a)));
}

const isRelocate = (line) => line.source === "reader" && line.phase === "relocate";

/** The first relocate after `from` that lands somewhere other than `cfi`. foliate can report the same place twice. */
async function waitRelocate(from, timeout = 3000, cfi = null) {
  return log.waitFor((line) => isRelocate(line) && (cfi === null || line.cfi !== cfi), { from, timeout });
}

/**
 * Wait for the reader to move, then for it to stop: no further relocate for
 * `quietMs`. This replaces fixed sleeps after turns, flow changes and scrolls,
 * which were sized for the slowest case and paid every time.
 */
async function settle(from, { timeout = 3000, quietMs = 250, cfi = null } = {}) {
  let last = await waitRelocate(from, timeout, cfi);
  if (!last) return null;
  let quietSince = Date.now();
  let seen = log.mark();
  while (Date.now() - quietSince < quietMs) {
    await sleep(40);
    await log.poll();
    const more = log.since(seen).filter(isRelocate);
    seen = log.mark();
    if (more.length) {
      last = more.at(-1);
      quietSince = Date.now();
    }
  }
  return last;
}

/** A note sheet message after `from`: opened (open true) or closed (open false). */
function waitNote(from, open, timeout = 2500) {
  return log.waitFor((line) => line.source === "reader" && line.phase === "note" && (open === undefined || Boolean(line.open) === open), { from, timeout });
}

/**
 * One page turn the way a reader does it: a tap in the forward or back zone.
 * When a link sits under that point (a contents page), the tap would follow
 * the link, so the turn uses the ‹ › controls instead and says so.
 */
async function turnOnce(direction) {
  const st = await state();
  const backZone = st.forwardZone === "left" ? "right" : "left";
  const zone = direction === "forward" ? st.forwardZone : backZone;
  const result = (method, moved = null) => ({
    method,
    zone,
    moved: Boolean(moved && moved.cfi !== st.cfi),
    forward: Boolean(moved && (moved.section > st.section || (moved.section === st.section && (moved.fraction ?? 0) > (st.fraction ?? 0)))),
    ms: moved?.sinceTapMs ?? null,
    before: st.fraction,
    after: moved?.fraction ?? st.fraction,
  });
  // At the first or last page of the book there is nowhere to go: no need to wait and see.
  if (direction === "forward" ? st.atEnd : st.atStart) return { ...result("none"), edge: true };
  const button = async () => {
    const from = log.mark();
    await reader("turn", { dir: direction === "forward" ? "next" : "prev" });
    await waitRelocate(from, 3000, st.cfi);
    return result("button", await afterTurn(from, st.cfi));
  };
  // A tap where no link is, as a person would aim; the › control when links fill the zone.
  const point = st.tapPoints?.[zone] ?? (st.links?.[zone] ? null : { x: st.viewport.width * (zone === "left" ? 0.15 : 0.85), y: st.viewport.height / 2 });
  if (!point) return button();
  const from = log.mark();
  await tap(toPx(st, point.x, point.y));
  const first = await log.waitFor((line) => (isRelocate(line) && line.cfi !== st.cfi) || (line.source === "reader" && line.phase === "note" && line.open), { from, timeout: 3000 });
  if (first?.phase === "note") {
    // The tap opened a note after all. Close it and turn with the control instead.
    say(`a tap in the ${zone} zone opened a note; closing it and using the › control`);
    await reader("popup-click", { name: "close" });
    await waitNote(from, false, 1500);
    return { ...(await button()), method: "button", note: true };
  }
  if (!first) return result("tap");
  return result("tap", await afterTurn(from, st.cfi));
}

/**
 * A turn into another chapter passes through foliate's empty padding page while
 * that chapter loads; a heavy one (scanned pages) can take a second. Wait until
 * the reader rests on a real page, so the next check does not judge the gap.
 */
async function afterTurn(from, cfi) {
  let moved = await settle(from, { timeout: 100, quietMs: 150, cfi });
  for (let i = 0; i < 3; i++) {
    const now = await state();
    if (!now.paddingPage) break;
    const mark = log.mark();
    moved = (await settle(mark, { timeout: 2000, quietMs: 200 })) ?? moved;
  }
  return moved;
}

function localPath(entry) {
  return join(ROOT, "test-books", entry.dir, entry.file);
}

function bookId(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 32);
}

function catalog() {
  const only = opts.only ?? (opts.quick ? QUICK.join(",") : null);
  const wanted = only ? only.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean) : null;
  const entries = [];
  for (const entry of CATALOG) {
    const name = (entry.as ?? entry.file).toLowerCase();
    if (wanted && !wanted.some((part) => name.includes(part) || entry.key === part)) continue;
    const path = localPath(entry);
    if (!existsSync(path)) {
      if (!entry.optional) results.notCovered.push(`${entry.file}: not on this computer (run npm run books)`);
      continue;
    }
    entries.push({ ...entry, path, id: bookId(path), name: entry.as ?? entry.file });
  }
  // Other personal books in test-books/mine/ run the book routine too.
  const mine = join(ROOT, "test-books", "mine");
  if (!wanted && existsSync(mine)) {
    for (const file of readdirSync(mine)) {
      if (!/\.epub$/i.test(file) || CATALOG.some((entry) => entry.file === file)) continue;
      const path = join(mine, file);
      entries.push({ file, dir: "mine", why: "personal book", path, id: bookId(path), name: file, optional: true });
    }
  }
  return entries;
}

async function freshImport(entries, frankenstein) {
  say("importing every book again");
  await shell(`mkdir -p ${EXTERNAL}`).catch(() => {});
  const names = [];
  for (const entry of entries) {
    say(`pushing ${entry.name}`);
    await quietly(15 * 60000, `pushing ${entry.name}`, () => adb(["push", entry.path, `${EXTERNAL}/${entry.name}`], { timeout: 15 * 60000 }));
    names.push(entry.name);
  }
  if (frankenstein) {
    await adb(["push", frankenstein.path, `${EXTERNAL}/duplicate-frankenstein.epub`], { timeout: 600000 });
    names.push("duplicate-frankenstein.epub");
  }
  await runAs(`echo ${b64(names.join("\n"))} | base64 -d > files/quire-import`);
  // Each imported book writes a line, which counts as progress; one book may take a few minutes.
  const answer = await quietly(5 * 60000, "importing books", () => send("drain-imports", {}, { timeout: 30 * 60000 }));
  results.imports = answer.imported;
  for (const entry of entries) {
    const row = answer.imported.find((item) => item.name === entry.name);
    const expected = entry.expect === "drm" ? "drm" : "added";
    check(entry.name, `import is "${expected}"`, row?.kind === expected, row?.kind ?? "no import line");
  }
  if (frankenstein) {
    const row = answer.imported.find((item) => item.name === "duplicate-frankenstein.epub");
    check("duplicate-frankenstein.epub", 'the same bytes again import as "duplicate"', row?.kind === "duplicate", row?.kind ?? "no import line");
  }
  await shell(`rm -f ${names.map((name) => `${EXTERNAL}/${name}`).join(" ")}`).catch(() => {});
  results.notCovered.push("The system file picker: it is the phone's own UI, so a person picks one book by hand.");
}

const readerJs = () => join(ROOT, "assets", "reader", "reader.js");
let readerPushed = null;
let readerChecked = false;

function run(command, args) {
  return new Promise((done, fail) => {
    execFile(command, args, { cwd: ROOT, windowsHide: true }, (error, stdout, stderr) => (error ? fail(new Error(String(stderr || error.message).trim())) : done(stdout)));
  });
}

/**
 * Build the reader page from this checkout and put it where a debug build reads
 * it instead of the APK's copy (files/quire-dev/). Reader-page changes then need
 * no gradle build; app code already comes from Metro.
 */
async function pushReader() {
  if (opts["apk-reader"]) {
    await runAs(`rm -rf ${DEV_READER}`).catch(() => {});
    say("reader page: the one built into the APK");
    return;
  }
  await quietly(120000, "building the reader page", () => run(process.execPath, [join(ROOT, "scripts", "bundle-reader.mjs")]));
  await runAs(`mkdir -p ${DEV_READER}`);
  for (const [from, to] of [["index.html", "reader.html"], ["reader.js", "reader.js"]]) {
    const tmp = `/data/local/tmp/quire-${to}`;
    await onDevice(() => adb(["push", join(ROOT, "assets", "reader", from), tmp]));
    await runAs(`cp ${tmp} ${DEV_READER}/${to}.part && mv ${DEV_READER}/${to}.part ${DEV_READER}/${to}`);
    await shell(`rm -f ${tmp}`).catch(() => {});
  }
  readerPushed = createHash("sha256").update(readFileSync(readerJs())).digest("hex");
  say(`reader page: pushed from this checkout (${readerPushed.slice(0, 12)})`);
}

/** Once a book is open the app has copied its reader page into place: is it the pushed one? */
async function checkReader() {
  if (readerChecked || !readerPushed) return;
  readerChecked = true;
  const served = (await runAs("sha256sum files/quire-static/reader.js").catch(() => "")).split(/\s+/)[0];
  if (served === readerPushed) return;
  const line = "The phone ran the reader page built into its APK, not this checkout's: the installed build predates pushed reader pages. Rebuild and install once.";
  say(line);
  results.notCovered.push(line);
}

async function openBook(entry) {
  const from = log.mark();
  await send("open", { id: entry.id });
  const opened = await log.waitFor(
    (line) => line.source === "reader" && line.id === entry.id && ["opened", "refused", "failed"].includes(line.phase),
    { from, timeout: entry.openTimeoutMs ?? 60000 },
  );
  if (opened?.phase === "opened") {
    await readerReady();
    await settle(from, { timeout: 2000, quietMs: 300 });
    await checkReader();
  }
  return opened;
}

async function ensurePaginated(st) {
  if (st.fixedLayout || st.flow === "paginated") return st;
  const from = log.mark();
  await reader("flow", { flow: "paginated" });
  await settle(from, { timeout: 3000, quietMs: 300 });
  return state();
}

/** The first section, so a test that turns forward never starts at the end of the book. */
async function goToStart() {
  const from = log.mark();
  await reader("goto", { target: 0 });
  await settle(from, { timeout: 3000, quietMs: 300 });
  return state();
}

async function setFlow(flow) {
  const from = log.mark();
  await reader("flow", { flow });
  await settle(from, { timeout: 3000, quietMs: 300 });
  return state();
}

// Scroll forward by a swipe along the scroll axis. Vertical writing (right to left lines)
// scrolls sideways in Scroll mode, and the next text is to the left.
async function swipeForward(st) {
  const from = log.mark();
  if (st.vertical) {
    const [left, y] = toPx(st, st.viewport.width * 0.2, st.viewport.height * 0.5);
    const [right] = toPx(st, st.viewport.width * 0.8, st.viewport.height * 0.5);
    await input(`swipe ${left} ${y} ${right} ${y} 350`);
  } else {
    // Start above the bottom quarter, where the reader's own controls (the slider, the
    // Back pill) sit and would take the touch, and end below the top fifth (banners).
    const [x, top] = toPx(st, st.viewport.width * 0.5, st.viewport.height * 0.25);
    const [, bottom] = toPx(st, st.viewport.width * 0.5, st.viewport.height * 0.6);
    await input(`swipe ${x} ${bottom} ${x} ${top} 350`);
  }
  // A fling keeps scrolling after the finger lifts, and foliate reports the place
  // 250 ms after scrolling stops.
  await settle(from, { timeout: 2500, quietMs: 400, cfi: st.cfi });
}

function pick(st) {
  if (!st) return null;
  return {
    section: st.section,
    sections: st.sections,
    fraction: st.fraction,
    flow: st.flow,
    text: st.text?.slice(0, 80),
    fontDp: st.fontDp,
    images: st.images,
    bookDir: st.bookDir,
    vertical: st.vertical,
    fixedLayout: st.fixedLayout,
  };
}

async function runBook(entry, index) {
  const scope = entry.name;
  const dir = join(OUT, `${String(index + 1).padStart(2, "0")}-${stem(entry.name)}`);
  await mkdir(dir, { recursive: true });
  const row = { name: entry.name, why: entry.why, id: entry.id, shots: [] };
  results.books.push(row);
  const library = await send("hello");
  const inLibrary = library.books.some((book) => book.id === entry.id);
  if (entry.expect === "drm") {
    row.opened = "refused at import";
    check(scope, "the DRM book is not in the library", !inLibrary);
    return;
  }
  if (!check(scope, "is in the library", inLibrary, inLibrary ? "" : "not imported: run with --fresh")) return;

  const opened = await openBook(entry);
  row.opened = opened?.phase ?? "timeout";
  Object.assign(row, { title: opened?.title, openMs: opened?.openMs, sections: opened?.sections, rangeRequests: opened?.rangeRequests });
  if (!check(scope, "opens", opened?.phase === "opened", opened?.error ?? opened?.kind ?? (opened ? "" : "no opened line"))) {
    row.shots.push(await shot(dir, "00-not-opened.png"));
    await send("library").catch(() => {});
    return;
  }

  let st = await ensurePaginated(await state());
  row.first = pick(st);
  row.shots.push(await shot(dir, "01-open.png"));
  check(scope, "shows text or an image", hasContent(st), st.text?.slice(0, 50));
  check(scope, "page is laid out at device width", Math.abs(st.viewport.width - st.viewport.screenWidth) <= 2, `${st.viewport.width} css px, screen ${st.viewport.screenWidth} dp`);
  check(scope, "body text is 12 dp or larger", st.fixedLayout || st.fontDp === null ? null : st.fontDp >= 12, st.fontDp === null ? "no text" : `${st.fontDp} dp`);

  const turns = [];
  for (let i = 0; i < 5; i++) turns.push(await turnOnce("forward"));
  const back = await turnOnce("back");
  row.turns = turns.map((turn) => ({ ms: turn.ms, moved: turn.moved, method: turn.method }));
  row.back = { ms: back.ms, moved: back.moved, method: back.method };
  // A turn that does not move is fine at the end of the book, and a one-page book cannot move at all.
  const atEnd = (turn) => turn.edge || (turn.before ?? 0) >= 0.97;
  const onePage = turns.every((turn) => !turn.moved) && !back.moved;
  const stuck = turns.filter((turn) => !turn.moved && !atEnd(turn));
  check(scope, "five forward turns move", onePage ? null : stuck.length === 0, onePage ? "the book is one page" : turns.map((turn) => (turn.moved ? turn.ms ?? turn.method : atEnd(turn) ? "end" : "stuck")).join(", "));
  check(scope, "forward turns go forward", turns.some((turn) => turn.moved) ? turns.filter((turn) => turn.moved).every((turn) => turn.forward) : null, turns.map((turn) => `${turn.before?.toFixed(3)}→${turn.after?.toFixed(3)}`).join(" "));
  check(scope, "a back turn moves back", onePage ? null : back.moved && !back.forward, `${back.before?.toFixed(3)}→${back.after?.toFixed(3)}`);
  if (turns.some((turn) => turn.note)) row.notes = "a tap in the side zone opened a note; that turn used the › control";
  else if (turns.some((turn) => turn.method === "button")) row.notes = "links filled the tap zone on some pages, so those turns used the › control";

  st = await state();
  row.shots.push(await shot(dir, "02-turned.png"));
  check(scope, "after turning, shows text or an image", hasContent(st), st.text?.slice(0, 50));
  if (!st.fixedLayout) {
    const scan = (await reader("scan", {}, 30000)).page;
    row.blank = scan;
    // For a blank page: what sits on it, and a screenshot of it, so it can be judged without a rerun.
    const why = (scan.why ?? []).map((w) => `page ${w.page}: ${w.starts.length ? `starts ${w.starts.join("; ")}` : "nothing starts here"}${w.across ? `; inside ${w.across}` : ""}`).join(" | ");
    if (!scan.skipped && scan.blank.length) {
      const from = log.mark();
      await reader("show-page", { page: scan.blank[0] });
      await settle(from, { timeout: 2000, quietMs: 250 });
      row.shots.push(await shot(dir, `02b-blank-page-${scan.blank[0]}.png`));
      const back = log.mark();
      await reader("goto", { target: st.cfi });
      await settle(back, { timeout: 2000, quietMs: 250 });
    }
    check(scope, "no blank pages in this chapter", scan.skipped ? null : scan.blank.length === 0, scan.skipped ? "" : `${scan.pages} pages${scan.blank.length ? `, blank: ${scan.blank.join(", ")}. ${why}` : ""}`);
  }

  if (st.fixedLayout) {
    check(scope, "Pages and Scroll", null, "fixed layout has no scroll mode");
  } else {
    const before = st;
    const scrolled = await setFlow("scrolled");
    row.shots.push(await shot(dir, "03-scroll.png"));
    check(scope, "Scroll shows text or an image", hasContent(scrolled), scrolled.text?.slice(0, 50));
    // Scroll mode shows a little text above the anchor, so the switch may move up to about a screen (DECISIONS.md, page layout).
    check(scope, "Pages → Scroll keeps the place", samePlace(before, scrolled, 0.002), `section ${before.section}→${scrolled.section}, ${before.fraction?.toFixed(3)}→${scrolled.fraction?.toFixed(3)}`);
    // In a chapter shorter than a screen and a half, two swipes scroll past its end onto blank paper.
    const short = scrolled.shortSection;
    await swipeForward(scrolled);
    if (!short) await swipeForward(scrolled);
    const swiped = await state();
    row.shots.push(await shot(dir, "04-scrolled.png"));
    const swipeMoved = swiped.cfi !== scrolled.cfi;
    const nowhere = !swipeMoved && (scrolled.atEnd || scrolled.sectionEnd);
    check(scope, "a swipe scrolls", nowhere ? null : swipeMoved, nowhere ? "Scroll opened on the last screen of the chapter" : `${scrolled.fraction?.toFixed(3)}→${swiped.fraction?.toFixed(3)}`);
    check(scope, "after scrolling, shows text or an image", short && !hasContent(swiped) ? null : hasContent(swiped), short && !hasContent(swiped) ? "short chapter, scrolled past its end" : swiped.text?.slice(0, 50));
    const paged = await setFlow("paginated");
    row.shots.push(await shot(dir, "05-pages.png"));
    check(scope, "Scroll → Pages keeps the place", short && !hasContent(swiped) ? null : samePlace(swiped, paged), `section ${swiped.section}→${paged.section}, ${swiped.fraction?.toFixed(3)}→${paged.fraction?.toFixed(3)}`);
    check(scope, "back in Pages, shows text or an image", hasContent(paged), paged.text?.slice(0, 50));
  }
  await send("library");
}

async function closeNote(how, st) {
  const from = log.mark();
  if (how === "button") await reader("popup-click", { name: "close" });
  else if (how === "back key") await input("keyevent 4");
  // The shade above the sheet (the sheet is at most 62% of the height). Never the top
  // of the screen: a notification banner can drop in there and take the tap.
  else await tap(toPx(st, st.viewport.width / 2, st.viewport.height * 0.25));
  await waitNote(from, false, 2000);
  await sleep(150);
}

/** Tap a note reference and wait for its sheet (or for the page to move, when it was not a note). */
async function tapNoteref(st, ref) {
  const from = log.mark();
  await tap(toPx(st, ref.x, ref.y));
  await log.waitFor((line) => line.source === "reader" && (line.phase === "note" || line.phase === "relocate"), { from, timeout: 3000 });
  await sleep(250);
}

/** Press a sheet button and wait for the sheet to change. */
async function sheetClick(name) {
  const from = log.mark();
  const result = await reader("popup-click", { name });
  if (result.page?.clicked) await waitNote(from, undefined, 1500);
  await sleep(200);
  return result;
}

async function runNotes(entry, index) {
  const scope = `${entry.name} notes`;
  const dir = join(OUT, `notes-${String(index + 1).padStart(2, "0")}-${stem(entry.name)}`);
  await mkdir(dir, { recursive: true });
  const opened = await openBook(entry);
  if (!check(scope, "opens", opened?.phase === "opened", opened?.phase ?? "no opened line")) return;
  await ensurePaginated(await state());
  await reader("page-errors", { reset: true });
  const findFrom = log.mark();
  const found = (await reader("find-notes", { min: 2 }, 90000)).page;
  if (!check(scope, "finds a chapter with note references", found?.index !== null && found?.index !== undefined, found?.refs ? `${found.refs} in ${found.href}` : "none in 80 sections")) {
    await send("library");
    return;
  }
  await settle(findFrom, { timeout: 3000, quietMs: 300 });
  let refs = (await reader("noterefs")).page.refs ?? [];
  for (let i = 0; i < 3 && refs.length === 0; i++) {
    await turnOnce("forward");
    refs = (await reader("noterefs")).page.refs ?? [];
  }
  if (!check(scope, "a note reference is on screen", refs.length > 0, `${refs.length} visible`)) {
    await send("library");
    return;
  }

  const closers = ["button", "back key", "shade"];
  const opened_ = [];
  for (const [i, ref] of refs.slice(0, 6).entries()) {
    const before = await state();
    // The previous note may have moved things a little; tap where the reference is now.
    const target = (await reader("noterefs")).page.refs?.find((r) => r.id === ref.id && r.href === ref.href) ?? ref;
    const from = log.mark();
    await tapNoteref(before, target);
    const open = await state();
    const popup = open.popup ?? {};
    const shotName = await shot(dir, `note-${i + 1}.png`);
    const item = {
      book: entry.name,
      ref: ref.text,
      kind: ref.kind,
      opened: Boolean(popup.open),
      label: popup.label ?? null,
      text: (popup.text ?? "").slice(0, 90),
      backlinkHidden: !popup.backlink,
      samePage: open.cfi === before.cfi,
      shot: shotName,
    };
    results.notes.push(item);
    check(scope, `"${ref.text}" opens a note on the same page`, popup.open && item.samePage, popup.open ? popup.label : item.samePage ? "nothing opened" : "the page moved");
    if (!popup.open) {
      if (!item.samePage) {
        const back = log.mark();
        await reader("goto", { target: before.cfi });
        await settle(back, { timeout: 3000, quietMs: 250 });
      }
      continue;
    }
    opened_.push({ ref, links: popup.bookLinks ?? 0, goTo: popup.buttons?.["Go to note"] === true });
    check(scope, `"${ref.text}" note has text`, (popup.textLength ?? 0) > 0, item.text.slice(0, 40));
    check(scope, `"${ref.text}" note has no back-link`, !popup.backlink);
    const how = closers[i % closers.length];
    await closeNote(how, open);
    const closed = await state();
    const movedLines = log.since(from).filter((line) => line.source === "reader" && line.phase === "relocate" && line.cfi !== before.cfi);
    item.closedBy = how;
    check(scope, `closing with the ${how} leaves the same page`, !closed.popup?.open && closed.cfi === before.cfi && movedLines.length === 0, closed.popup?.open ? "still open" : movedLines.length ? "the page moved" : "");
  }

  // Previous and Next inside the sheet.
  if (opened_.length > 0) {
    const first = opened_[0].ref;
    const st = await state();
    const live = (await reader("noterefs")).page.refs.find((r) => r.id === first.id && r.href === first.href) ?? first;
    await tapNoteref(st, live);
    const a = (await state()).popup;
    const next = (await sheetClick("next")).page;
    const b = (await state()).popup;
    if (next?.clicked) {
      check(scope, "Next shows the next note", b.open && b.label !== a.label, `${a.label} → ${b.label}`);
      await sheetClick("previous");
      const c = (await state()).popup;
      check(scope, "Previous comes back", c.open && c.label === a.label, `${b.label} → ${c.label}`);
    } else {
      check(scope, "Next shows the next note", null, `only one note here (${a.label})`);
    }
    await sheetClick("close");
  }

  // A link inside a note: another note opens on top, with Back.
  const withLink = opened_.find((item) => item.links > 0);
  if (withLink) {
    const st = await state();
    const live = (await reader("noterefs")).page.refs.find((r) => r.id === withLink.ref.id) ?? withLink.ref;
    await tapNoteref(st, live);
    const followFrom = log.mark();
    const followed = (await reader("popup-follow")).page;
    await log.waitFor((line) => line.source === "reader" && (line.phase === "note" || line.phase === "relocate"), { from: followFrom, timeout: 2500 });
    await sleep(300);
    const after = await state();
    await shot(dir, "note-inside-note.png");
    if (after.popup?.open && after.popup.stacked) {
      check(scope, "a note link inside a note opens it on top", true, followed?.href);
      await sheetClick("back");
      const popped = (await state()).popup;
      check(scope, "Back returns to the first note", popped.open && !popped.stacked, popped.label);
      await sheetClick("close");
    } else {
      // A web link or a link into the book is not a note: record what happened.
      results.notes.push({ book: entry.name, ref: withLink.ref.text, linkInNote: followed?.href, result: after.popup?.open ? "stayed" : "left the sheet" });
      check(scope, "a note link inside a note opens it on top", null, `the link was not a note (${followed?.href})`);
      if (after.popup?.open) await sheetClick("close");
      if (after.cfi !== st.cfi) {
        const back = log.mark();
        await reader("goto", { target: st.cfi });
        await settle(back, { timeout: 3000, quietMs: 250 });
      }
    }
  }

  // Go to note, then Back to text.
  const jumpable = opened_.find((item) => item.goTo);
  if (jumpable) {
    const st = await state();
    const live = (await reader("noterefs")).page.refs.find((r) => r.id === jumpable.ref.id) ?? jumpable.ref;
    await tapNoteref(st, live);
    const from = log.mark();
    await reader("popup-click", { name: "go to note" });
    await settle(from, { timeout: 4000, quietMs: 300, cfi: st.cfi });
    const jumped = await state();
    await shot(dir, "go-to-note.png");
    check(scope, "Go to note jumps there and offers Back to text", !jumped.popup?.open && jumped.cfi !== st.cfi && Boolean(jumped.popup?.backChip), jumped.tocLabel ?? "");
    if (jumped.popup?.backChip) {
      const back = log.mark();
      await tap(toPx(jumped, jumped.popup.backChip.x, jumped.popup.backChip.y));
      await settle(back, { timeout: 4000, quietMs: 300, cfi: jumped.cfi });
      const returned = await state();
      check(scope, "Back to text returns to the page", samePlace(st, returned), `${st.fraction?.toFixed(3)} → ${returned.fraction?.toFixed(3)}`);
    }
  }
  // M1a's foliate footnote views raised 67 "doc is null" errors here; the popup must raise none.
  const errors = (await reader("page-errors")).page ?? {};
  check(scope, "opening notes raised no page errors", errors.count === 0, errors.count ? `${errors.count}: ${errors.samples?.[0] ?? ""}` : "none");
  await send("library");
}

async function zoneGoesForward(zone) {
  const st = await state();
  const from = log.mark();
  const point = st.tapPoints?.[zone];
  await tap(point ? toPx(st, point.x, point.y) : zonePoint(st, zone));
  const moved = await settle(from, { timeout: 3000, quietMs: 200, cfi: st.cfi });
  if (!moved) return { forward: false, detail: "did not move" };
  const forward = moved.section > st.section || (moved.section === st.section && (moved.fraction ?? 0) > (st.fraction ?? 0));
  return { forward, detail: `${st.fraction?.toFixed(3)}→${moved.fraction?.toFixed(3)}` };
}

async function runTapSetting(arabic, frankenstein) {
  const scope = "tap direction";
  try {
    await send("settings", { tapZones: "reading" });
    if (arabic) {
      const opened = await openBook(arabic);
      if (check(scope, "the Arabic book opens", opened?.phase === "opened")) {
        let st = await ensurePaginated(await state());
        st = await goToStart();
        check(scope, "the Arabic book reads right to left", st.bookDir === "rtl", st.bookDir);
        const left = [await zoneGoesForward("left"), await zoneGoesForward("left")];
        check(scope, "following the book: the left side goes forward", left.every((r) => r.forward), left.map((r) => r.detail).join(", "));
        await send("settings", { tapZones: "screen" });
        st = await state();
        check(scope, "the setting reaches the open book", st.forwardZone === "right", st.forwardZone);
        const right = [await zoneGoesForward("right"), await zoneGoesForward("right")];
        check(scope, "following the screen: the right side goes forward", right.every((r) => r.forward), right.map((r) => r.detail).join(", "));
        await send("library");
      }
    }
    if (frankenstein) {
      const opened = await openBook(frankenstein);
      if (opened?.phase === "opened") {
        await ensurePaginated(await state());
        await goToStart();
        const screen = await zoneGoesForward("right");
        check(scope, "left-to-right book, screen setting: right goes forward", screen.forward, screen.detail);
        await send("settings", { tapZones: "reading" });
        const reading = await zoneGoesForward("right");
        check(scope, "left-to-right book, book setting: right goes forward", reading.forward, reading.detail);
        await send("library");
      }
    }
  } finally {
    await send("settings", { tapZones: "reading" }).catch(passFatal);
  }
}

let rotation = null;

async function restoreRotation() {
  if (!rotation) return;
  await shell(`settings put system user_rotation ${rotation.user}`).catch(() => {});
  await shell(`settings put system accelerometer_rotation ${rotation.accel}`).catch(() => {});
  rotation = null;
}

async function runLifecycle(entry) {
  const scope = "restore and lifecycle";
  const dir = join(OUT, "lifecycle");
  await mkdir(dir, { recursive: true });
  let opened = await openBook(entry);
  if (!check(scope, "Frankenstein opens", opened?.phase === "opened")) return;
  await ensurePaginated(await state());
  // From the start of the book, so the turns below have somewhere to go.
  await goToStart();
  for (let i = 0; i < 3; i++) await turnOnce("forward");
  await sleep(2000);
  const a = await state();
  await send("library");
  await sleep(800);
  opened = await openBook(entry);
  check(scope, "reopening restores the saved place", opened?.restored === true, `restored ${opened?.restored}`);
  const b = await state();
  check(scope, "reopened on the same page", samePlace(a, b), `${a.fraction?.toFixed(4)} → ${b.fraction?.toFixed(4)}`);
  await shot(dir, "1-reopened.png");

  const seconds = Number(opts["background-s"]) || 90;
  say(`home, then ${seconds} s in the background`);
  let from = log.mark();
  await shell(`${INPUT} keyevent 3`);
  await quietly(seconds * 1000 + 60000, "the app is in the background on purpose", () => sleep(seconds * 1000));
  await shell(`am start -n ${ACTIVITY}`);
  const foreground = await log.waitFor((line) => line.source === "reader" && line.phase === "foreground", { from, timeout: 20000 });
  check(scope, `after ${seconds} s in the background the reader server is alive`, foreground?.serving === true, foreground ? `serving ${foreground.serving}` : "no foreground line");
  await readerReady(30000);
  await sleep(1500);
  const c = await state();
  await shot(dir, "2-after-background.png");
  check(scope, "same page after the background", samePlace(b, c), `${b.fraction?.toFixed(4)} → ${c.fraction?.toFixed(4)}`);
  const turned = await turnOnce("forward");
  check(scope, "a tap still turns the page", turned.moved, turned.ms === null ? "" : `${turned.ms} ms`);
  const portrait = await state();

  rotation = {
    accel: (await shell("settings get system accelerometer_rotation")).trim() || "0",
    user: (await shell("settings get system user_rotation")).trim() || "0",
  };
  try {
    await shell("settings put system accelerometer_rotation 0");
    let from = log.mark();
    await shell("settings put system user_rotation 1");
    await settle(from, { timeout: 5000, quietMs: 600 });
    const d = await state();
    await shot(dir, "3-landscape.png");
    check(scope, "landscape shows text", hasContent(d), d.text?.slice(0, 40));
    // A rotation re-lays the chapter out, so the same chapter near the same fraction is the bar here.
    check(scope, "landscape keeps the place", samePlace(portrait, d) || (d.section === portrait.section && Math.abs((d.fraction ?? 0) - (portrait.fraction ?? 0)) <= 0.02), `${portrait.fraction?.toFixed(4)} → ${d.fraction?.toFixed(4)}`);
    const t = await turnOnce("forward");
    check(scope, "a tap turns in landscape", t.moved);
    from = log.mark();
    await shell("settings put system user_rotation 0");
    await settle(from, { timeout: 5000, quietMs: 600 });
    const e = await state();
    await shot(dir, "4-portrait-again.png");
    check(scope, "back in portrait, shows text", hasContent(e), e.text?.slice(0, 40));
  } finally {
    await restoreRotation();
  }

  await sleep(2500);
  const f = await state();
  say("force-stop and cold start");
  await shell(`am force-stop ${PKG}`);
  await sleep(1500);
  from = log.mark();
  const start = await launch();
  check(scope, "after a force-stop the app starts in the library", start.route === "/", start.route);
  opened = await openBook(entry);
  check(scope, "after a force-stop, reopening restores the place", opened?.restored === true, `restored ${opened?.restored}`);
  const g = await state();
  await shot(dir, "5-after-force-stop.png");
  check(scope, "same page as before the force-stop", samePlace(f, g), `${f.fraction?.toFixed(4)} → ${g.fraction?.toFixed(4)}`);
  await send("library");
}

function table(header, rows) {
  const esc = (value) => String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
  return [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.map(esc).join(" | ")} |`)].join("\n");
}

function summary(meta) {
  const failed = results.checks.filter((c) => c.pass === false);
  const passed = results.checks.filter((c) => c.pass === true);
  const na = results.checks.filter((c) => c.pass === null);
  const parts = [
    `# Phone matrix, ${meta.started}`,
    "",
    `Device: ${meta.device}. Build: ${meta.commit}. Mode: ${meta.mode}, ${meta.seconds} s. ${results.checks.length} checks: ${passed.length} passed, ${failed.length} failed, ${na.length} did not apply.`,
    "",
  ];
  if (meta.stalled) {
    parts.push("## Stalled", "", `The run stopped in "${meta.stalled.step}": ${meta.stalled.why}.`, "", ...meta.stalled.needs.map((line) => `- ${line}`), "");
  }
  if (results.stalls.length) {
    parts.push("## Stalls", "", ...results.stalls.map((st) => `- "${st.step}", nothing moved for ${st.quietS} s: ${st.problems.length ? st.problems.join("; ") : "nothing wrong found"}`), "");
  }
  if (failed.length) {
    parts.push("## Failed", "", ...failed.map((c) => `- **${c.scope}**: ${c.name}${c.detail ? ` (${c.detail})` : ""}`), "");
  }
  if (results.imports.length) {
    parts.push("## Import", "", table(["File", "Outcome"], results.imports.map((row) => [row.name, row.kind])), "");
  }
  if (results.books.length) {
    parts.push(
      "## Books",
      "",
      table(
        ["Book", "Why", "Opens", "Open ms", "Sections", "Body text", "Turn ms", "Blank pages", "Notes"],
        results.books.map((row) => [
          row.name,
          row.why,
          row.opened,
          row.openMs ?? "",
          row.sections ?? "",
          row.first?.fontDp ? `${row.first.fontDp} dp` : row.first?.fixedLayout ? "fixed layout" : "",
          (row.turns ?? []).map((turn) => (turn.moved ? turn.ms ?? turn.method : "✗")).join(", "),
          row.blank ? (row.blank.skipped ? "" : row.blank.blank.length ? row.blank.blank.join(", ") : "none") : "",
          row.notes ?? "",
        ]),
      ),
      "",
    );
  }
  if (results.notes.length) {
    parts.push(
      "## Notes",
      "",
      table(
        ["Book", "Reference", "Pops up", "Label", "Note starts", "Back-link hidden", "Same page", "Closed by"],
        results.notes.filter((n) => n.ref !== undefined && n.opened !== undefined).map((n) => [n.book, n.ref, n.opened ? "yes" : "no", n.label, n.text, n.backlinkHidden ? "yes" : "no", n.samePage ? "yes" : "no", n.closedBy ?? ""]),
      ),
      "",
    );
  }
  const scoped = (scope) => results.checks.filter((c) => c.scope === scope);
  for (const [title, scope] of [["Tap direction", "tap direction"], ["Restore and lifecycle", "restore and lifecycle"]]) {
    const rows = scoped(scope);
    if (rows.length) parts.push(`## ${title}`, "", table(["Check", "Result", "Detail"], rows.map((c) => [c.name, c.pass === null ? "–" : c.pass ? "✓" : "✗", c.detail])), "");
  }
  parts.push("## Not covered", "", ...(results.notCovered.length ? results.notCovered : ["Nothing beyond iOS, which this script does not drive."]).map((line) => `- ${line}`), "- iOS.", "");
  parts.push("All checks, in order, are in results.json. Screenshots are in one folder per book; index.html shows them with the checks.", "");
  return parts.join("\n");
}

function html(meta) {
  const esc = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const sections = [];
  const groups = new Map();
  for (const c of results.checks) {
    const key = c.scope.replace(/ notes$/, "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  for (const [scope, checks] of groups) {
    const book = results.books.find((row) => row.name === scope);
    const notes = results.notes.filter((n) => n.book === scope && n.shot);
    const shots = [...(book?.shots ?? []), ...notes.map((n) => n.shot)].filter(Boolean);
    sections.push(`<section><h2>${esc(scope)}</h2>${book?.why ? `<p class="why">${esc(book.why)}</p>` : ""}<ul>${checks
      .map((c) => `<li class="${c.pass === null ? "na" : c.pass ? "ok" : "bad"}">${c.pass === null ? "–" : c.pass ? "✓" : "✗"} ${esc(c.name)}${c.detail ? ` <span>${esc(c.detail)}</span>` : ""}</li>`)
      .join("")}</ul><div class="shots">${shots.map((s) => `<a href="${esc(s)}"><img src="${esc(s)}" loading="lazy" alt="${esc(s)}"></a>`).join("")}</div></section>`);
  }
  const failed = results.checks.filter((c) => c.pass === false).length;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phone matrix ${esc(meta.started)}</title>
<style>:root{color-scheme:light dark;--bg:#fbfbf9;--fg:#1a1a1a;--muted:#666;--ok:#1b7f3b;--bad:#b3261e;--card:#fff;--line:#e3e1da}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#eee;--muted:#aaa;--ok:#6fd08c;--bad:#ff8a80;--card:#1d1d1d;--line:#333}}
body{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif}h1{font-size:22px}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:12px 0}h2{font-size:17px;margin:4px 0}
.why{color:var(--muted);margin:0 0 6px}ul{list-style:none;padding:0;margin:0}li span{color:var(--muted)}.ok{color:var(--ok)}.bad{color:var(--bad);font-weight:600}.na{color:var(--muted)}
.shots{display:flex;gap:8px;overflow-x:auto;padding-top:8px}.shots img{height:280px;border-radius:6px;border:1px solid var(--line)}</style></head>
<body><h1>Phone matrix, ${esc(meta.started)}</h1><p>${esc(meta.device)} · ${esc(meta.commit)} · ${failed ? `${failed} failed` : "all checks passed"}</p>${sections.join("")}</body></html>`;
}

function gitCommit() {
  return new Promise((done) => {
    execFile("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, windowsHide: true }, (error, stdout) => done(error ? "unknown" : stdout.trim()));
  });
}

async function main() {
  const started = new Date().toLocaleString();
  OUT = resolve(opts.out ?? join(ROOT, "..", "quire-matrix", `run-${stamp()}`));
  await mkdir(OUT, { recursive: true });
  say(`adb: ${ADB}`);
  say(`output: ${OUT}`);

  if (!serial) await pickDevice();
  healthAdb = adbRunner(ADB, serial);
  if (!(await preflight())) return;
  // Before the open shells: one of them runs as the app, which needs the app installed.
  // `pm path` exits 1 for a package that is not there.
  const installed = (await adb(["shell", `pm path ${PKG}`]).catch(() => "")).includes("package:");
  if (opts.install || (!installed && serial.startsWith("emulator-"))) await installDebug();
  else if (!installed) throw new Error(`${PKG} (Quire Dev) is not installed on ${serial}. Debug builds install under that id now; run \`npm run android\` once, or pass --install.`);
  await openShells();
  const device = `${(await shell("getprop ro.product.model")).trim()}, Android ${(await shell("getprop ro.build.version.release")).trim()} (${serial})`;
  const meta = { started, device, commit: await gitCommit(), mode: opts.quick ? "quick" : opts.only ? `only ${opts.only}` : "full" };
  say(device);
  await adb(["reverse", "tcp:8081", "tcp:8081"]);
  await pickInput();
  startWatchdog();
  await startFrontWatch();

  const entries = catalog();
  const frankenstein = entries.find((entry) => entry.key === "frankenstein") ?? null;
  const t0 = Date.now();
  const lap = (name, since) => say(`${name}: ${Math.round((Date.now() - since) / 1000)} s`);

  try {
    await guard("run", async () => {
      await guard("starting the app", async () => {
        if (opts.fresh) {
          say("clearing the app's data");
          await shell(`pm clear ${PKG}`);
        }
        // A cold start, so the app runs Metro's current code and the reader page pushed below.
        await shell(`am force-stop ${PKG}`);
        if (serial.startsWith("emulator-")) await pointAtMetro();
        await runAs(`rm -rf ${COMMANDS}`).catch(() => {});
        await pushReader();
        log.reset();
        await launch();
        await log.clear();
        if (opts.fresh) await freshImport(entries, frankenstein);
      });

      if (!opts["skip-books"]) {
        const since = Date.now();
        for (const [index, entry] of entries.entries()) {
          say(`— ${entry.name}: ${entry.why}`);
          try {
            await guard(entry.name, () => runBook(entry, index));
          } catch (error) {
            passFatal(error);
            check(entry.name, "book routine finished", false, error.message);
            await send("library").catch(passFatal);
          }
        }
        lap("books", since);
      }
      if (!opts["skip-notes"]) {
        const since = Date.now();
        for (const [index, entry] of entries.filter((e) => e.notes).entries()) {
          say(`— notes in ${entry.name}`);
          try {
            await guard(`notes in ${entry.name}`, () => runNotes(entry, index));
          } catch (error) {
            passFatal(error);
            check(`${entry.name} notes`, "note routine finished", false, error.message);
            await send("library").catch(passFatal);
          }
        }
        lap("notes", since);
      }
      if (!opts["skip-taps"]) {
        const arabic = entries.find((entry) => entry.key === "arabic");
        if (arabic || frankenstein) {
          say("— tap direction setting");
          try {
            await guard("tap direction", () => runTapSetting(arabic, frankenstein));
          } catch (error) {
            passFatal(error);
            check("tap direction", "tap routine finished", false, error.message);
          }
        }
      }
      if (!opts["skip-lifecycle"] && !opts.quick && frankenstein) {
        say("— restore and lifecycle, hands off the phone");
        const since = Date.now();
        try {
          await guard("restore and lifecycle", () => runLifecycle(frankenstein));
        } catch (error) {
          passFatal(error);
          check("restore and lifecycle", "lifecycle routine finished", false, error.message);
        } finally {
          await restoreRotation();
        }
        lap("lifecycle", since);
      }
    });
  } catch (error) {
    if (!(error instanceof Fatal || error instanceof StallError)) throw error;
    check("run", "the run went to the end", false, `${error.message}. The run ended early; the checks above are all it got to.`);
    if (!watch.stalled) {
      // The app or the phone gave out without a stall first: say what is in the way, as a stall does.
      const found = await diagnose({ adb: healthAdb, pkg: PKG }).catch(() => ({ problems: [] }));
      for (const line of describe(found.problems)) print(`  ${line}`);
      stop(watch.fatalStep ?? watch.step, error.message, found.problems);
    }
  }
  stopFrontWatch();
  await stopWatchdog(watch.stalled ? "stalled" : "done");

  meta.seconds = Math.round((Date.now() - t0) / 1000);
  meta.usbDrops = usbDrops;
  meta.stalled = watch.stalled;
  if (usbDrops) results.notCovered.push(`The phone dropped off USB ${usbDrops} time(s); the steps it interrupted failed and say so.`);
  await Promise.all(pendingShots);
  const report = await adb(["exec-out", `run-as ${PKG} cat ${REPORT}`], { buffer: true }).catch(() => Buffer.alloc(0));
  await writeFile(join(OUT, "report.jsonl"), report);
  await writeFile(join(OUT, "results.json"), JSON.stringify({ meta, ...results }, null, 2));
  await writeFile(join(OUT, "summary.md"), summary(meta));
  await writeFile(join(OUT, "index.html"), html(meta));
  const failed = results.checks.filter((c) => c.pass === false).length;
  print(`${results.checks.length} checks, ${failed} failed, in ${meta.seconds} s. ${join(OUT, "summary.md")}`);
  if (watch.stalled) {
    print(`STALLED: "${watch.stalled.step}": ${watch.stalled.why}.`);
    for (const line of watch.stalled.needs) print(line);
  }
  process.exitCode = watch.stalled ? 3 : failed ? 1 : 0;
}

const EMULATOR_PORT = 5584;
let startedEmulator = null;

function sdkRoot() {
  if (/[\\/]platform-tools[\\/]adb(\.exe)?$/i.test(ADB)) return dirname(dirname(ADB));
  return process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? (process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Android", "Sdk") : join(process.env.HOME ?? "", "Android", "Sdk"));
}

/**
 * Which device to drive. By default the emulator, so runs never need the
 * person's phone: a running emulator if there is one, else the --avd (quire)
 * started without a window. --phone drives the phone on USB instead; --serial
 * names a device outright.
 */
async function pickDevice() {
  const ready = (await adb(["devices"]))
    .split("\n")
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts[1] === "device")
    .map((parts) => parts[0]);
  if (opts.phone) {
    const phones = ready.filter((id) => !id.startsWith("emulator-"));
    if (phones.length !== 1) throw new Error(phones.length ? `found ${phones.length} phones; pass --serial` : "no phone on USB (plug it in, or leave out --phone to use the emulator)");
    serial = phones[0];
    say(`device: the phone on USB (${serial})`);
    return;
  }
  const running = ready.find((id) => id.startsWith("emulator-"));
  if (running) {
    serial = running;
    say(`device: the running emulator (${serial})`);
    return;
  }
  serial = await startEmulator();
}

/** Starts the AVD without a window and waits for Android to finish booting. */
async function startEmulator() {
  const exe = join(sdkRoot(), "emulator", process.platform === "win32" ? "emulator.exe" : "emulator");
  if (!existsSync(exe)) throw new Error(`no emulator at ${exe}. Install it once: sdkmanager "emulator" and a system image, then create the "${opts.avd}" AVD (DECISIONS.md, phone tests). Or pass --phone.`);
  const target = `emulator-${EMULATOR_PORT}`;
  const logFile = join(OUT, "emulator.log");
  const fd = openSync(logFile, "a");
  say(`starting the "${opts.avd}" emulator without a window (${target}); its log is ${logFile}`);
  const child = spawn(exe, ["-avd", opts.avd, "-port", String(EMULATOR_PORT), "-no-window", "-no-audio", "-no-boot-anim"], {
    detached: true,
    stdio: ["ignore", fd, fd],
    windowsHide: true,
  });
  closeSync(fd);
  let exited = null;
  child.on("exit", (code) => (exited = code));
  child.on("error", (error) => (exited = error.message));
  child.unref();
  startedEmulator = target;
  const at = adbRunner(ADB, target);
  const start = Date.now();
  let said = start;
  while (Date.now() - start < 6 * 60000) {
    const booted = (await at(["shell", "getprop sys.boot_completed"], { timeout: 5000 }).catch(() => "")).trim();
    if (booted === "1") {
      say(`the emulator booted in ${Math.round((Date.now() - start) / 1000)} s`);
      // Taps and screenshots expect a screen that stays on.
      await at(["shell", "svc power stayon true"], { timeout: 10000 }).catch(() => {});
      await at(["shell", "input keyevent KEYCODE_WAKEUP"], { timeout: 10000 }).catch(() => {});
      return target;
    }
    if (exited !== null) {
      const tail = readFileSync(logFile, "utf8").split("\n").filter(Boolean).slice(-6).join(" | ");
      throw new Error(`the emulator stopped while booting (exit ${exited}): ${tail.slice(0, 600)}`);
    }
    if (Date.now() - said >= 20000) {
      say(`waiting for the emulator to boot (${Math.round((Date.now() - start) / 1000)} s)`);
      said = Date.now();
    }
    await sleep(2000);
  }
  throw new Error(`the emulator did not finish booting within 6 minutes; see ${logFile}`);
}

/**
 * An emulator reaches Metro on the computer at 10.0.2.2; adb reverse to its
 * localhost did not work on the API 36 image. React Native reads the bundler
 * host from "debug_http_host" in the app's default preferences, so it is set
 * there while the app is stopped. Debug builds allow cleartext to 10.0.2.2
 * (plugins/withLocalCleartext.js).
 */
async function pointAtMetro() {
  const xml = `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>\n<map>\n    <string name="debug_http_host">10.0.2.2:8081</string>\n</map>\n`;
  await runAs(`mkdir -p shared_prefs && echo ${b64(xml)} | base64 -d > shared_prefs/${PKG}_preferences.xml`);
  say("emulator: the app loads its code from Metro at 10.0.2.2:8081");
}

/** Puts this checkout's debug build on the device (an emulator gets it without asking). */
async function installDebug() {
  const apk = join(ROOT, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
  if (!existsSync(apk)) throw new Error(`${PKG} is not on ${serial} and there is no debug APK at ${apk}; build it first (gradlew assembleDebug).`);
  say(`installing the debug build (${Math.round(statSync(apk).size / 1e6)} MB) on ${serial}`);
  await quietly(5 * 60000, "installing the debug build", () => adb(["install", "-r", apk], { timeout: 5 * 60000 }));
}

/** The emulator this run started goes again at the end (its quick-boot snapshot makes the next start fast). */
async function stopEmulator() {
  if (!startedEmulator || opts["keep-emulator"]) return;
  say(`stopping the emulator (${startedEmulator}); --keep-emulator leaves it running`);
  await adbRunner(ADB, startedEmulator)(["emu", "kill"], { timeout: 30000 }).catch(() => {});
}

/**
 * Before anything runs: is the phone there, awake, unlocked and free of
 * prompts, and is Metro up? What a script can fix it fixes; what needs a
 * person it says at once and waits for; what needs the PC ends the run here.
 */
async function preflight() {
  const found = await diagnose({ adb: healthAdb, pkg: PKG, needApp: false });
  // The app is started fresh below, so whatever is in front now does not matter.
  let problems = found.problems.filter((p) => p.id !== "other-app" && p.id !== "app-dead" && p.id !== "anr");
  for (const line of describe(problems)) print(`preflight: ${line}`);
  if (problems.some((p) => p.who === "you")) {
    problems = (await waitForPerson(problems)).problems.filter((p) => p.id !== "other-app" && p.id !== "app-dead" && p.id !== "anr");
  }
  if (problems.some((p) => p.who !== "auto")) {
    stop("preflight", "the run cannot start", problems);
    await writeStatus();
    process.exitCode = 3;
    return false;
  }
  const fixes = await autoFix(problems, { adb: healthAdb, pkg: PKG, activity: ACTIVITY });
  if (fixes.length) print(`preflight: ${fixes.join(", ")}`);
  return true;
}

process.on("SIGINT", () => {
  void restoreRotation().finally(() => process.exit(130));
});

// The PC must not sleep in the middle of a run (it did once, for two hours).
const releaseAwake = keepAwake();

main()
  .catch(async (error) => {
    console.error(error.message);
    await restoreRotation();
    process.exitCode = 2;
  })
  .finally(async () => {
    clearInterval(watch.timer);
    stopFrontWatch();
    closeShells();
    await stopEmulator().catch(() => {});
    releaseAwake();
  });
