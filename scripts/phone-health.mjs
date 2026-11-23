#!/usr/bin/env node
/**
 * What is in the way of a phone run: adb, the USB link, the phone's screen,
 * a system prompt waiting for a tap, the app, Metro and `adb reverse`.
 *
 *   npm run phone-doctor -- [--serial SERIAL] [--adb PATH] [--package ID] [--no-metro] [--fix]
 *
 * Prints what it found, one problem per line, each marked with who can fix it:
 *   auto  the scripts fix it themselves (--fix does it here)
 *   you   someone at the phone has to (tap a prompt, plug the cable in, unlock)
 *   pc    someone at the PC has to (start Metro)
 * Exit code 0 when nothing is in the way, 3 when something is.
 *
 * The phone matrix's stall watchdog and `npm run phone-watch` use the same
 * checks (diagnose and autoFix below).
 */
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const DEFAULT_PACKAGE = "app.quire.reader.dev";
export const METRO_STATUS = "http://127.0.0.1:8081/status";

/** The SDK's adb, not a second copy: two adb servers cut each other's connection. */
export function findAdb(explicit) {
  if (explicit) return explicit;
  if (process.env.ADB) return process.env.ADB;
  const exe = process.platform === "win32" ? "adb.exe" : "adb";
  const sdks = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Android", "Sdk"),
    process.env.HOME && join(process.env.HOME, "Android", "Sdk"),
  ];
  for (const sdk of sdks) {
    if (sdk && existsSync(join(sdk, "platform-tools", exe))) return join(sdk, "platform-tools", exe);
  }
  return "adb";
}

/** adb with a hard timeout; rejects with `timedOut` set when adb itself hung. */
export function adbRunner(adbPath, serial) {
  return (args, { timeout = 8000, serialLess = false } = {}) =>
    new Promise((done, fail) => {
      const full = serial && !serialLess ? ["-s", serial, ...args] : args;
      execFile(adbPath, full, { encoding: "utf8", timeout, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          error.timedOut = Boolean(error.killed || error.signal === "SIGTERM");
          error.output = `${stdout ?? ""}${stderr ?? ""}`.trim();
          error.message = `adb ${args.join(" ")}: ${error.timedOut ? `no answer within ${timeout} ms` : error.output || error.message}`;
          fail(error);
        } else done(String(stdout));
      });
    });
}

/**
 * Keeps the computer from going to sleep until the returned function is called
 * or this process ends. Nothing in the power settings changes: on Windows a
 * hidden PowerShell holds SetThreadExecutionState(ES_CONTINUOUS |
 * ES_SYSTEM_REQUIRED) and exits, which ends the hold, when its stdin closes.
 * The screen may still turn off. On macOS it uses caffeinate; elsewhere it does nothing.
 */
export function keepAwake() {
  let child = null;
  try {
    if (process.platform === "win32") {
      const script = [
        '$t = Add-Type -Name Power -Namespace QuireAwake -PassThru -MemberDefinition \'[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);\'',
        "[void]$t::SetThreadExecutionState([uint32]2147483649)",
        "[void][Console]::In.ReadToEnd()",
      ].join("; ");
      child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], {
        stdio: ["pipe", "ignore", "ignore"],
        windowsHide: true,
      });
    } else if (process.platform === "darwin") {
      child = spawn("caffeinate", ["-i", "-w", String(process.pid)], { stdio: ["pipe", "ignore", "ignore"] });
    }
    child?.on("error", () => {});
    child?.stdin?.on("error", () => {});
  } catch {
    child = null;
  }
  return () => {
    try {
      child?.stdin?.end();
      child?.kill();
    } catch {
      // already gone
    }
    child = null;
  };
}

const problem = (id, who, what, fix) => ({ id, who, what, fix });

/**
 * The window in front, sorted into what it means for a run. `focus` is the
 * mCurrentFocus (or mFocusedApp) line from `dumpsys window`.
 */
