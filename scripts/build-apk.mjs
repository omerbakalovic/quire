#!/usr/bin/env node
/**
 * Builds the everyday Quire app: a release APK with the JavaScript and the
 * reader page inside it, so it opens from the launcher with no computer,
 * Metro or USB. It installs as app.quire.reader ("Quire"), beside the debug
 * build ("Quire Dev", app.quire.reader.dev) that the phone matrix drives.
 *
 *   npm run apk -- [--install] [--serial SERIAL] [--all-abis]
 *
 * The APK lands in dist/Quire-<version>.apk. It is signed with the debug key
 * from the Expo template, which is fine for installing on your own phone and
 * not for a store upload. --install puts it on the USB phone with adb.
 * --all-abis also builds 32-bit ARM and x86 (emulators); the default is
 * arm64-v8a, which every current phone uses, and builds much faster.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const windows = process.platform === "win32";

function run(command, commandArgs, cwd = root) {
  console.log(`\n> ${command} ${commandArgs.join(" ")}`);
  const result = spawnSync(command, commandArgs, { cwd, stdio: "inherit", shell: windows });
  if (result.status !== 0) {
    console.error(`\n${command} failed (exit ${result.status ?? result.signal}).`);
    process.exit(result.status ?? 1);
  }
}

const identity = JSON.parse(readFileSync(join(root, "src/config/identity.json"), "utf8"));

run("node", ["scripts/bundle-reader.mjs"]);
// Writes android/ from app.config.ts and the plugins. Prebuild may clear android/ first,
// so local.properties (sdk.dir, and on Windows cmake.dir for long paths) is kept aside
// and put back afterwards.
const localProperties = join(root, "android", "local.properties");
const savedProperties = existsSync(localProperties) ? readFileSync(localProperties) : null;
run("npx", ["expo", "prebuild", "--platform", "android", "--no-install"]);
if (savedProperties) writeFileSync(localProperties, savedProperties);

const gradleArgs = ["assembleRelease"];
if (!flag("--all-abis")) gradleArgs.push("-PreactNativeArchitectures=arm64-v8a");
// An absolute path: cmd.exe does not find gradlew.bat in the working directory when spawned this way.
const gradlew = join(root, "android", windows ? "gradlew.bat" : "gradlew");
run(windows ? `"${gradlew}"` : gradlew, gradleArgs, join(root, "android"));

const built = join(root, "android/app/build/outputs/apk/release/app-release.apk");
if (!existsSync(built)) {
  console.error(`Gradle finished but ${built} is missing.`);
  process.exit(1);
}
mkdirSync(join(root, "dist"), { recursive: true });
const apk = join(root, "dist", `Quire-${identity.version}.apk`);
copyFileSync(built, apk);
console.log(`\nBuilt ${apk}`);

if (flag("--install")) {
  const adb = option("--adb") ?? "adb";
  const serial = option("--serial");
  run(adb, [...(serial ? ["-s", serial] : []), "install", "-r", apk]);
  console.log(`Installed. Open "Quire" from the phone's app drawer.`);
} else {
  console.log(`Install it with: adb install -r "${apk}"  (or copy the file to the phone and open it)`);
}
