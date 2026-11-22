import { confirmNote, findTarget, noteBlock, noterefKind, noterefsIn } from "./notes.js";

/**
 * Debug probes for the phone matrix (scripts/phone-matrix.mjs). The host asks
 * through the app's debug command channel, which only debug builds open. Each
 * probe measures what a person would judge from a screenshot: is there text,
 * is it a readable size, are there blank pages, did a note pop up.
 */

const MAX_TEXT_NODES = 30000;

function directionOf(doc) {
  const style = doc.defaultView.getComputedStyle(doc.body ?? doc.documentElement);
  const vertical = style.writingMode.startsWith("vertical");
  const rtl = doc.body?.dir === "rtl" || style.direction === "rtl" || doc.documentElement.dir === "rtl";
  return { vertical, rtl };
}

/** The font size most of the visible text is set in, weighted by length, so a heading does not decide it. */
function bodyFontPx(range) {
  if (!range) return null;
  const common = range.commonAncestorContainer;
  const root = common.nodeType === 1 ? common : common.parentElement;
  if (!root) return null;
  const view = root.ownerDocument.defaultView;
  const weights = new Map();
  const add = (node) => {
    const length = node.textContent.trim().length;
    if (!length || !range.intersectsNode(node) || !node.parentElement) return;
    const size = parseFloat(view.getComputedStyle(node.parentElement).fontSize);
    if (Number.isFinite(size)) weights.set(size, (weights.get(size) ?? 0) + length);
  };
  if (common.nodeType === 3) add(common);
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  for (let node = walker.nextNode(); node && seen < 400; node = walker.nextNode(), seen++) add(node);
  let best = null;
  for (const [size, weight] of weights) if (best === null || weight > weights.get(best)) best = size;
  return best;
}

function visibleMedia(range) {
  if (!range) return { images: 0, broken: 0 };
  let images = 0;
  let broken = 0;
  const root = range.commonAncestorContainer;
  const scope = root.nodeType === 1 ? root : root.parentElement;
  for (const el of scope?.querySelectorAll?.("img, svg, image, video, canvas") ?? []) {
    if (!range.intersectsNode(el)) continue;
    images++;
    if (el.localName === "img" && el.complete && el.naturalWidth === 0) broken++;
  }
  // A range inside a single image's parent can miss the element itself.
  if (scope?.matches?.("img, svg, image")) images = Math.max(images, 1);
  return { images, broken };
}

function frameScale(frame, rect = frame.getBoundingClientRect()) {
  return frame.offsetWidth ? rect.width / frame.offsetWidth : 1;
}

/**
 * What is on screen. foliate reports no range for a fixed-layout page, which is
 * shown whole, so there the range is each visible page's body.
 */
function screenRanges(view, range) {
  if (range) return [range];
  if (!view.isFixedLayout) return [];
  const out = [];
  for (const { doc } of view.renderer.getContents?.() ?? []) {
    const frame = doc?.defaultView?.frameElement;
    if (!doc?.body || !frame || frame.getBoundingClientRect().width === 0) continue;
    const r = doc.createRange();
    r.selectNodeContents(doc.body);
    out.push(r);
  }
  return out;
}

/** Whether a tap at this point of the reader page would land on a link instead of turning. */
function linkAt(view, x, y) {
  for (const { doc } of view.renderer.getContents?.() ?? []) {
    const frame = doc?.defaultView?.frameElement;
    if (!frame) continue;
    const rect = frame.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
    // A fixed-layout page is scaled to the screen; its own coordinates are not the screen's.
    const scale = frameScale(frame, rect);
    const fx = (x - rect.left) / scale;
    const fy = (y - rect.top) / scale;
    let el = doc.elementFromPoint(fx, fy);
    while (el?.shadowRoot) {
      const inner = el.shadowRoot.elementFromPoint(fx, fy);
      if (!inner || inner === el) break;
      el = inner;
    }
    if (el?.closest?.("a[href]")) return true;
  }
  return false;
}

/** Where the "Back to text" chip is, when it shows, so the host can tap it for real. */
function chipCenter() {
  const chip = document.getElementById("quire-back");
  if (!chip?.classList.contains("show")) return null;
  const rect = chip.getBoundingClientRect();
  return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
}

function popupState() {
  const root = document.getElementById("quire-note");
  if (!root) return { open: false, backChip: chipCenter() };
  const open = root.classList.contains("open");
  const body = root.querySelector(".body");
  const text = (body?.innerText ?? "").trim();
  const buttons = Object.fromEntries(
    Array.from(root.querySelectorAll("button")).map((button) => [button.textContent.trim(), !button.disabled]),
  );
  const backButton = root.querySelector(".bar button");
  return {
    open,
    label: root.querySelector(".label")?.textContent ?? null,
    text: text.slice(0, 160),
    textLength: text.length,
    // A back-link that survived would show as an arrow or a "back" link in the note body.
    backlink: /[↩↑⤴◄◀]/.test(text) || Array.from(body?.querySelectorAll("a") ?? []).some((a) => /^\s*(back|return)\b/i.test(a.textContent)),
    links: body?.querySelectorAll("a").length ?? 0,
    // Links that stay in the book (a note inside a note, or a cross-reference), not web links.
    bookLinks: Array.from(body?.querySelectorAll("a[data-href]") ?? []).filter((a) => !/^(?:https?|mailto):/i.test(a.getAttribute("data-href"))).length,
    images: body?.querySelectorAll("img").length ?? 0,
    stacked: backButton ? getComputedStyle(backButton).visibility === "visible" : false,
    buttons,
    backChip: chipCenter(),
  };
}

