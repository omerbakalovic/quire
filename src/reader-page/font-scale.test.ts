import assert from "node:assert/strict";
import { test } from "node:test";

import { applyFontScale, fontScaleOf, scaleAbsoluteSizes, SCALE_VAR, SIZE_ATTR } from "./font-scale.js";

// @ts-expect-error jsdom ships no types here.
import { JSDOM } from "jsdom";

/** A section document whose book CSS gives html and body these sizes, unless Quire's attribute is set. */
function fakeDoc(htmlPx: number, bodyPx: number) {
  const attrs = new Map<string, string>();
  const props = new Map<string, string>();
  const root = {
    style: { setProperty: (k: string, v: string) => props.set(k, v), removeProperty: (k: string) => props.delete(k) },
    setAttribute: (k: string, v: string) => attrs.set(k, v),
    removeAttribute: (k: string) => attrs.delete(k),
  };
  const body = {};
  const sized = () => attrs.has(SIZE_ATTR);
  const doc = {
    documentElement: root,
    body,
    defaultView: {
      getComputedStyle: (el: unknown) => ({
        fontSize: `${el === root ? (sized() ? parseFloat(props.get("--quire-html-size")!) : htmlPx) : sized() ? parseFloat(props.get("--quire-body-size")!) : bodyPx}px`,
      }),
    },
  };
  return { doc, attrs, props };
}

test("the book's own px sizes are scaled, so the first step up never shrinks the text", () => {
  const { doc, attrs, props } = fakeDoc(24, 24);
  applyFontScale(doc, 1.05);
  assert.equal(attrs.has(SIZE_ATTR), true);
  assert.equal(props.get("--quire-html-size"), "25.20px");
  assert.equal(props.get("--quire-body-size"), "25.20px");
  // Applying again measures with the rule off, so scales never compound.
  applyFontScale(doc, 1.1);
  assert.equal(props.get("--quire-body-size"), "26.40px");
});

test("a body in pt is scaled too, and 100% clears everything", () => {
  const { doc, attrs, props } = fakeDoc(16, 16);
  applyFontScale(doc, 1.5);
  assert.equal(props.get("--quire-body-size"), "24.00px");
  applyFontScale(doc, 1);
  assert.equal(attrs.has(SIZE_ATTR), false);
  assert.equal(props.size, 0);
});

test("scales from the host are checked", () => {
  assert.equal(fontScaleOf({ fontScale: 1.3 }), 1.3);
  assert.equal(fontScaleOf({ fontScale: 99 }), 1);
  assert.equal(fontScaleOf(null), 1);
  applyFontScale(null, 2);
});

test("absolute sizes below body follow the scale: rules, media rules and inline styles", () => {
  const { window } = new JSDOM(`<!doctype html><html><head><style>
    p { font-size: 16px; line-height: 22px; margin: 0 }
    .rel { font-size: 1.2em; line-height: 1.4 }
    @media screen { h1 { font-size: 28pt !important } }
    .small { font: 12px/16px serif }
  </style></head><body><p style="font-size: 18px">x</p></body></html>`);
  const doc = window.document;
  scaleAbsoluteSizes(doc);
  scaleAbsoluteSizes(doc); // a second pass changes nothing
  const rules = Array.from(doc.styleSheets[0].cssRules) as any[];
  const wrap = (v: string) => `calc(${v} * var(${SCALE_VAR}, 1))`;
  assert.equal(rules[0].style.getPropertyValue("font-size"), wrap("16px"));
  assert.equal(rules[0].style.getPropertyValue("line-height"), wrap("22px"));
  assert.equal(rules[0].style.getPropertyValue("margin"), "0");
  assert.equal(rules[1].style.getPropertyValue("font-size"), "1.2em");
  assert.equal(rules[1].style.getPropertyValue("line-height"), "1.4");
  assert.equal(rules[2].cssRules[0].style.getPropertyValue("font-size"), wrap("28pt"));
  assert.equal(rules[2].cssRules[0].style.getPropertyPriority("font-size"), "important");
  // jsdom doesn't expand the font shorthand; Chromium does, and the desktop smoke test covers it.
  assert.equal((doc.querySelector("p") as any).style.getPropertyValue("font-size"), wrap("18px"));
});
