import { NotePopup } from "./note-popup.js";
import { linkFromEvent } from "./notes.js";
import { openBook } from "./open-book.js";
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

/** Tap zones. Links keep their own click, and an active selection is never a page turn. */
function attachTaps(view, doc, reply, id, popup) {
  doc.addEventListener("click", (event) => {
    if (event.defaultPrevented) return;
    if (linkFromEvent(event)) return;
    if (selectionIn(doc)) return;
    const frame = doc.defaultView?.frameElement;
    const left = frame ? frame.getBoundingClientRect().left : 0;
    const zone = tapZone(left + event.clientX, window.innerWidth);
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

/** Android back closes an open note first. The host asks; the page answers with a note message. */
export function closeNote(message) {
  if (!current || current.id !== message.id) return false;
  current.popup?.close();
  return true;
}