export function state(view, settings) {
  const location = view.lastLocation ?? {};
  const range = location.range ?? null;
  const contents = view.renderer.getContents?.() ?? [];
  const doc = contents[0]?.doc ?? null;
  const ranges = screenRanges(view, range);
  const text = ranges.map((r) => r.toString()).join(" ").replace(/\s+/g, " ").trim();
  const fontPx = bodyFontPx(ranges[0] ?? null);
  const media = ranges.map(visibleMedia).reduce((a, b) => ({ images: a.images + b.images, broken: a.broken + b.broken }), { images: 0, broken: 0 });
  const direction = doc ? directionOf(doc) : { vertical: false, rtl: false };
  const bookRtl = view.book?.dir === "rtl";
  const forwardZone = settings.tapZones === "screen" ? "right" : bookRtl ? "left" : "right";
  const width = window.innerWidth;
  const height = window.innerHeight;
  // 1 CSS px in the page is screen.width / innerWidth device-independent pixels.
  const scale = screen.width > 0 ? screen.width / width : 1;
  return {
    cfi: location.cfi ?? null,
    fraction: typeof location.fraction === "number" ? location.fraction : null,
    section: location.section?.current ?? null,
    sections: location.section?.total ?? null,
    tocLabel: location.tocItem?.label ?? null,
    flow: view.renderer.getAttribute?.("flow") === "scrolled" ? "scrolled" : "paginated",
    fixedLayout: Boolean(view.isFixedLayout),
    bookDir: bookRtl ? "rtl" : "ltr",
    vertical: direction.vertical,
    rtl: direction.rtl,
    forwardZone,
    viewport: { width, height, dpr: window.devicePixelRatio, screenWidth: screen.width },
    text: text.slice(0, 120),
    // Enough of the visible text to tell whether a place is still on screen after a change.
    pageText: text.slice(0, 3000),
    textLength: text.length,
    fontPx,
    fontDp: fontPx === null ? null : Math.round(fontPx * scale * 10) / 10,
    ...media,
    page: view.renderer.scrolled ? null : (view.renderer.page ?? null),
    pages: view.renderer.scrolled ? null : (view.renderer.pages ?? null),
    atStart: Boolean(view.renderer.atStart),
    atEnd: Boolean(view.renderer.atEnd),
    // A chapter shorter than about a screen and a half: scrolling past its end shows blank paper.
    shortSection: view.renderer.scrolled ? view.renderer.viewSize < view.renderer.size * 1.5 : (view.renderer.pages ?? 3) <= 3,
    links: {
      left: linkAt(view, width * 0.15, height * 0.5),
      right: linkAt(view, width * 0.85, height * 0.5),
    },
    popup: popupState(),
  };
}

/**
 * Pages of the current section with no text and no image. Paginated, reflowable only.
 * foliate lays a section out as columns one page wide, so a rect's page is its offset
 * along the page axis divided by the page size.
 */
export function scan(view) {
  const renderer = view.renderer;
  if (view.isFixedLayout || renderer.scrolled) return { skipped: true };
  const doc = renderer.getContents?.()[0]?.doc;
  const frame = doc?.defaultView?.frameElement;
  if (!frame) return { skipped: true };
  const { vertical, rtl } = directionOf(doc);
  const size = renderer.size;
  const frameRect = frame.getBoundingClientRect();
  const extent = vertical ? frameRect.height : frameRect.width;
  const spans = [];
  const mark = (rect) => {
    if (!(rect.width > 0 && rect.height > 0)) return;
    const start = vertical ? rect.top : rtl ? extent - rect.right : rect.left;
    const end = vertical ? rect.bottom : rtl ? extent - rect.left : rect.right;
    spans.push([start, end]);
  };
  const range = doc.createRange();
  const walker = doc.createTreeWalker(doc.body ?? doc.documentElement, NodeFilter.SHOW_TEXT);
  let nodes = 0;
  let truncated = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    if (++nodes > MAX_TEXT_NODES) {
      truncated = true;
      break;
    }
    range.selectNodeContents(node);
    for (const rect of range.getClientRects()) mark(rect);
  }
  for (const el of doc.querySelectorAll("img, svg, image, video, canvas, object")) mark(el.getBoundingClientRect());
  // Wide tables live in a shadow root on their wrapper (measure.js); the wrapper's box is the content.
  for (const el of doc.querySelectorAll("*")) if (el.shadowRoot) mark(el.getBoundingClientRect());
  // Pages are what the frame was sized to, or further if content runs past it.
  const furthest = spans.reduce((max, [, end]) => Math.max(max, end), 0);
  const pageCount = Math.max(1, Math.round(extent / size), Math.ceil(furthest / size));
  const filled = new Array(pageCount).fill(false);
  for (const [start, end] of spans) {
    const first = Math.max(0, Math.floor(start / size));
    const last = Math.min(pageCount - 1, Math.ceil(end / size) - 1);
    for (let page = first; page <= last; page++) filled[page] = true;
  }
  const blank = [];
  filled.forEach((value, page) => {
    if (!value) blank.push(page);
  });
  return { pages: pageCount, blank, truncated, vertical, rtl };
}