export function classifyFocus(focus, pkg) {
  const line = focus ?? "";
  if (/Application Not Responding|AppNotResponding|Application Error|isn.t responding/i.test(line)) {
    return line.includes(pkg)
      ? problem("anr", "auto", `Android's "${pkg} isn't responding" dialog is on the screen`, "restart the app")
      : problem("anr-other", "you", `another app's "isn't responding" dialog is on the screen`, "Close the \"isn't responding\" dialog on the phone");
  }
  if (/packageinstaller|AdbInstall|permcenter\.install|InstallStart|InstallConfirm/i.test(line)) {
    return problem("install-prompt", "you", "an install confirmation is waiting on the phone", "Tap Install (or Allow) on the phone's \"Install via USB\" screen");
  }
  if (/permissioncontroller|GrantPermissions/i.test(line)) {
    return problem("permission-prompt", "you", "a permission prompt is waiting on the phone", "Answer the permission prompt on the phone (Allow)");
  }
  if (/UsbDebugging|UsbPermission|UsbConfirm|UsbResolver/i.test(line)) {
    return problem("usb-prompt", "you", "a USB prompt is waiting on the phone", "Tap Allow on the phone's USB prompt");
  }
  if (/Keyguard|Bouncer|LockScreen/i.test(line)) {
    return problem("locked", "you", "the phone is locked", "Unlock the phone");
  }
  if (/NotificationShade|StatusBar|ControlCenter/i.test(line)) {
    // Someone is looking at a notification: wait for them, and close it only after a minute.
    return { ...problem("shade", "you", "the notification shade is pulled down over the app", "Close the notification shade (the run waits, and closes it itself after a minute)"), lateFix: 60000 };
  }
  if (line.includes(pkg)) return null;
  if (/=null\b/.test(line) || !line.trim()) return null; // between windows, e.g. while an activity starts
  const other = /u0 ([\w.]+)\//.exec(line)?.[1] ?? "another app";
  return problem("other-app", "auto", `${other} is in front instead of the app`, "bring the app back to the front");
}

async function metroStatus(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const text = await response.text();
    return text.includes("packager-status:running") ? "running" : `answered "${text.slice(0, 60)}"`;
  } catch (error) {
    return error?.name === "TimeoutError" ? "hung" : "down";
  }
}

/**
 * Looks at everything a run depends on and says what is wrong. Each check has
 * its own short timeout, so this answers within about 20 s even when adb hangs.
 * `adb` is a function from adbRunner (or one with the same shape).
 */
export async function diagnose({ adb, pkg = DEFAULT_PACKAGE, metro = true, metroUrl = METRO_STATUS, needApp = true } = {}) {
  const facts = {};
  const problems = [];

  let state;
  try {
    state = (await adb(["get-state"], { timeout: 8000 })).trim();
  } catch (error) {
    if (error.timedOut) {
      facts.adb = "hung";
      problems.push(problem("adb-hung", "auto", "adb itself stopped answering", "restart the adb server (a scrcpy mirror closes with it)"));
      return { facts, problems };
    }
    state = /unauthorized/i.test(error.output ?? "") ? "unauthorized" : /offline/i.test(error.output ?? "") ? "offline" : "missing";
  }
  facts.phone = state;
  if (state === "unauthorized") {
    problems.push(problem("unauthorized", "you", "the phone has not allowed USB debugging from this PC", "Tap Allow on the phone's \"Allow USB debugging?\" prompt"));
  } else if (state === "offline") {
    problems.push(problem("offline", "auto", "the phone is on USB but adb lost its link", "reconnect adb"));
  } else if (state !== "device") {
    problems.push(problem("phone-gone", "you", "the phone is not on USB", "Plug the phone back in (the cable or port is loose)"));
  }
  if (state !== "device") {
    if (metro) facts.metro = await metroStatus(metroUrl);
    return { facts, problems };
  }

  let screen = "";
  try {
    screen = await adb(
      [
        "shell",
        `dumpsys power | grep -m1 -E 'mWakefulness='; dumpsys window | grep -E 'mCurrentFocus=|mFocusedApp=|mDreamingLockscreen=|mShowingLockscreen=|isKeyguardShowing=' | head -6; dumpsys deviceidle | grep -m2 -E 'mScreenOn=|mScreenLocked='; echo pid=$(pidof ${pkg})`,
      ],
      { timeout: 12000 },
    );
  } catch (error) {
    facts.shell = error.timedOut ? "hung" : "failed";
    problems.push(
      error.timedOut
        ? problem("adb-hung", "auto", "adb shell on the phone stopped answering", "restart the adb server (a scrcpy mirror closes with it)")
        : problem("shell-failed", "auto", `adb shell failed (${(error.output ?? error.message).slice(0, 80)})`, "reconnect adb"),
    );
    return { facts, problems };
  }
  const wake = /mWakefulness=(\w+)/.exec(screen)?.[1];
  const focus = /mCurrentFocus=.*/.exec(screen)?.[0] ?? /mFocusedApp=.*/.exec(screen)?.[0] ?? "";
  const locked =
    /mDreamingLockscreen=true|mShowingLockscreen=true|isKeyguardShowing=true|mScreenLocked=true/.test(screen) ||
    /Keyguard|Bouncer/i.test(focus);
  const pid = /pid=(\d+)/.exec(screen)?.[1] ?? null;
  Object.assign(facts, { screen: wake ?? "unknown", locked, focus: focus.trim().slice(0, 160), appPid: pid });

  if (wake && wake !== "Awake") problems.push(problem("asleep", locked ? "you" : "auto", `the screen is off (${wake})`, locked ? "Wake and unlock the phone" : "wake the screen"));
  if (locked) {
    if (!problems.some((p) => p.id === "asleep")) problems.push(problem("locked", "you", "the phone is locked", "Unlock the phone"));
  } else {
    const found = classifyFocus(focus, pkg);
    if (found) problems.push(found);
  }
  if (needApp && !pid) problems.push(problem("app-dead", "auto", "the app is not running", "start the app"));

  if (metro) {
    facts.metro = await metroStatus(metroUrl);
    if (facts.metro === "hung") problems.push(problem("metro-hung", "pc", "Metro does not answer", "Restart Metro: npx expo start --clear"));
    else if (facts.metro !== "running") problems.push(problem("metro-down", "pc", `Metro is not running (${facts.metro})`, "Start Metro: npx expo start --clear"));
    try {
      const reverse = await adb(["reverse", "--list"], { timeout: 6000 });
      facts.reverse = reverse.includes("tcp:8081");
      if (!facts.reverse) problems.push(problem("no-reverse", "auto", "adb reverse for Metro is missing", "add adb reverse tcp:8081 tcp:8081"));
    } catch {
      facts.reverse = "unknown";
    }
  }
  return { facts, problems };
}

