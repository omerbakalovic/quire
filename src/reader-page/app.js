import { createJumps, navEntries, pageOf, positionOf } from "./jumps.js";
import { NotePopup } from "./note-popup.js";
import { linkFromEvent } from "./notes.js";
import { applyLookTo, openBook } from "./open-book.js";
import { pageErrors } from "./page-errors.js";
import * as probe from "./probe.js";
import { tapZone } from "./tap-zones.js";
import { classifyTouch, cleanGestures, PAGE_ACTIONS, TAP_SLOP_PX, tapGesture } from "./gestures.js";

/**
 * The reading path: one imported book, opened through range reads, with
 * paginated or scrolled flow, tap zones, and relocate reports to the host.
 * The device check harness in entry.js is separate and unchanged.
 */
let current = null;
// When the last tap turned a page, for the turn time reported with the next relocate.
let tapAt = null;
// "reading": the zones follow the book's page direction, so in a right-to-left
// book the left zone is the next page. "screen": right is always forward.
let settings = { tapZones: "reading", gestures: cleanGestures(null), turns: false };

let insets = { top: 0, bottom: 0, left: 0, right: 0 };
// Extra margin for the host's header and footer line (layout slots), 0 when both are empty.
let band = 0;

function bandOf(look) {
  const value = look?.band;
  return typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(0, Math.round(value)), 64) : 0;
}

/**
 * The system bars' insets, from the host. The note sheet and the Back to text
 * chip stay above the navigation bar, and the text keeps clear of both bars.
 */
export function applyInsets(message) {
  const value = (n) => (typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.min(n, 200) : 0);
  insets = { top: value(message?.top), bottom: value(message?.bottom), left: value(message?.left), right: value(message?.right) };
  const root = document.documentElement.style;
  for (const side of ["top", "bottom", "left", "right"]) root.setProperty(`--quire-inset-${side}`, `${insets[side]}px`);
  applyMargin(current?.view);
}

// foliate's default header and footer band is 48 px; it grows when a system bar is taller,
// and again when the host draws a header or footer line in it.
function applyMargin(view) {
  if (!view || view.isFixedLayout) return;
  const margin = Math.max(48, Math.round(Math.max(insets.top, insets.bottom) + 12 + band));
  view.renderer?.setAttribute?.("margin", `${margin}px`);
}

export function applySettings(message) {
  if (message.tapZones === "screen" || message.tapZones === "reading") settings = { ...settings, tapZones: message.tapZones };
  if (message.gestures) settings = { ...settings, gestures: cleanGestures(message.gestures) };
  if (typeof message.turns === "boolean") settings = { ...settings, turns: message.turns };
}

function flowOf(value) {
  return value === "scrolled" ? "scrolled" : "paginated";
}

function selectionIn(doc) {
  const selection = doc?.getSelection?.();
  return Boolean(selection && !selection.isCollapsed && String(selection).trim().length > 0);
}

/**
 * Run a gesture's action. A turn happens here; anything else is the app's. A
 * tap zone in "reading" mode turns toward its side of the screen, which for a
 * right-to-left book mirrors back and forward (view.goLeft and view.goRight).
 */
function runAction(action, { view, reply, id, popup, physical }) {
  if (!action || action === "none") return;
  if (PAGE_ACTIONS.includes(action)) {
    tapAt = performance.now();
    popup?.hideBack();
    const toRight = action === "nextPage";
    const go = () => {
      if (physical) void (toRight ? view.goRight() : view.goLeft());
      else void (toRight ? view.next() : view.prev());
    };
    // Which way the old page leaves: a physical tap turns toward its side; a logical turn follows the book.
    const rtl = view.book?.dir === "rtl";
    const direction = physical ? (toRight ? 1 : -1) : toRight !== rtl ? 1 : -1;
    turnWithOverlay(view, reply, id, go, direction);
    return;
  }
  reply({ type: "action", id, action });
}

/**
 * With a page-turn style on (docs/customization.md, 5.3), the app lays a
 * picture of this page over the WebView before the page turns underneath it,
 * then animates the picture away. The page asks first and turns on "turn-go",
 * or after a short wait if no answer comes, so a turn is never lost or slow.
 */
const TURN_WAIT_MS = 150;
let pendingTurn = null;