/**
 * A plain link with its own id is a note only when its target links back to it,
 * which is what the popup decides on a tap. Target documents are parsed once per call.
 */
async function isLinkedNote(view, index, a, docs) {
  const raw = a.getAttribute("href") ?? "";
  const href = view.book?.sections?.[index]?.resolveHref?.(raw) ?? raw;
  const resolved = view.book?.resolveHref?.(href);
  if (!resolved || resolved.index == null || resolved.index < 0 || !href.includes("#")) return false;
  if (!docs.has(resolved.index)) {
    docs.set(resolved.index, Promise.resolve(view.book.sections[resolved.index]?.createDocument?.()).catch(() => null));
  }
  const target = findTarget(await docs.get(resolved.index), href.slice(href.indexOf("#") + 1));
  return confirmNote("linked", target, noteBlock(target), a.id);
}

async function noteLinksIn(view, index, doc, options, docs) {
  const out = [];
  for (const a of noterefsIn(doc, options)) {
    if (noterefKind(a, options) === "linked" && !(await isLinkedNote(view, index, a, docs))) continue;
    out.push(a);
  }
  return out;
}

/** Note references on screen now, in reader-page CSS pixels, for the host to tap for real. */
export async function noterefs(view, options) {
  const docs = new Map();
  const out = [];
  const width = window.innerWidth;
  const height = window.innerHeight;
  for (const { doc, index } of view.renderer.getContents?.() ?? []) {
    const frame = doc?.defaultView?.frameElement;
    if (!frame) continue;
    const frameRect = frame.getBoundingClientRect();
    const scale = frameScale(frame, frameRect);
    for (const a of await noteLinksIn(view, index, doc, options, docs)) {
      const rect = Array.from(a.getClientRects()).find((r) => r.width > 0 && r.height > 0);
      if (!rect) continue;
      const x = frameRect.left + (rect.left + rect.width / 2) * scale;
      const y = frameRect.top + (rect.top + rect.height / 2) * scale;
      if (x < 4 || x > width - 4 || y < 4 || y > height - 4) continue;
      out.push({
        index,
        id: a.id || null,
        href: a.getAttribute("href"),
        text: (a.textContent ?? "").trim().slice(0, 40),
        kind: noterefKind(a, options),
        x: Math.round(x),
        y: Math.round(y),
      });
    }
  }
  return out;
}

/**
 * Go to the first section from the current one that has at least `min` note
 * references, and put its first reference on screen.
 */
export async function findNotes(view, options, min = 2) {
  const sections = view.book?.sections ?? [];
  const from = Math.max(0, view.lastLocation?.section?.current ?? 0);
  // From the current section to the end, then from the start: the book may have been left past its notes.
  const order = [...sections.keys()].slice(from).concat([...sections.keys()].slice(0, from)).slice(0, 80);
  const docs = new Map();
  for (const index of order) {
    const section = sections[index];
    if (section.linear === "no" || !section.createDocument) continue;
    let doc;
    try {
      doc = await section.createDocument();
    } catch {
      continue;
    }
    docs.set(index, Promise.resolve(doc));
    const refs = (await noteLinksIn(view, index, doc, options, docs)).filter((a) => {
      const kind = noterefKind(a, options);
      return kind === "semantic" || kind === "linked" || /\d|[*†‡§]/.test(a.textContent ?? "");
    });
    if (refs.length < min) continue;
    const first = refs[0];
    const target = first.id ? `${section.id}#${first.id}` : section.id;
    try {
      await view.goTo(target);
    } catch {
      await view.goTo(index);
    }
    return { index, href: section.id, refs: refs.length, first: first.id ?? null };
  }
  return { index: null, refs: 0 };
}

/** Press a button in the note sheet, as a person would. */
export function popupClick(name) {
  const root = document.getElementById("quire-note");
  if (!root) return { clicked: false };
  const wanted = String(name).toLowerCase();
  const button = Array.from(root.querySelectorAll("button")).find((b) => {
    const label = `${b.textContent} ${b.getAttribute("aria-label") ?? ""}`.toLowerCase();
    return label.includes(wanted);
  });
  if (!button || button.disabled) return { clicked: false };
  button.click();
  return { clicked: true };
}

/** Tap the first link in the open note's body, the way a reader follows a note inside a note. */
export function popupFollow() {
  const links = Array.from(document.querySelectorAll("#quire-note .body a[data-href]"));
  const link = links.find((a) => !/^(?:https?|mailto):/i.test(a.getAttribute("data-href"))) ?? links[0];
  if (!link) return { clicked: false };
  link.click();
  return { clicked: true, href: link.getAttribute("data-href") };
}
