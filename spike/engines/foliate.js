import "../vendor/foliate-js/view.js";
import { FootnoteHandler } from "../vendor/foliate-js/footnotes.js";
import { delay, fetchBook, mark, median, metadataText, waitFor, withTimeout } from "./util.js";

const INTERESTING = [
  "ref-fn1",
  "ref-role",
  "ref-en1",
  "ref-rich",
  "ref-nested",
  "ref-plain",
  "ref-empty-sem",
  "ref-empty-sup",
  "ref-not-a-note",
  "ref-chapter",
];

export async function run(params) {
  mark("start");
  const path = params.get("book");
  const kind = params.get("kind") || "full";
  const blob = await fetchBook(path);
  if (!blob) return { skipped: true, book: path, reason: "missing file" };

  const view = document.createElement("foliate-view");
  view.style.cssText = "display:block;width:400px;height:640px";
  document.body.append(view);
  const started = performance.now();
  const result = { ok: false, book: path, kind };

  try {
    await view.open(new File([blob], "book.epub", { type: "application/epub+zip" }));
    await view.init({ showTextStart: true });
    await waitFor(() => view.lastLocation?.cfi, 25000);
    result.openMs = Math.round(performance.now() - started);
    result.title = metadataText(view.book.metadata?.title);
    result.language = metadataText(view.book.metadata?.language);
    result.sections = view.book.sections?.length ?? null;
    result.cfi = view.lastLocation.cfi;
    result.viewport = { width: view.clientWidth, height: view.clientHeight };
    result.openingText = visibleText(view);
    result.ok = true;
  } catch (error) {
    result.openError = String(error);
    result.openMs = Math.round(performance.now() - started);
    return result;
  }

  if (kind === "script" || kind === "open" || kind === "full") {
    result.live = liveFacts(view);
  }
  if (kind === "full") {
    result.notes = await noteReport(view);
    result.media = await mediaInSection(view, 1);
    result.userStyle = applyUserStyle(view);
    result.turns = await timeTurns(view, 5);
    result.modeSwitch = await switchFlow(view);
    result.chapterBoundary = await chapterBoundary(view);
  }
  if (kind === "real") {
    result.turns = await timeTurns(view, 5);
    result.noterefScan = await scanNoterefs(view, 12);
  }
  if (kind === "timing") {
    result.turns = await timeTurns(view, 5);
  }
  return result;
}

function liveDoc(view) {
  return view.renderer?.getContents?.()?.[0]?.doc ?? null;
}

function visibleText(view) {
  const range = view.lastLocation?.range;
  const fromRange = range?.toString?.() ?? "";
  const fromBody = liveDoc(view)?.body?.innerText ?? "";
  return (fromRange || fromBody).replace(/\s+/g, " ").slice(0, 180);
}

function liveFacts(view) {
  const doc = liveDoc(view);
  if (!doc) return { error: "no document" };
  const img = doc.querySelector("img");
  return {
    text: (doc.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 240),
    scriptRan: doc.documentElement.getAttribute("data-script-ran") === "yes",
    imageCount: doc.querySelectorAll("img").length,
    imageWidth: img?.naturalWidth ?? null,
    svg: doc.querySelector("svg") != null,
    tableWidth: doc.querySelector("table")?.getBoundingClientRect?.().width ?? null,
  };
}

function applyUserStyle(view) {
  view.renderer.setStyles(
    "html, body, p { font-family: Georgia, serif !important; color: rgb(0, 0, 128) !important; }",
  );
  const body = liveDoc(view)?.body;
  if (!body) return { error: "no body" };
  const style = getComputedStyle(body);
  return { fontFamily: style.fontFamily, color: style.color };
}

async function timeTurns(view, count) {
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    const before = view.lastLocation?.cfi;
    const started = performance.now();
    try {
      await view.next();
      await waitFor(() => view.lastLocation?.cfi && view.lastLocation.cfi !== before, 8000);
      samples.push(Math.round(performance.now() - started));
    } catch (error) {
      samples.push({ error: String(error), ms: Math.round(performance.now() - started) });
      break;
    }
  }
  return { samples, medianMs: median(samples.filter((sample) => typeof sample === "number")) };
}

async function switchFlow(view) {
  const before = {
    cfi: view.lastLocation?.cfi ?? null,
    text: visibleText(view),
    index: view.lastLocation?.index ?? null,
  };
  view.renderer.setAttribute("flow", "scrolled");
  await delay(500);
  return {
    before,
    after: {
      cfi: view.lastLocation?.cfi ?? null,
      text: visibleText(view),
      index: view.lastLocation?.index ?? null,
      flow: view.renderer.getAttribute("flow"),
    },
    sameCfi: before.cfi === view.lastLocation?.cfi,
  };
}

function sectionIndex(view) {
  const current = view.lastLocation?.section?.current;
  return Number.isInteger(current) ? current : null;
}