function turnWithOverlay(view, reply, id, go, direction) {
  flushTurn();
  if (!settings.turns || view.isFixedLayout || view.renderer?.getAttribute?.("flow") === "scrolled") {
    go();
    return;
  }
  const turn = { id, go, timer: setTimeout(() => flushTurn(), TURN_WAIT_MS) };
  pendingTurn = turn;
  reply({ type: "turning", id, direction });
}

function flushTurn() {
  const turn = pendingTurn;
  if (!turn) return;
  pendingTurn = null;
  clearTimeout(turn.timer);
  turn.go();
}

/** The app's overlay is up: turn now. */
export function turnGo(message) {
  if (pendingTurn && pendingTurn.id === message.id) flushTurn();
}

function verticalText(doc) {
  const mode = doc.defaultView?.getComputedStyle?.(doc.documentElement)?.writingMode ?? "";
  return mode.startsWith("vertical") || mode.startsWith("sideways");
}

/**
 * Touches on a section. foliate snaps to the nearest page one frame after
 * every touchend; after a tap, that snap races the turn the tap's click starts
 * and can cancel it, so a touch that did not move is kept from foliate's
 * touchend. A swipe still reaches it and snaps as before. A vertical swipe or
 * a two-finger tap runs its gesture, in Pages mode only (Scroll mode scrolls,
 * and a vertical-writing book turns pages that way).
 */
function attachTouches(view, doc, run) {
  // Each finger's own start, so a finger that lifts early is still measured against where it landed.
  const starts = new Map();
  let first = null;
  let fingers = 0;
  let far = 0;
  let last = null;
  doc.addEventListener(
    "touchstart",
    (event) => {
      if (starts.size === 0) {
        first = null;
        fingers = 0;
        far = 0;
        last = null;
      }
      const now = performance.now();
      for (const touch of Array.from(event.changedTouches)) {
        starts.set(touch.identifier, { x: touch.screenX, y: touch.screenY });
        first ??= { x: touch.screenX, y: touch.screenY, t: now, finger: touch.identifier };
      }
      fingers = Math.max(fingers, event.touches.length, starts.size);
    },
    { capture: true, passive: true },
  );
  doc.addEventListener(
    "touchend",
    (event) => {
      for (const touch of Array.from(event.changedTouches)) {
        const from = starts.get(touch.identifier);
        starts.delete(touch.identifier);
        if (!from) continue;
        far = Math.max(far, Math.abs(touch.screenX - from.x), Math.abs(touch.screenY - from.y));
        if (touch.identifier === first?.finger) last = { x: touch.screenX, y: touch.screenY };
      }
      if (event.touches.length > 0 || !first) return;
      const end = { ...(last ?? first), t: performance.now() };
      // Two fingers: how far any finger moved is what counts.
      const measured = fingers >= 2 ? { x: first.x + far, y: first.y, t: end.t } : end;
      if (fingers === 1 && far < TAP_SLOP_PX) {
        event.stopImmediatePropagation();
        return;
      }
      if (view.renderer?.getAttribute?.("flow") === "scrolled" || verticalText(doc) || selectionIn(doc)) return;
      const gesture = classifyTouch(first, measured, fingers);
      if (!gesture) return;
      const action = settings.gestures[gesture];
      // A turn lands on a page boundary itself; foliate's snap back would race it, as after a tap.
      if (PAGE_ACTIONS.includes(action)) event.stopImmediatePropagation();
      run(gesture, action, false);
    },
    { capture: true },
  );
  doc.addEventListener("touchcancel", () => starts.clear(), { capture: true, passive: true });
}

/** Tap zones. Links keep their own click, and an active selection is never a page turn. */
function attachTaps(view, doc, reply, id, popup) {
  const run = (_gesture, action, physical) => runAction(action, { view, reply, id, popup, physical });
  attachTouches(view, doc, run);
  doc.addEventListener("click", (event) => {
    if (event.defaultPrevented) return;
    if (linkFromEvent(event)) return;
    if (selectionIn(doc)) return;
    // A fixed-layout page is a scaled iframe: its own pixels are not the screen's.
    const frame = doc.defaultView?.frameElement;
    const rect = frame?.getBoundingClientRect();
    const scale = frame?.offsetWidth ? rect.width / frame.offsetWidth : 1;
    const zone = tapZone((rect?.left ?? 0) + event.clientX * scale, window.innerWidth);
    const gesture = tapGesture(zone);
    run(gesture, settings.gestures[gesture], settings.tapZones !== "screen");
  });
}

