#!/usr/bin/env node
/**
 * Runs one command with the computer kept awake until it ends, for long builds
 * on the phone-testing PC:
 *
 *   npm run awake -- npx expo prebuild --platform android --no-install
 *   npm run awake -- .\android\gradlew.bat -p android assembleDebug
 *
 * Nothing in the power settings changes (see keepAwake in phone-health.mjs).
 * The exit code is the command's own.
 */
import { spawn } from "node:child_process";
import { keepAwake } from "./phone-health.mjs";

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error("usage: npm run awake -- <command> [args...]");
  process.exit(2);
}
const release = keepAwake();
const child = spawn(command, args, { stdio: "inherit", shell: process.platform === "win32" });
const stop = (signal) => child.kill(signal);
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("error", (error) => {
  console.error(`${command}: ${error.message}`);
  release();
  process.exit(127);
});
child.on("exit", (code, signal) => {
  release();
  process.exit(code ?? (signal ? 1 : 0));
});