function locationSnapshot(view) {
  return {
    section: sectionIndex(view),
    cfi: view.lastLocation?.cfi ?? null,
    text: visibleText(view),
  };
}

function linkHref(view, link) {
  const section = view.book.sections?.[sectionIndex(view) ?? 0];
  const raw = link.getAttribute("href") || "";
  return section?.resolveHref?.(raw) ?? raw;
}

async function mediaInSection(view, index) {
  await view.renderer.goTo({ index, anchor: () => 0 });
  await delay(300);
  return liveFacts(view);
}

async function chapterBoundary(view) {
  await view.renderer.goTo({ index: 0, anchor: () => 1 });
  await delay(400);
  const atEnd = locationSnapshot(view);
  let error = null;
  try {
    await view.next();
    await waitFor(() => {
      const next = sectionIndex(view);
      return next != null && atEnd.section != null && next > atEnd.section;
    }, 8000);
  } catch (failure) {
    error = String(failure);
  }
  const afterNext = locationSnapshot(view);
  return {
    atEnd,
    afterNext,
    error,
    loadedNext: afterNext.section != null && atEnd.section != null && afterNext.section > atEnd.section,
  };
}

async function noteReport(view) {
  const doc = liveDoc(view);
  if (!doc) return { error: "no document" };
  const off = await classify(view, doc, false);
  const on = await classify(view, doc, true);
  const samples = {};
  for (const id of ["ref-fn1", "ref-en1", "ref-rich", "ref-nested", "ref-empty-sem", "ref-empty-sup", "ref-plain"]) {
    const link = doc.getElementById(id);
    const semantic = id !== "ref-plain" && id !== "ref-empty-sup";
    samples[id] = link ? await extract(view, link, semantic) : { missing: true };
  }
  return { detectOff: off, detectOn: on, samples };
}

function mountPopups(handler) {
  const popups = [];
  handler.addEventListener("before-render", (event) => {
    const popup = event.detail.view;
    popup.style.cssText = "position:absolute;width:400px;height:240px;visibility:hidden";
    document.body.append(popup);
    popups.push(popup);
  });
  return () => {
    for (const popup of popups) popup.remove();
  };
}

async function classify(view, doc, detect) {
  const handler = new FootnoteHandler();
  handler.detectFootnotes = detect;
  const remove = mountPopups(handler);
  const treated = [];
  const pending = [];
  for (const id of INTERESTING) {
    const link = doc.getElementById(id);
    if (!link) continue;
    const event = new CustomEvent("link", {
      cancelable: true,
      detail: { a: link, href: linkHref(view, link) },
    });
    const result = handler.handle(view.book, event);
    if (result && typeof result.then === "function") {
      treated.push(id);
      pending.push(result.catch(() => {}));
    }
  }
  await withTimeout(Promise.all(pending), 15000, "classify").catch(() => {});
  remove();
  return treated;
}

function extract(view, link, semantic) {
  const handler = new FootnoteHandler();
  handler.detectFootnotes = !semantic;
  const remove = mountPopups(handler);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ error: "timeout" }), 12000);
    handler.addEventListener("render", (event) => {
      clearTimeout(timer);
      const rendered = event.detail.view?.renderer?.getContents?.()?.[0]?.doc;
      const text = (rendered?.body?.innerText || event.detail.target?.textContent || "")
        .replace(/\s+/g, " ")
        .slice(0, 300);
      remove();
      resolve({
        type: event.detail.type ?? null,
        text,
        imageCount: rendered?.querySelectorAll("img").length ?? 0,
        linkCount: rendered?.querySelectorAll("a").length ?? 0,
      });
    }, { once: true });
    const pending = handler.handle(view.book, new CustomEvent("link", {
      cancelable: true,
      detail: { a: link, href: linkHref(view, link) },
    }));
    if (!pending) {
      clearTimeout(timer);
      remove();
      resolve({ treated: false });
      return;
    }
    Promise.resolve(pending).catch((error) => {
      clearTimeout(timer);
      remove();
      resolve({ error: String(error) });
    });
  });
}

async function scanNoterefs(view, limit) {
  const found = [];
  const sections = view.book.sections ?? [];
  for (let index = 0; index < Math.min(sections.length, limit); index += 1) {
    const section = sections[index];
    if (!section.createDocument) continue;
    try {
      const doc = await section.createDocument();
      const link = [...doc.querySelectorAll("a")].find((anchor) => {
        const type = anchor.getAttribute("epub:type")
          || anchor.getAttributeNS("http://www.idpf.org/2007/ops", "type")
          || "";
        const role = anchor.getAttribute("role") || "";
        return type.includes("noteref") || role.includes("doc-noteref");
      });
      if (link) {
        found.push({ index, href: link.getAttribute("href"), text: link.textContent });
        break;
      }
    } catch (error) {
      found.push({ index, error: String(error) });
    }
  }
  return found;
}