function metaText(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(metaText).filter(Boolean).join(", ") || null;
  if (typeof value === "object") return metaText(value.name ?? Object.values(value)[0]);
  return null;
}

export async function openForReading(message, reply, askDecision) {
  const { id, url } = message;
  const flow = flowOf(message.flow);
  applySettings(message.settings ?? {});
  band = bandOf(message.look);
  applyInsets(message.insets ?? insets);
  paintPage(message.look);
  if (current?.view) {
    try {
      current.view.close();
    } catch (error) {
      console.error(error);
    }
  }
  current = null;
  let popup = null;
  let jumps = null;
  const opened = await openBook(url, id, askDecision, {
    flow,
    lastLocation: typeof message.cfi === "string" ? message.cfi : null,
    position: message.position && typeof message.position === "object" ? message.position : null,
    look: message.look ?? null,
    onView(view) {
      popup = new NotePopup(view, reply, id);
      jumps = createJumps(view, reply, id);
      // Internal links that are not notes. Notes are taken earlier, in the popup's capture handler.
      view.addEventListener("link", (event) => jumps.onLink(event));
      view.addEventListener("load", (event) => {
        const doc = event.detail?.doc;
        if (!doc) return;
        popup.attach(doc, event.detail.index);
        attachTaps(view, doc, reply, id, popup);
      });
      view.addEventListener("relocate", (event) => {
        const detail = event.detail ?? {};
        const sinceTapMs = tapAt === null ? null : Math.round(performance.now() - tapAt);
        tapAt = null;
        reply({
          type: "relocate",
          id,
          cfi: detail.cfi ?? null,
          ...positionOf(view, detail),
          ...pageOf(view.renderer),
          tocLabel: detail.tocItem?.label ?? null,
          tocHref: detail.tocItem?.href ?? null,
          sectionCount: detail.section?.total ?? null,
          sinceTapMs,
          // After following a link, Android back returns here instead of leaving the book.
          canGoBack: Boolean(current?.view?.history?.canGoBack ?? event.target?.history?.canGoBack),
        });
      });
      view.addEventListener("external-link", (event) => {
        // Never opened from the page. The host asks the reader, then opens the system browser.
        event.preventDefault();
        reply({ type: "external-link", id, href: String(event.detail?.href_ ?? "") });
      });
    },
  });
  if (!opened.view) {
    reply({ type: "refused", id, kind: opened.report.kind });
    return;
  }
  current = { id, view: opened.view, popup, jumps };
  const view = opened.view;
  view.renderer?.addEventListener?.("relocate", (event) => noteRelocate(view, event.detail?.reason));
  applyMargin(opened.view);
  const book = opened.view.book;
  reply({
    type: "opened",
    id,
    title: metaText(book?.metadata?.title),
    authors: metaText(book?.metadata?.author),
    sections: book?.sections?.length ?? 0,
    toc: navEntries(opened.view),
    openMs: opened.report.openMs ?? null,
    rangeRequests: opened.report.rangeRequests ?? null,
    restored: opened.report.restored ?? false,
    restoredFrom: opened.report.restoredFrom ?? null,
    fixedLayout: opened.report.fixedLayout ?? false,
  });
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

/**
 * foliate re-anchors on a flow change from rects measured before the new
 * layout has settled, which on the phone landed at the end of the section.
 * Keep the CFI of the visible text, let two frames pass, and go back to it.
 */
export async function setFlow(message) {
  if (!current || current.id !== message.id) return false;
  const { view } = current;
  if (view.isFixedLayout) return false;
  const next = flowOf(message.flow);
  if (view.renderer.getAttribute("flow") === next) return true;
  return relayout(async () => {
    const cfi = anchorCfi(view);
    view.renderer.setAttribute("flow", next);
    if (!cfi) return true;
    await nextFrame();
    await nextFrame();
    await returnTo(view, cfi, "flow change");
    await remember();
    return true;
  });
}

/**
 * The CFI to keep across a relayout. Each relayout lands on a page that holds
 * the anchor but starts before it, so anchoring the next relayout on that
 * page's start walked the place backwards a little more each time (phone run
 * 9: five Aa changes went from offset 734 to the chapter before). Scroll mode
 * shows a little of the text above the anchor too (run 7b). So the first
 * relayout's anchor is kept until the reader moves: a page turn, a swipe, a
 * scroll or a jump. foliate's own re-anchoring (reason "anchor", after a font
 * loads or a section grows) and our own return are not moves.
 */
let kept = null;
let quietUntil = 0;
const MOVES = new Set(["page", "snap", "scroll", "navigation", "selection"]);

/** The anchor for a relayout, kept from the moment it is chosen, so a quick second change finds it too. */
function anchorCfi(view) {
  if (kept && kept.view === view) return kept.cfi;
  const cfi = view.lastLocation?.cfi ?? null;
  if (cfi) kept = { view, cfi };
  return cfi;
}

async function remember() {
  await nextFrame();
  // A scroll-mode return settles in debounced scroll events after it resolves.
  quietUntil = performance.now() + 400;
}

/** A relocate from the renderer: forget the kept anchor when the reader moved. */
export function noteRelocate(view, reason, now = performance.now()) {
  if (!kept || kept.view !== view || !MOVES.has(reason)) return;
  // A turn or a swipe is always the reader's. A scroll or a jump may be our own return settling.
  const ours = relayingOut > 0 || (reason === "scroll" && now < quietUntil);
  if (reason === "page" || reason === "snap" || !ours) kept = null;
}


let relayingOut = 0;
async function relayout(work) {
  relayingOut += 1;
  try {
    return await work();
  } finally {
    relayingOut -= 1;
  }
}

/**
 * Go back to the text a CFI names after a relayout. The visible range's start
 * often sits exactly on a page boundary, where its first rect can belong to
 * the previous column, so landing on the collapsed start showed the page
 * before (phone run 7b: Pages, Scroll, Pages went one page early). Anchor on
 * the first visible character after the start instead.
 */
export async function returnTo(view, cfi, why) {
  try {
    const resolved = view.resolveNavigation(cfi);
    if (!resolved) return;
    const { anchor } = resolved;
    await view.renderer.goTo({
      ...resolved,
      anchor: typeof anchor === "function" ? (doc) => firstCharacter(anchor(doc)) : anchor,
    });
  } catch (error) {
    console.error(`could not return to the location after a ${why}`, error);
  }
}

/** A one-character range at the first non-space character from a range's start, or the range itself. */
export function firstCharacter(range) {
  if (!range || typeof range.cloneRange !== "function") return range;
  const doc = range.startContainer?.ownerDocument;
  if (!doc) return range;
  // 4 is NodeFilter.SHOW_TEXT.
  const walker = doc.createTreeWalker(doc.body ?? doc.documentElement, 4);
  let node = range.startContainer;
  let offset = range.startOffset;
  if (node.nodeType !== 3) {
    // An element boundary: start at the first text node at or after that child.
    const child = node.childNodes?.[offset] ?? null;
    walker.currentNode = child ?? node;
    node = child && child.nodeType === 3 ? child : walker.nextNode();
    offset = 0;
  } else {
    walker.currentNode = node;
  }
  for (let steps = 0; node && steps < 200; steps++) {
    const text = node.data ?? "";
    for (let i = offset; i < text.length; i++) {
      if (!/\s/.test(text[i])) {
        const out = doc.createRange();
        out.setStart(node, i);
        out.setEnd(node, i + 1);
        return out;
      }
    }
    node = walker.nextNode();
    offset = 0;
  }
  return range;
}

export async function turn(message) {
  if (!current || current.id !== message.id) return false;
  if (message.dir === "prev") await current.view.prev();
  else await current.view.next();
  return true;
}

/** The page behind and around the book, and the note sheet, follow the theme too. */
function paintPage(look) {
  const hex = (value) => (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : null);
  const page = hex(look?.page);
  if (!page) return;
  const root = document.documentElement.style;
  root.setProperty("--quire-page", page);
  document.body.style.background = page;
  const vars = { "--quire-ink": look.ink, "--quire-ink-muted": look.muted, "--quire-link": look.link, "--quire-chrome": look.chrome, "--quire-chrome-ink": look.chromeInk };
  for (const [name, value] of Object.entries(vars)) {
    if (hex(value)) root.setProperty(name, value);
  }
  // Hairlines are the muted ink at low strength, so they show on every theme.
  if (hex(look.muted)) root.setProperty("--quire-line", `${look.muted}55`);
}

/**
 * Wait, at most a second and a half, for the shown sections' fonts to finish
 * loading, so a return measures the final layout. True when any were loading.
 */
async function fontsSettled(view) {
  const sets = (view.renderer?.getContents?.() ?? []).map((content) => content?.doc?.fonts).filter(Boolean);
  const loading = sets.filter((set) => set.status === "loading");
  if (loading.length === 0) return false;
  await Promise.race([Promise.all(loading.map((set) => set.ready)), new Promise((resolve) => setTimeout(resolve, 1500))]);
  await nextFrame();
  return true;
}

/**
 * A new look from the host. Colours only: restyle in place. Typography or
 * margins: restyle, let the layout settle, then go back to the same text, as
 * a flow change does (foliate re-anchors on rects measured too early).
 */
export async function setLook(message) {
  paintPage(message.look);
  if (!current || current.id !== message.id) return false;
  const { view } = current;
  if (view.isFixedLayout) return true;
  return relayout(async () => {
    const cfi = message.relayout ? anchorCfi(view) : null;
    band = bandOf(message.look);
    applyMargin(view);
    await applyLookTo(view, message.look);
    if (!cfi) return true;
    await nextFrame();
    await nextFrame();
    await fontsSettled(view);
    await returnTo(view, cfi, "style change");
    // A face that finished loading after the return reflows the text under it; go back once more.
    if (await fontsSettled(view)) await returnTo(view, cfi, "font load");
    // Every later relayout goes back to this same text until the reader moves.
    await remember();
    return true;
  });
}

/**
 * Jumps from the host: a TOC entry ({ href }), the slider ({ fraction }), or a
 * chapter button ({ href }). Each one pushes the back stack.
 */
export async function goTo(message) {
  if (!current || current.id !== message.id || !current.jumps) return false;
  const target = message.target ?? {};
  current.popup?.hideBack();
  if (typeof target.href === "string" && target.href.length > 0) return current.jumps.goToHref(target.href);
  if (typeof target.fraction === "number" && Number.isFinite(target.fraction)) return current.jumps.goToFraction(target.fraction);
  return false;
}

/** "Back to where you were": one level per call. `clear` drops the whole stack. */
export async function back(message) {
  if (!current || current.id !== message.id || !current.jumps) return false;
  if (message.clear === true) {
    current.jumps.clear();
    return true;
  }
  return current.jumps.back();
}

/** Android back after following a link: back to where the link was. */
export async function historyBack(message) {
  if (!current || current.id !== message.id) return false;
  current.popup?.hideBack();
  if (!current.view.history?.canGoBack) return false;
  current.view.history.back();
  return true;
}

/** Android back closes an open note first. The host asks; the page answers with a note message. */
export function closeNote(message) {
  if (!current || current.id !== message.id) return false;
  current.popup?.close();
  return true;
}

/**
 * Debug probes for the phone matrix. The host only sends these from a debug
 * build's command channel; they read the page and press its own controls.
 */
export async function debug(message) {
  if (!current || current.id !== message.id) return { error: "no book open" };
  const { view } = current;
  switch (message.action) {
    case "state":
      return probe.state(view, settings);
    case "scan":
      return probe.scan(view);
    case "noterefs":
      return { refs: await probe.noterefs(view, {}), viewport: { width: window.innerWidth, height: window.innerHeight } };
    case "find-notes":
      return probe.findNotes(view, {}, typeof message.min === "number" ? message.min : 2);
    case "goto":
      await view.goTo(message.target);
      return { ok: true };
    case "show-page":
      return probe.showPage(view, Number(message.page) || 0);
    case "popup-click":
      return probe.popupClick(message.name);
    case "popup-follow":
      return probe.popupFollow();
    case "close-note":
      current.popup?.close();
      return { ok: true };
    case "page-errors":
      return pageErrors({ reset: message.reset === true });
    default:
      return { error: `unknown action ${String(message.action)}` };
  }
}

