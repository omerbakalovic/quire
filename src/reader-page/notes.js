/**
 * Noterefs and their notes, Quire's own code. foliate's footnote handler is
 * not bundled: on the phone it built detached views ("doc is null") and it
 * extracted empty-anchor notes wrong (see PROGRESS.md, Milestone 3 notes).
 *
 * classify: is this link a noteref? Semantic markup first (epub:type noteref,
 * role doc-noteref), then the heuristic for plain books: a short numeric,
 * symbol or bracketed label, or a <sup> link, whose target is note-like.
 * extract: the note's block, as sanitized HTML, without its back-link.
 */

const NOTE_TYPES = ["footnote", "endnote", "rearnote", "note"];
const NOTE_ROLES = ["doc-footnote", "doc-endnote", "doc-note"];
const NOTE_LIST_TYPES = ["endnotes", "footnotes", "rearnotes", "notes"];
const NOTE_LIST_ROLES = ["doc-endnotes", "doc-footnotes"];
const BLOCKS = "aside, li, p, div, dd, blockquote, section, td";
const BACK_TEXT = /^\s*(?:[↩↪↑⤴⬑⏎◄◀]︎?|back|return|\^)\s*$/i;
const LABEL = /^\s*[[(]?\s*(?:\d{1,4}|[ivxlcdm]{1,6}|[a-z]|[*†‡§¶#‖]{1,3})\s*[\])]?\s*$/i;

function tokens(el, name) {
  return (el?.getAttribute?.(name) ?? "").toLowerCase().split(/\s+/).filter(Boolean);
}

function epubType(el) {
  // In a text/html document the attribute is literally named "epub:type".
  return tokens(el, "epub:type");
}

export function isSemanticNoteref(a) {
  return epubType(a).includes("noteref") || tokens(a, "role").includes("doc-noteref");
}

function isNoteElement(el) {
  if (!el || el.nodeType !== 1) return false;
  const types = epubType(el);
  if (NOTE_TYPES.some((type) => types.includes(type))) return true;
  if (NOTE_ROLES.some((role) => tokens(el, "role").includes(role))) return true;
  return el.localName === "aside";
}

function isNoteList(el) {
  if (!el || el.nodeType !== 1) return false;
  const types = epubType(el);
  if (NOTE_LIST_TYPES.some((type) => types.includes(type))) return true;
  if (NOTE_LIST_ROLES.some((role) => tokens(el, "role").includes(role))) return true;
  const hint = `${el.id ?? ""} ${el.getAttribute?.("class") ?? ""}`.toLowerCase();
  return /\b(?:foot|end|rear)?notes?\b|footnote|endnote/.test(hint);
}

/** A heading or a sectioning start is a chapter link, never a note. */
function isChapterTarget(el) {
  if (!el || el.nodeType !== 1) return true;
  if (/^h[1-6]$/.test(el.localName)) return true;
  if (el.localName === "body" || el.localName === "html") return true;
  const first = el.firstElementChild;
  return (el.localName === "section" || el.localName === "article") && /^h[1-6]$/.test(first?.localName ?? "");
}

function hasText(el) {
  return (el?.textContent ?? "").replace(/\s+/g, "").length > 0;
}

/** The element a note id points at, by id or by the old name attribute. */
export function findTarget(doc, fragment) {
  if (!doc || !fragment) return null;
  let id = fragment;
  try {
    id = decodeURIComponent(fragment);
  } catch {
    // keep the raw fragment
  }
  return doc.getElementById(id) ?? doc.querySelector(`[name="${CSS.escape(id)}"]`);
}

/**
 * The note block for a target. An id on a note element is that note. An id on
 * an element with text is the block around it. An id on an empty anchor marks
 * a place, not a block: the note is the block holding the first text after
 * that place (see emptyAnchorBlock).
 */
export function noteBlock(target) {
  if (!target) return null;
  const container = target.closest?.("aside, li, [epub\\:type], [role]");
  if (container && isNoteElement(container)) return [container];
  if (target.localName === "li") return [target];
  if (!hasText(target)) return emptyAnchorBlock(target);
  if (target.localName !== "a" && target.localName !== "span") {
    return target.matches?.(BLOCKS) ? withContinuation(target) : [target.closest(BLOCKS) ?? target];
  }
  const block = target.closest?.("li, p, aside, dd, blockquote");
  if (block) return block.localName === "p" ? withContinuation(block) : [block];
  const div = target.closest?.("div");
  if (div && !containsOtherIds(div, target)) return [div];
  return target.parentElement ? [blockFromAnchor(target, target.parentElement)] : null;
}

const TEXT_BLOCKS = "li, p, aside, dd, dt, blockquote, td, h1, h2, h3, h4, h5, h6, div, section";
const SHOW_TEXT = 4;

/** The first non-blank text node after the target in document order, outside the target. */
function firstTextAfter(target) {
  const doc = target.ownerDocument;
  const root = doc?.body ?? doc?.documentElement;
  if (!root || !doc.createTreeWalker) return null;
  const walker = doc.createTreeWalker(root, SHOW_TEXT);
  walker.currentNode = target;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (target.contains(node)) continue;
    if (node.data.trim()) return node;
  }
  return null;
}

/**
 * An empty anchor (<a id="n1"/>) only marks where its note starts. Read from
 * that place: an enclosing div that holds no other note id and has text after
 * the anchor is the note. Otherwise the note starts at the block of the first
 * text after the anchor, which may be the anchor's own paragraph, a heading
 * that labels the note, or the paragraph after an empty wrapper, and runs on
 * through plain paragraphs until the next id. The note never starts at a
 * heading or block that belongs to someone else's id.
 */
function emptyAnchorBlock(target) {
  const text = firstTextAfter(target);
  if (!text) return null;
  const div = target.closest?.("div");
  if (div && div.contains(text) && !containsOtherIds(div, target) && !hasTextBefore(div, target)) return [div];
  const start = text.parentElement?.closest?.(TEXT_BLOCKS);
  if (!start) return null;
  const ownBlock = start.contains(target);
  if (!ownBlock && /^h[1-6]$/.test(start.localName) && ownsOtherId(start, target)) return null;
  if (!containsOtherIds(start, target)) return withContinuation(start);
  // The text sits loose in a block that holds other notes: take only the child that holds it.
  if (text.parentElement === start) return null;
  return withContinuation(blockFromAnchor(text.parentElement, start));
}

/** True when the block has non-blank text before the target. */
function hasTextBefore(block, target) {
  const walker = block.ownerDocument.createTreeWalker(block, SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (target.contains(node) || target.compareDocumentPosition(node) & 4) return false;
    if (node.data.trim()) return true;
  }
  return false;
}

/** True when the block carries an id of its own, or one inside it, that is not the target's. */
function ownsOtherId(block, target) {
  if ((block.id || block.getAttribute?.("name")) && block !== target) return true;
  return containsOtherIds(block, target);
}

function containsOtherIds(block, target) {
  return Array.from(block.querySelectorAll("[id], a[name]")).some((el) => el !== target && !target.contains(el));
}

function blockFromAnchor(target, block) {
  let node = target;
  while (node.parentElement && node.parentElement !== block) node = node.parentElement;
  return node;
}

function startsNextNote(el) {
  if (!el || el.nodeType !== 1) return true;
  if (/^h[1-6]$/.test(el.localName) || el.localName === "hr") return true;
  if (el.id || el.querySelector("[id], a[name]")) return true;
  return false;
}

function withContinuation(block) {
  const out = [block];
  if (block.localName !== "p" && !/^h[1-6]$/.test(block.localName)) return out;
  let next = block.nextElementSibling;
  while (next && next.localName === "p" && !startsNextNote(next) && out.length < 12) {
    out.push(next);
    next = next.nextElementSibling;
  }
  return out;
}

/** True when the block, or the section that holds it, looks like notes. */
function noteLike(blocks, originId) {
  const [first] = blocks;
  if (!first) return false;
  if (isNoteElement(first)) return true;
  for (let el = first; el; el = el.parentElement) if (isNoteList(el)) return true;
  if (originId) {
    const back = blocks.some((block) =>
      Array.from(block.querySelectorAll("a[href]")).some((a) => (a.getAttribute("href") ?? "").endsWith(`#${originId}`)),
    );
    if (back) return true;
  }
  const doc = first.ownerDocument;
  const docHint = `${doc?.title ?? ""} ${doc?.body?.id ?? ""} ${doc?.body?.getAttribute?.("class") ?? ""}`;
  return /\b(?:foot|end)?notes?\b/i.test(docHint);
}

/**
 * Decide whether a tapped link is a note, before its target is known.
 * "maybe" links are confirmed once the target is found.
 */
export function noterefKind(a, { aggressive = false } = {}) {
  if (!a?.getAttribute?.("href")) return "no";
  if (isSemanticNoteref(a)) return "semantic";
  const text = a.textContent ?? "";
  const inSup = Boolean(a.closest("sup") || a.querySelector("sup"));
  if (LABEL.test(text) || inSup) return "maybe";
  if (aggressive && text.trim().length <= 6) return "maybe";
  // A plain link with its own id into the book: a note only if the target links back to it.
  // That is how hyperlink editions (Power Moby-Dick's "link" edition) mark their notes.
  if (a.id && isBookFragment(a.getAttribute("href"))) return "linked";
  return "no";
}

function isBookFragment(href) {
  return href.includes("#") && !/^[a-z][a-z0-9+.-]*:/i.test(href);
}

function linksBack(blocks, id) {
  return blocks.some((block) =>
    Array.from(block.querySelectorAll?.("a[href]") ?? []).some((a) => (a.getAttribute("href") ?? "").endsWith(`#${id}`)),
  );
}

/** Whether a "maybe" target is really a note. Semantic noterefs skip this. */
export function confirmNote(kind, target, blocks, originId, { aggressive = false } = {}) {
  if (!target || !blocks?.length) return false;
  if (kind === "semantic") return !isChapterTarget(target) || isNoteElement(target);
  if (isChapterTarget(target)) return false;
  if (kind === "linked") return Boolean(originId) && linksBack(blocks, originId);
  if (noteLike(blocks, originId)) return true;
  return aggressive;
}

function isBackLink(a, originId) {
  const href = a.getAttribute("href") ?? "";
  if (tokens(a, "role").includes("doc-backlink") || epubType(a).includes("backlink")) return true;
  if (BACK_TEXT.test(a.textContent ?? "")) return true;
  return Boolean(originId && href.endsWith(`#${originId}`) && (a.textContent ?? "").trim().length <= 3);
}

const ALLOWED = new Set([
  "a", "abbr", "b", "bdi", "bdo", "blockquote", "br", "cite", "code", "dd", "del", "dfn", "div", "dl", "dt",
  "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "ins", "kbd", "li",
  "mark", "ol", "p", "pre", "q", "rp", "rt", "ruby", "s", "samp", "small", "span", "strong", "sub", "sup",
  "table", "tbody", "td", "tfoot", "th", "thead", "time", "tr", "u", "ul", "var", "aside", "section",
]);
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "noscript", "template", "form", "link", "meta"]);
const SMALL_CAPS = /\b(?:small-?caps?|sc|name|initialism)\b/i;

function safeUrl(value, { image }) {
  const url = String(value ?? "").trim();
  if (image) return url.startsWith("blob:") || url.startsWith("data:image/") ? url : null;
  if (url.startsWith("#") || url.startsWith("blob:")) return url;
  if (/^(?:https?|mailto):/i.test(url)) return url;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) return url; // relative book link
  return null;
}

