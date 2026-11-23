/**
 * Text size relative to the book's own (Aa > Size). With the book's styles on,
 * a plain `html { font-size: 110% }` misses books that size their text in px
 * or pt on html or body, and can even shrink a book whose html is 24px. So the
 * page measures the book's own html and body sizes in each section, with
 * Quire's size rule off, and sets both to that size times the scale. The rule
 * itself is in the reading CSS (src/settings/reading-css.ts) and applies only
 * while the attribute is set.
 */
export const SIZE_ATTR = "data-quire-size";

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
  if (value === 1) return;
  const view = doc.defaultView;
  const htmlPx = parseFloat(view?.getComputedStyle(root).fontSize ?? "");
  const bodyPx = parseFloat(view?.getComputedStyle(body).fontSize ?? "");
  if (!(htmlPx > 0) || !(bodyPx > 0)) return;
  root.style.setProperty("--quire-html-size", `${(htmlPx * value).toFixed(2)}px`);
  root.style.setProperty("--quire-body-size", `${(bodyPx * value).toFixed(2)}px`);
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