/** Does what the scripts can do themselves about `problems`; returns what it did. */
export async function autoFix(problems, { adb, pkg = DEFAULT_PACKAGE, activity = `${pkg}/app.quire.reader.MainActivity` } = {}) {
  const done = [];
  const attempt = async (label, args, timeout = 10000) => {
    try {
      await adb(args, { timeout });
      done.push(label);
    } catch (error) {
      done.push(`${label} failed (${error.message.slice(0, 80)})`);
    }
  };
  for (const p of problems.filter((x) => x.who === "auto" || x.forceFix)) {
    if (p.id === "adb-hung") {
      await attempt("restarted the adb server", ["kill-server"], 10000);
      await attempt("adb server started", ["start-server"], 20000);
    } else if (p.id === "offline" || p.id === "shell-failed") {
      await attempt("reconnected adb", ["reconnect", "offline"], 10000);
    } else if (p.id === "asleep") {
      await attempt("woke the screen", ["shell", "input keyevent KEYCODE_WAKEUP"]);
    } else if (p.id === "shade") {
      await attempt("closed the notification shade", ["shell", "cmd statusbar collapse"]);
    } else if (p.id === "anr") {
      await attempt("stopped the app", ["shell", `am force-stop ${pkg}`]);
      await attempt("started the app", ["shell", `am start -n ${activity}`]);
    } else if (p.id === "other-app" || p.id === "app-dead") {
      await attempt("brought the app to the front", ["shell", `am start -n ${activity}`]);
    } else if (p.id === "no-reverse") {
      await attempt("restored adb reverse", ["reverse", "tcp:8081", "tcp:8081"]);
    }
  }
  return done;
}

/** One line per problem, for the console. */
export function describe(problems) {
  if (!problems.length) return ["nothing in the way"];
  return problems.map((p) => `[${p.who}] ${p.what}${p.who === "auto" ? ` (will ${p.fix})` : `: ${p.fix}`}`);
}

/** The "NEEDS YOU" / "NEEDS PC" lines for problems nobody but a person can fix. */
export function needs(problems) {
  const lines = [];
  const you = problems.filter((p) => p.who === "you").map((p) => p.fix);
  const pc = problems.filter((p) => p.who === "pc").map((p) => p.fix);
  if (you.length) lines.push(`NEEDS YOU: ${[...new Set(you)].join("; ")}`);
  if (pc.length) lines.push(`NEEDS PC: ${[...new Set(pc)].join("; ")}`);
  return lines;
}

async function cli() {
  const { values } = parseArgs({
    options: {
      serial: { type: "string" },
      adb: { type: "string" },
      package: { type: "string", default: DEFAULT_PACKAGE },
      "no-metro": { type: "boolean", default: false },
      fix: { type: "boolean", default: false },
    },
  });
  const adb = adbRunner(findAdb(values.adb), values.serial ?? process.env.ANDROID_SERIAL);
  const opts = { adb, pkg: values.package, metro: !values["no-metro"], needApp: false };
  let { facts, problems } = await diagnose(opts);
  console.log(Object.entries(facts).map(([k, v]) => `${k}: ${v}`).join("\n"));
  for (const line of describe(problems)) console.log(line);
  if (values.fix && problems.some((p) => p.who === "auto")) {
    for (const line of await autoFix(problems, opts)) console.log(`fix: ${line}`);
    ({ problems } = await diagnose(opts));
    for (const line of describe(problems)) console.log(`after: ${line}`);
  }
  for (const line of needs(problems)) console.log(line);
  process.exitCode = problems.length ? 3 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) void cli();