/**
 * Copy an allow-list of elements and attributes into the popup document.
 * Nothing executable survives: no scripts, no handlers, no styles, no
 * javascript: or other schemes. Small caps classes become a class we style.
 */
export function sanitizeInto(targetDoc, nodes, { originId, resolveLink }) {
  const fragment = targetDoc.createDocumentFragment();
  let backHref = null;
  const copy = (node, parent) => {
    if (node.nodeType === 3) {
      parent.append(targetDoc.createTextNode(node.data));
      return;
    }
    if (node.nodeType !== 1) return;
    const name = node.localName;
    if (DROP_WITH_CONTENT.has(name)) return;
    if (name === "a" && isBackLink(node, originId)) {
      backHref ??= node.getAttribute("href");
      return;
    }
    if (!ALLOWED.has(name)) {
      for (const child of node.childNodes) copy(child, parent);
      return;
    }
    const el = targetDoc.createElement(name === "aside" || name === "section" ? "div" : name);
    if (name === "a") {
      const href = safeUrl(node.getAttribute("href"), { image: false });
      if (href) el.setAttribute("data-href", resolveLink ? resolveLink(href) : href);
      if (isSemanticNoteref(node)) el.setAttribute("data-noteref", "1");
      el.setAttribute("href", "#");
    } else if (name === "img") {
      const src = safeUrl(node.getAttribute("src"), { image: true });
      if (!src) return;
      el.setAttribute("src", src);
      const alt = node.getAttribute("alt");
      if (alt) el.setAttribute("alt", alt);
    }
    for (const attr of ["lang", "dir", "colspan", "rowspan"]) {
      const value = node.getAttribute(attr);
      if (value) el.setAttribute(attr, value);
    }
    if (SMALL_CAPS.test(node.getAttribute("class") ?? "")) el.className = "quire-sc";
    parent.append(el);
    for (const child of node.childNodes) copy(child, el);
  };
  for (const node of nodes) copy(node, fragment);
  return { fragment, backHref };
}

