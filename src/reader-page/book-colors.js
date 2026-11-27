/**
 * "Book colours: keep" (docs/customization-roadmap.md, C4). The book keeps its
 * own text colours, except one too faint to read on the theme's page (under
 * 3:1), such as black text from the book on a dark page. Those elements get
 * an attribute, and the reading CSS (src/settings/reading-css.ts) gives them
 * the theme's ink, or its link colour inside a link.
 *
 * Measured once per section and again on every look change, always with the
 * attributes off first, so the book's own colours are what is measured.
 */
export const FAINT_ATTR = "data-quire-faint";
const MINIMUM = 3;
const MAX_ELEMENTS = 20000;

let enabled = false;

/** A computed CSS colour: rgb(), rgba(), either syntax. Null for anything else (transparent counts as alpha 0). */
export function parseCssColor(text) {
  if (typeof text !== "string") return null;
  const value = text.trim().toLowerCase();
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const match = /^rgba?\(([^)]+)\)$/.exec(value);
  if (!match) return null;
  const parts = match[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const channel = (part) => (part.endsWith("%") ? (parseFloat(part) / 100) * 255 : parseFloat(part));
  const [r, g, b] = parts.slice(0, 3).map(channel);
  let a = parts.length > 3 ? parseFloat(parts[3]) : 1;
  if (parts[3]?.endsWith("%")) a = parseFloat(parts[3]) / 100;
  if (![r, g, b, a].every(Number.isFinite)) return null;
  return { r, g, b, a: Math.min(1, Math.max(0, a)) };
}

/** #rrggbb (an alpha byte is ignored) as a colour, or null. */
export function parseHexColor(hex) {
  const match = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(typeof hex === "string" ? hex : "");
  if (!match) return null;
  const n = Number.parseInt(match[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
}

/** `top` drawn over an opaque `bottom`. */
export function over(top, bottom) {
  const a = top.a;
  return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
}

function luminance({ r, g, b }) {
  const c = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

export function contrastRatio(a, b) {
  const [la, lb] = [luminance(a), luminance(b)];
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Whether the element holds text of its own, not only other elements. */
function hasOwnText(element) {
  for (const node of element.childNodes) {
    if (node.nodeType === 3 && node.nodeValue.trim()) return true;
  }
  return false;
}

/**
 * The colour behind an element: the nearest background that isn't
 * transparent, over the page. A half-transparent one is mixed with what is under it.
 */
function backgroundOf(element, view, page, cache) {
  const chain = [];
  let node = element;
  let base = page;
  while (node && node.nodeType === 1) {
    if (cache.has(node)) {
      base = cache.get(node);
      break;
    }
    chain.push(node);
    node = node.parentElement;
  }
  // From the outermost uncached ancestor inwards, each over what is under it.
  for (let i = chain.length - 1; i >= 0; i--) {
    const bg = parseCssColor(view.getComputedStyle(chain[i]).backgroundColor);
    // html and body are always the theme's page (reading CSS), whatever they compute to.
    const own = chain[i].localName === "html" || chain[i].localName === "body" ? null : bg;
    if (own && own.a > 0) base = over(own, base);
    cache.set(chain[i], base);
  }
  return base;
}

/** Mark the elements of one section whose text is too faint on the page. Safe to call again. */
export function markFaintColors(doc, pageHex, on = enabled) {
  const body = doc?.body;
  const view = doc?.defaultView;
  if (!body || !view) return 0;
  for (const element of Array.from(doc.querySelectorAll(`[${FAINT_ATTR}]`))) element.removeAttribute(FAINT_ATTR);
  const page = parseHexColor(pageHex);
  if (!on || !page) return 0;
  const cache = new Map();
  const faint = [];
  const elements = body.getElementsByTagName("*");
  for (let i = 0; i < elements.length && i < MAX_ELEMENTS; i++) {
    const element = elements[i];
    if (!hasOwnText(element)) continue;
    const fg = parseCssColor(view.getComputedStyle(element).color);
    if (!fg) continue;
    const bg = backgroundOf(element, view, page, cache);
    if (contrastRatio(over(fg, bg), bg) < MINIMUM) faint.push(element);
  }
  // All measured before any is marked, since marking one changes what its children inherit.
  for (const element of faint) element.setAttribute(FAINT_ATTR, "");
  return faint.length;
}

let pageColor = null;

/** A new look from the host: remember the mode for sections still to load, and redo the ones shown. */
export function setFaintFix(view, look) {
  enabled = look?.faintFix === true;
  pageColor = typeof look?.page === "string" ? look.page : null;
  for (const { doc } of view?.renderer?.getContents?.() ?? []) markFaintColors(doc, pageColor);
}

/** One section just loaded. */
export function applyFaintFix(doc) {
  markFaintColors(doc, pageColor);
}
