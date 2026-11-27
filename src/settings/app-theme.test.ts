import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { appThemeId, changeSetting, emptyCustomization, resolvedFor, saveProfile, setActiveProfile } from "./customization.ts";
import { readingCss } from "./reading-css.ts";
import { THEME_IDS } from "./registry.ts";
import { contrast, expandTokens, THEMES, withAlpha, type BaseTokens, type ThemeTokens } from "./themes.ts";

// The built-in themes before tokens v2 (C3), copied here so the derivation can't drift silently.
const BEFORE: Record<string, BaseTokens> = {
  light: { page: "#fdfdfb", ink: "#1a1a1a", inkMuted: "#5f5f5f", link: "#1f5fbf", selection: "#b5d3ff", chrome: "#f2f2f0", chromeInk: "#1a1a1a", accent: "#1f5fbf", dark: false },
  night: { page: "#0b0906", ink: "#a8875a", inkMuted: "#6e5a3e", link: "#c08a4a", selection: "#3a2a14", chrome: "#120e09", chromeInk: "#a8875a", accent: "#c08a4a", dark: true },
};

test("built-in themes keep their stated colours, and the reader's control colours stay as they were", () => {
  for (const [id, base] of Object.entries(BEFORE)) {
    const theme = THEMES[id as keyof typeof THEMES];
    for (const [key, value] of Object.entries(base)) assert.equal(theme[key as keyof BaseTokens], value, `${id}.${key}`);
    // The values chromeFor used before C3.
    assert.equal(theme.chromeDivider, withAlpha(base.chromeInk, 0.35));
    assert.equal(theme.sliderTrack, withAlpha(base.chromeInk, 0.25));
    assert.equal(theme.scrim, base.dark ? "#000000aa" : "#00000066");
    assert.equal(theme.accentInk, base.page);
  }
});

test("every built-in theme has every v2 token as a colour", () => {
  const keys = Object.keys(expandTokens(BEFORE.light)) as (keyof ThemeTokens)[];
  for (const id of THEME_IDS) {
    for (const key of keys) {
      if (key === "dark") continue;
      assert.match(String(THEMES[id][key]), /^#[0-9a-f]{6}([0-9a-f]{2})?$/i, `${id}.${key}`);
    }
  }
});

test("a stated v2 token wins over the derived one", () => {
  assert.equal(expandTokens({ ...BEFORE.light, danger: "#ff0000" }).danger, "#ff0000");
});

test("the reader page's CSS is the same as before tokens v2", () => {
  const settings = resolvedFor(emptyCustomization(), null);
  for (const [id, base] of Object.entries(BEFORE)) {
    assert.equal(readingCss(settings, THEMES[id as keyof typeof THEMES]), readingCss(settings, base as ThemeTokens), id);
  }
});

test("the app theme follows the reading theme from profile and global, never a book's", () => {
  let custom = changeSetting(emptyCustomization(), "global", "theme.id", "paper", null);
  assert.equal(appThemeId(custom), "paper");
  custom = changeSetting(custom, "book", "theme.id", "night", "book-1");
  assert.equal(appThemeId(custom), "paper");
  custom = setActiveProfile(saveProfile(custom, "night-reading", "Night reading", { "theme.id": "black" }), "night-reading");
  assert.equal(appThemeId(custom), "black");
});

test("a chosen app theme wins over the reading theme", () => {
  let custom = changeSetting(emptyCustomization(), "global", "theme.id", "paper", null);
  custom = changeSetting(custom, "global", "app.theme", "dark", null);
  assert.equal(appThemeId(custom), "dark");
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

test("no screen or reader control hard-codes a colour (C3); colours come from the theme", () => {
  const root = new URL("../", import.meta.url).pathname;
  const offenders: string[] = [];
  for (const dir of ["app", "reader", "look", "ui"]) {
    for (const file of sources(join(root, dir))) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (/["'`]#[0-9a-fA-F]{3,8}["'`]/.test(line) && !line.includes("colour-ok")) offenders.push(`${file.slice(root.length)}:${index + 1}`);
        });
    }
  }
  assert.deepEqual(offenders, []);
});

test("every built-in theme's text and accents are readable on what they sit on (emulator run 24)", () => {
  const rgb = (hex: string) => hex.slice(0, 7);
  for (const id of THEME_IDS) {
    const t = THEMES[id];
    const pairs: [string, string, string, number][] = [
      ["ink on page", t.ink, t.page, 4.5],
      ["chromeInk on chrome", t.chromeInk, t.chrome, 4.5],
      ["sheetInk on sheet", t.sheetInk, t.sheet, 4.5],
      ["appInk on appBackground", t.appInk, t.appBackground, 4.5],
      ["accent on chrome", t.accent, t.chrome, 3],
      ["accent on page", t.accent, t.page, 3],
      ["accent on sheet", t.accent, t.sheet, 3],
      ["danger on sheet", t.danger, t.sheet, 3],
      ["controlOnInk on controlOn", t.controlOnInk, t.controlOn, 3],
    ];
    for (const [name, fg, bg, minimum] of pairs) {
      const ratio = contrast(rgb(fg), rgb(bg)) ?? 0;
      assert.ok(ratio >= minimum, `${id}: ${name} is ${ratio.toFixed(2)}:1, under ${minimum}:1`);
    }
  }
});
