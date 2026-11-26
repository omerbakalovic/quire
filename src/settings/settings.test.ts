import assert from "node:assert/strict";
import { test } from "node:test";

import { cleanLayer, needsRelayout, resetGroup, resolve, setValue, sourceOf } from "./layers.ts";
import { readingCss, layoutAttributes } from "./reading-css.ts";
import { cleanValue, defaults, SETTINGS } from "./registry.ts";
import { contrast, contrastWarnings, THEMES, themeFor } from "./themes.ts";

test("every registry entry's default passes its own validation", () => {
  const seen = new Set<string>();
  for (const setting of SETTINGS) {
    assert.ok(!seen.has(setting.key), `duplicate ${setting.key}`);
    seen.add(setting.key);
    assert.deepEqual(cleanValue(setting.key, setting.default), setting.default, setting.key);
  }
});

test("values are stepped, clamped, or dropped", () => {
  assert.equal(cleanValue("type.fontSize", 103.4), 103);
  assert.equal(cleanValue("type.fontSize", 105), 105, "sizes saved in the old 5 % steps stay valid");
  assert.equal(cleanValue("page.marginX", 4.6), 5);
  assert.equal(cleanValue("type.fontSize", 9000), 300);
  assert.equal(cleanValue("type.fontSize", "120"), null);
  assert.equal(cleanValue("type.lineHeight", 1.43), 1.45);
  assert.equal(cleanValue("type.fontFamily", "comic-sans"), null);
  assert.equal(cleanValue("type.hyphenation", 1), null);
  assert.equal(cleanValue("no.such.key", 1), null);
});

test("layers resolve top down: session, book, profile, global, default", () => {
  const layers = {
    global: { "type.fontSize": 110, "theme.id": "paper" },
    profile: { "theme.id": "night" },
    book: { "type.fontSize": 130 },
    session: { "type.fontSize": 150 },
  } as const;
  const resolved = resolve(layers);
  assert.equal(resolved["type.fontSize"], 150);
  assert.equal(resolved["theme.id"], "night");
  assert.equal(resolved["type.alignment"], "publisher");
  assert.equal(sourceOf(layers, "type.fontSize"), "session");
  assert.equal(sourceOf(layers, "theme.id"), "profile");
  assert.equal(sourceOf(layers, "type.alignment"), "default");
});

test("a layer only holds the settings it is allowed to", () => {
  // turn.followReduceMotion is global only; type.fontFamily has no session layer.
  const clean = cleanLayer("session", { "type.fontSize": 120, "type.fontFamily": "serif", "turn.followReduceMotion": false, junk: 1 });
  assert.deepEqual(clean, { "type.fontSize": 120 });
  assert.equal(resolve({ book: { "turn.followReduceMotion": false } as never })["turn.followReduceMotion"], true);
  assert.deepEqual(cleanLayer("global", "nope"), {});
});

test("setting a value equal to the layers below clears the override", () => {
  let layers = setValue({ global: { "type.fontSize": 120 } }, "book", "type.fontSize", 140);
  assert.deepEqual(layers.book, { "type.fontSize": 140 });
  layers = setValue(layers, "book", "type.fontSize", 120);
  assert.deepEqual(layers.book, {}, "back to the global value: no stray book override");
  layers = setValue(layers, "global", "type.fontSize", 100);
  assert.deepEqual(layers.global, {}, "back to the default");
  assert.equal(setValue(layers, "book", "type.fontSize", "big"), layers, "invalid values change nothing");
  layers = setValue({ book: { "theme.id": "dark" } }, "book", "theme.id", null);
  assert.deepEqual(layers.book, {}, "null clears: use the global value");
});

test("only layout settings ask for a relayout", () => {
  const base = defaults();
  assert.equal(needsRelayout(base, { ...base, "theme.id": "dark" }), false);
  assert.equal(needsRelayout(base, { ...base, "light.dimmer": 0.5 }), false);
  assert.equal(readingCss({ ...base, "light.dimmer": 0.5, "light.warmth": 0.3 }, THEMES.light), readingCss(base, THEMES.light), "veils never restyle the book");
  assert.equal(needsRelayout(base, { ...base, "type.fontSize": 120 }), true);
});

