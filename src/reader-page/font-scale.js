/**
 * Text size relative to the book's own (Aa > Size). With the book's styles on,
 * a plain `html { font-size: 110% }` misses books that size their text in px
 * or pt on html or body, and can even shrink a book whose html is 24px. So the
 * page measures the book's own html and body sizes in each section, with
 * Quire's size rule off, and sets both to that size times the scale. The rule
 * itself is in the reading CSS (src/settings/reading-css.ts) and applies only
 * while the attribute is set.
 *
 * Text sized in absolute units further down (`p { font-size: 16px }`, inline
 * styles, the `font` shorthand) inherits nothing from html or body, so those
 * values are rewritten once per section to `calc(<value> * var(--quire-scale, 1))`,
 * line heights in absolute units with them so lines never overlap (emulator run 11).
 * Relative sizes need nothing: they follow html and body.
 */
export const SIZE_ATTR = "data-quire-size";
export const SCALE_VAR = "--quire-scale";

const ABSOLUTE = /\d(px|pt|pc|in|cm|mm|q)\b/i;
const done = new WeakSet();

/** Wrap one declaration block's absolute font size and line height in the scale. */
export function scaleDeclarations(style) {
  if (!style || done.has(style)) return;
  done.add(style);
  for (const property of ["font-size", "line-height"]) {
    const value = style.getPropertyValue(property).trim();
    if (!value || !ABSOLUTE.test(value) || value.includes(SCALE_VAR)) continue;
    style.setProperty(property, `calc(${value} * var(${SCALE_VAR}, 1))`, style.getPropertyPriority(property));
  }
}

function scaleRules(rules) {
  for (const rule of Array.from(rules ?? [])) {
    if (rule.style) scaleDeclarations(rule.style);
    // @media, @supports, @layer and nested rules.
    if (rule.cssRules) scaleRules(rule.cssRules);
  }
}

/** Rewrite a section's absolute text sizes to follow the scale. Safe to call again. */
export function scaleAbsoluteSizes(doc) {
  for (const sheet of Array.from(doc?.styleSheets ?? [])) {
    let rules = null;
    try {
      rules = sheet.cssRules;
    } catch {
      // A sheet the page can't read (another origin) keeps its sizes.
      continue;
    }
    scaleRules(rules);
  }
  for (const element of Array.from(doc?.querySelectorAll?.("[style]") ?? [])) scaleDeclarations(element.style);
}

let scale = 1;

export function fontScaleOf(look) {
  const value = look?.fontScale;
  return typeof value === "number" && Number.isFinite(value) && value >= 0.3 && value <= 4 ? value : 1;
}

/** Measure and scale one section document. Safe to call again; it always measures with the rule off. */
export function applyFontScale(doc, value = scale) {
  const root = doc?.documentElement;
  const body = doc?.body;
  if (!root || !body) return;
  root.removeAttribute(SIZE_ATTR);
  root.style.removeProperty("--quire-html-size");
  root.style.removeProperty("--quire-body-size");
  // Measure the book's own sizes: without the variable, rewritten values count at 1.
  root.style.removeProperty(SCALE_VAR);
  if (value === 1) return;
  scaleAbsoluteSizes(doc);
  const view = doc.defaultView;
  const htmlPx = parseFloat(view?.getComputedStyle(root).fontSize ?? "");
  const bodyPx = parseFloat(view?.getComputedStyle(body).fontSize ?? "");
  if (!(htmlPx > 0) || !(bodyPx > 0)) return;
  root.style.setProperty("--quire-html-size", `${(htmlPx * value).toFixed(2)}px`);
  root.style.setProperty("--quire-body-size", `${(bodyPx * value).toFixed(2)}px`);
  root.style.setProperty(SCALE_VAR, String(value));
  root.setAttribute(SIZE_ATTR, "");
}

/** A new scale from the host: remember it for sections still to load, and apply it to the ones shown. */
export function setFontScale(view, look) {
  scale = fontScaleOf(look);
  for (const { doc } of view?.renderer?.getContents?.() ?? []) applyFontScale(doc, scale);
}

export function currentFontScale() {
  return scale;
}
