import { NotePopup } from "./note-popup.js";
import { linkFromEvent } from "./notes.js";
import { openBook } from "./open-book.js";
import { pageErrors } from "./page-errors.js";
import * as probe from "./probe.js";
import { tapZone } from "./tap-zones.js";

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
let settings = { tapZones: "reading" };

let insets = { top: 0, bottom: 0, left: 0, right: 0 };

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

// foliate's default header and footer band is 48 px; it grows when a system bar is taller.
function applyMargin(view) {
  if (!view || view.isFixedLayout) return;
  const margin = Math.max(48, Math.round(Math.max(insets.top, insets.bottom) + 12));
  view.renderer?.setAttribute?.("margin", `${margin}px`);
}

export function applySettings(message) {
  if (message.tapZones === "screen" || message.tapZones === "reading") settings = { ...settings, tapZones: message.tapZones };
}

function flowOf(value) {
  return value === "scrolled" ? "scrolled" : "paginated";
}

function selectionIn(doc) {
  const selection = doc?.getSelection?.();
  return Boolean(selection && !selection.isCollapsed && String(selection).trim().length > 0);
}

// A touch that moves less than this is a tap, not a swipe.
const TAP_SLOP_PX = 10;

/**
 * foliate snaps to the nearest page one frame after every touchend. After a
 * tap, that snap races the turn the tap's click starts and can cancel it, so
 * the page stays put (seen after a chapter change). A touch that did not move
 * is kept from foliate's touchend; a swipe still reaches it and snaps as before.
 */
function keepTapsFromSnap(doc) {
  let start = null;
  doc.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.changedTouches[0];
      start = touch && event.touches.length === 1 ? { x: touch.screenX, y: touch.screenY } : null;
    },
    { capture: true, passive: true },
  );
  doc.addEventListener(
    "touchend",
    (event) => {
      const touch = event.changedTouches[0];
      const from = start;
      start = null;
      if (!from || !touch || event.touches.length > 0) return;
      if (Math.abs(touch.screenX - from.x) < TAP_SLOP_PX && Math.abs(touch.screenY - from.y) < TAP_SLOP_PX) {
        event.stopImmediatePropagation();
      }
    },
    { capture: true },
  );
}

/** Tap zones. Links keep their own click, and an active selection is never a page turn. */
function attachTaps(view, doc, reply, id, popup) {
  keepTapsFromSnap(doc);
  doc.addEventListener("click", (event) => {
    if (event.defaultPrevented) return;
    if (linkFromEvent(event)) return;
    if (selectionIn(doc)) return;
    // A fixed-layout page is a scaled iframe: its own pixels are not the screen's.
    const frame = doc.defaultView?.frameElement;
    const rect = frame?.getBoundingClientRect();
    const scale = frame?.offsetWidth ? rect.width / frame.offsetWidth : 1;
    const zone = tapZone((rect?.left ?? 0) + event.clientX * scale, window.innerWidth);
    if (zone === "left" || zone === "right") {
      tapAt = performance.now();
      popup?.hideBack();
    }
    const screen = settings.tapZones === "screen";
    if (zone === "left") void (screen ? view.prev() : view.goLeft());
    else if (zone === "right") void (screen ? view.next() : view.goRight());
    else reply({ type: "tap", id, zone: "center" });
  });
}

function tocOf(book) {
  const out = [];
  const walk = (items, depth) => {
    for (const item of items ?? []) {
      if (out.length >= 2000) return;
      out.push({ label: String(item.label ?? "").trim(), href: item.href ?? null, depth });
      walk(item.subitems, depth + 1);
    }
  };
  walk(book?.toc, 0);
  return out;
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
  applyInsets(message.insets ?? insets);
  if (current?.view) {
    try {
      current.view.close();
    } catch (error) {
      console.error(error);
    }
  }
  current = null;
  let popup = null;
  const opened = await openBook(url, id, askDecision, {
    flow,
    lastLocation: typeof message.cfi === "string" ? message.cfi : null,
    onView(view) {
      popup = new NotePopup(view, reply, id);
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
          fraction: typeof detail.fraction === "number" ? detail.fraction : null,
          tocLabel: detail.tocItem?.label ?? null,
          sectionIndex: detail.section?.current ?? null,
          sectionCount: detail.section?.total ?? null,
          sinceTapMs,
          // After following a link, Android back returns here instead of leaving the book.
          canGoBack: Boolean(current?.view?.history?.canGoBack ?? event.target?.history?.canGoBack),
        });
      });
      view.addEventListener("external-link", (event) => {
        // External links stay inside the book. Confirmation and the system browser are Milestone 2.
        event.preventDefault();
        reply({ type: "external-link", id, href: String(event.detail?.href_ ?? "") });
      });
    },
  });
  if (!opened.view) {
    reply({ type: "refused", id, kind: opened.report.kind });
    return;
  }
  current = { id, view: opened.view, popup };
  applyMargin(opened.view);
  const book = opened.view.book;
  reply({
    type: "opened",
    id,
    title: metaText(book?.metadata?.title),
    authors: metaText(book?.metadata?.author),
    sections: book?.sections?.length ?? 0,
    toc: tocOf(book),
    openMs: opened.report.openMs ?? null,
    rangeRequests: opened.report.rangeRequests ?? null,
    restored: opened.report.restored ?? false,
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
  const cfi = view.lastLocation?.cfi ?? null;
  view.renderer.setAttribute("flow", next);
  if (!cfi) return true;
  await nextFrame();
  await nextFrame();
  try {
    const resolved = view.resolveNavigation(cfi);
    if (resolved) await view.renderer.goTo(resolved);
  } catch (error) {
    console.error("could not return to the location after a flow change", error);
  }
  return true;
}

export async function turn(message) {
  if (!current || current.id !== message.id) return false;
  if (message.dir === "prev") await current.view.prev();
  else await current.view.next();
  return true;
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