test("reset clears one group in one layer", () => {
  const layers = resetGroup({ book: { "type.fontSize": 130, "theme.id": "dark" } }, "book", "typography");
  assert.deepEqual(layers.book, { "theme.id": "dark" });
});

test("built-in themes are readable; Night is dim on purpose", () => {
  for (const [id, tokens] of Object.entries(THEMES)) {
    const minimum = id === "night" ? 3 : 4.5;
    assert.deepEqual(contrastWarnings(tokens, minimum), [], id);
  }
  assert.ok((contrast("#000000", "#ffffff") ?? 0) > 20.9);
  assert.equal(contrast("black", "#fff"), null);
  assert.equal(themeFor("unknown"), THEMES.light);
  assert.deepEqual(contrastWarnings({ ...THEMES.light, ink: "#cccccc" }).map((w) => w.pair), ["ink"]);
});

test("defaults leave the book's typography alone but apply the theme", () => {
  const css = readingCss(defaults(), THEMES.light);
  assert.match(css, /background: #fdfdfb !important/);
  assert.doesNotMatch(css, /^(html|body|p)[ ,][^\n]*font-size/m, "only the page-measured size rule, which waits for its attribute");
  assert.match(css, /html\[data-quire-size\] \{ font-size: var\(--quire-html-size\) !important; \}/);
  assert.doesNotMatch(css, /font-family/);
  assert.doesNotMatch(css, /line-height/);
  assert.doesNotMatch(css, /text-align/);
  assert.match(css, /hyphens: manual;/, "hyphenation off, not forced over the book");
  assert.doesNotMatch(css, /color: inherit/, "a light theme keeps the book's coloured callouts");
  assert.match(readingCss(defaults(), THEMES.black), /color: inherit !important/, "a dark theme overrides every element");
});

test("chosen typography is forced, with a glyph fallback chain", () => {
  const css = readingCss(
    { ...defaults(), "type.fontSize": 130, "type.fontFamily": "serif", "type.lineHeight": 1.6, "type.paragraphSpacing": 0.5, "type.alignment": "justify", "type.hyphenation": true },
    THEMES.dark,
  );
  assert.doesNotMatch(css, /html \{ font-size/, "with the book's styles on, the page scales the book's own size");
  assert.match(css, /html\[data-quire-size\] body \{ font-size: var\(--quire-body-size\) !important; \}/);
  assert.match(css, /font-family: Georgia.*"Noto Sans CJK SC".*!important/);
  assert.match(css, /line-height: 1.6 !important/);
  assert.match(css, /margin-bottom: 0.5em !important/);
  assert.match(css, /text-align: justify;/);
  assert.match(css, /hyphens: auto;/);
  assert.match(css, /color-scheme: dark/);
});

test("publisher styles off makes Quire's values win everywhere", () => {
  const css = readingCss({ ...defaults(), "type.publisherStyles": false, "type.alignment": "start" }, THEMES.light);
  assert.match(css, /text-align: start !important/);
  assert.match(css, /letter-spacing: normal !important/);
  const sized = readingCss({ ...defaults(), "type.publisherStyles": false, "type.fontSize": 130 }, THEMES.light);
  assert.match(sized, /html \{ font-size: 130% !important; \}/);
  assert.match(sized, /p, li, blockquote, dd, dt, td, th \{ font-size: 1rem !important; \}/, "running text follows the setting, not the book's px or pt");
  assert.doesNotMatch(sized, /data-quire-size/);
});

test("page settings map to foliate's paginator attributes", () => {
  assert.deepEqual(layoutAttributes({ ...defaults(), "page.marginX": 8, "page.maxWidth": 900 }), { gap: "8%", maxInlineSize: "900px" });
});