/** Noterefs in a section document, in reading order. */
/**
 * The link a click landed on. Uses the composed path, so a link inside a wide
 * table (moved into a shadow root by measure.js) is found too.
 */
export function linkFromEvent(event, selector = "a[href]") {
  const path = event?.composedPath?.() ?? [];
  for (const node of path) {
    if (node?.nodeType === 1 && node.matches?.(selector)) return node;
  }
  return event?.target?.closest?.(selector) ?? null;
}

export function noterefsIn(doc, options) {
  if (!doc?.querySelectorAll) return [];
  return Array.from(doc.querySelectorAll("a[href]")).filter((a) => noterefKind(a, options) !== "no");
}

/**
 * Tiny superscript noterefs get a 44 px hit area that does not move text,
 * and long-press on them does not start a selection.
 */
export const NOTEREF_CSS = [
  "a.quire-noteref { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }",
  "a.quire-noteref-small { position: relative; }",
  "a.quire-noteref-small::after { content: ''; position: absolute; left: 50%; top: 50%;",
  "  width: 44px; height: 44px; transform: translate(-50%, -50%); }",
].join("\n");

export function markNoterefs(doc, options) {
  // Plain id'd links are not marked: most of them are ordinary cross-references.
  for (const a of noterefsIn(doc, options).filter((link) => noterefKind(link, options) !== "linked")) {
    a.classList.add("quire-noteref");
    if ((a.textContent ?? "").trim().length <= 4) a.classList.add("quire-noteref-small");
  }
}

/** Footnote asides that a noteref in this document points at are shown in the popup, not in the text. */
export function hideInlineFootnotes(doc) {
  if (!doc?.querySelectorAll) return 0;
  let hidden = 0;
  for (const aside of doc.querySelectorAll("aside")) {
    if (!epubType(aside).includes("footnote") && !tokens(aside, "role").includes("doc-footnote")) continue;
    if (!aside.id || !doc.querySelector(`a[href$="#${CSS.escape(aside.id)}"]`)) continue;
    aside.style.setProperty("display", "none", "important");
    aside.setAttribute("data-quire-hidden", "1");
    hidden += 1;
  }
  return hidden;
}
