import { delay, mark, median, waitFor, withTimeout } from "./util.js";

export async function run(params) {
  mark("load script");
  await withTimeout(loadScript("/spike/node_modules/jszip/dist/jszip.min.js"), 15000, "load jszip");
  if (typeof window.JSZip !== "function") throw new Error("JSZip did not load");
  await withTimeout(loadScript("/spike/node_modules/epubjs/dist/epub.min.js"), 15000, "load epub.js");
  if (typeof window.ePub !== "function") throw new Error("epub.js did not publish ePub");

  const path = params.get("book");
  const kind = params.get("kind") || "full";
  const probe = await fetch(path);
  if (probe.status === 404) return { skipped: true, book: path, reason: "missing file" };
  if (!probe.ok) throw new Error(`${path} returned ${probe.status}`);
  const bytes = await probe.arrayBuffer();

  const viewer = document.getElementById("viewer");
  const started = performance.now();
  const result = { ok: false, book: path, kind, footnoteApi: false };
  let book;
  let rendition;
  try {
    mark("open");
    const opened = await openRendition(viewer, bytes);
    book = opened.book;
    rendition = opened.rendition;
    result.openAttempts = opened.attempts;
    await waitFor(() => current(rendition)?.start?.cfi, 8000);
    await waitFor(() => current(rendition)?.start?.cfi, 20000);
    result.openMs = Math.round(performance.now() - started);
    const metadata = await book.loaded.metadata;
    result.title = metadata?.title ?? null;
    result.language = metadata?.language ?? null;
    result.sections = book.spine?.length ?? null;
    result.cfi = current(rendition)?.start?.cfi ?? null;
    result.openingText = bodyText(rendition);
    result.ok = true;
  } catch (error) {
    result.openError = String(error);
    result.openAttempts = error.attempts ?? result.openAttempts ?? null;
    result.openMs = Math.round(performance.now() - started);
    return result;
  }

  if (kind === "script" || kind === "open" || kind === "full") {
    result.live = liveFacts(rendition);
  }
  if (kind === "full") {
    mark("notes");
    result.notes = await noteNavigation(book, rendition);
    mark("media");
    result.media = await mediaInSection(book, rendition, 1);
    mark("style");
    result.userStyle = applyUserStyle(rendition);
    mark("turns");
    result.turns = await timeTurns(rendition, 5);
    mark("flow");
    result.modeSwitch = await switchFlow(rendition);
    mark("boundary");
    result.chapterBoundary = await chapterBoundary(rendition, book);
  }
  if (kind === "real") {
    result.turns = await timeTurns(rendition, 5);
    result.noterefScan = await scanNoterefs(book, 12);
  }
  if (kind === "timing") {
    result.turns = await timeTurns(rendition, 5);
  }
  return result;
}

async function openRendition(viewer, bytes) {
  const attempts = [];
  for (const method of ["srcdoc", "write"]) {
    const book = window.ePub(bytes.slice(0));
    const rendition = book.renderTo(viewer, {
      width: 400,
      height: 640,
      flow: "paginated",
      spread: "none",
      allowScriptedContent: false,
      method,
    });
    rendition.on("displayerror", (error) => {
      window.__errors.push(`displayerror ${method}: ${error}`);
    });
    try {
      mark(`open ${method}`);
      await withTimeout(book.opened, 15000, `${method} book.opened`);
      await withTimeout(rendition.display(), 12000, `${method} display`);
      attempts.push({ method, ok: true });
      return { book, rendition, attempts };
    } catch (error) {
      attempts.push({ method, ok: false, error: String(error) });
      rendition.destroy?.();
    }
  }
  const failure = new Error(attempts.map((attempt) => attempt.error).join("; "));
  failure.attempts = attempts;
  throw failure;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.append(script);
  });
}

function current(rendition) {
  return rendition.location ?? null;
}

function contentsDoc(rendition) {
  return rendition.getContents?.()?.[0]?.document ?? null;
}

function bodyText(rendition) {
  return (contentsDoc(rendition)?.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 180);
}

function liveFacts(rendition) {
  const doc = contentsDoc(rendition);
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

function applyUserStyle(rendition) {
  rendition.themes.default({
    html: { "font-family": "Georgia, serif !important", color: "rgb(0, 0, 128) !important" },
    body: { "font-family": "Georgia, serif !important", color: "rgb(0, 0, 128) !important" },
    p: { "font-family": "Georgia, serif !important", color: "rgb(0, 0, 128) !important" },
  });
  const body = contentsDoc(rendition)?.body;
  if (!body) return { error: "no body" };
  const style = getComputedStyle(body);
  return { fontFamily: style.fontFamily, color: style.color };
}

async function timeTurns(rendition, count) {
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    const before = current(rendition)?.start?.cfi;
    const started = performance.now();
    try {
      await withTimeout(rendition.next(), 8000, "next");
      await waitFor(() => {
        const cfi = current(rendition)?.start?.cfi;
        return cfi && cfi !== before;
      }, 8000);
      samples.push(Math.round(performance.now() - started));
    } catch (error) {
      samples.push({ error: String(error), ms: Math.round(performance.now() - started) });
      break;
    }
  }
  return { samples, medianMs: median(samples.filter((sample) => typeof sample === "number")) };
}

async function switchFlow(rendition) {
  const before = { cfi: current(rendition)?.start?.cfi ?? null, text: bodyText(rendition) };
  rendition.flow("scrolled");
  await delay(600);
  return {
    before,
    after: {
      cfi: current(rendition)?.start?.cfi ?? null,
      text: bodyText(rendition),
      href: current(rendition)?.start?.href ?? null,
    },
    sameCfi: before.cfi != null && before.cfi === current(rendition)?.start?.cfi,
  };
}

async function mediaInSection(book, rendition, index) {
  const item = book.spine?.get?.(index) ?? book.spine?.spineItems?.[index];
  const href = item?.href;
  if (!href) return { error: "no section" };
  await withTimeout(rendition.display(href), 15000, "media display");
  await delay(300);
  return { href, ...liveFacts(rendition) };
}

async function chapterBoundary(rendition, book) {
  rendition.flow("scrolled");
  const first = book.spine.get(0);
  const beforeScroll = first?.href ?? null;
  let error = null;
  try {
    await withTimeout(rendition.display(first.href), 12000, "boundary display");
    await delay(400);
  } catch (failure) {
    error = String(failure);
  }
  const doc = contentsDoc(rendition);
  const scroller = doc?.scrollingElement || doc?.documentElement;
  if (scroller) scroller.scrollTop = scroller.scrollHeight;
  await delay(500);
  const afterScroll = {
    href: current(rendition)?.start?.href ?? null,
    cfi: current(rendition)?.start?.cfi ?? null,
    text: bodyText(rendition),
  };
  let afterNext = null;
  try {
    await withTimeout(rendition.next(), 8000, "boundary next");
    await delay(400);
    afterNext = {
      href: current(rendition)?.start?.href ?? null,
      cfi: current(rendition)?.start?.cfi ?? null,
      text: bodyText(rendition),
    };
  } catch (failure) {
    error = String(failure);
    afterNext = {
      href: current(rendition)?.start?.href ?? null,
      cfi: current(rendition)?.start?.cfi ?? null,
      text: bodyText(rendition),
    };
  }
  return {
    flow: "scrolled",
    beforeScroll,
    afterScroll,
    afterNext,
    error,
    scrollLoadedNext: beforeScroll != null && afterScroll.href != null && afterScroll.href !== beforeScroll,
    nextLoadedNext: beforeScroll != null && afterNext?.href != null && afterNext.href !== beforeScroll,
  };
}

async function noteNavigation(book, rendition) {
  const doc = contentsDoc(rendition);
  const link = doc?.getElementById("ref-en1");
  if (!link) return { footnoteApi: false, crossFile: { missing: true } };
  try {
    await withTimeout(rendition.display(link.getAttribute("href")), 15000, "note display");
    await delay(500);
    return {
      footnoteApi: false,
      crossFile: { text: bodyText(rendition), href: current(rendition)?.start?.href ?? null },
    };
  } catch (error) {
    return { footnoteApi: false, crossFile: { error: String(error) } };
  }
}

async function scanNoterefs(book, limit) {
  const found = [];
  const spine = book.spine?.spineItems ?? book.spine?.items ?? [];
  for (let index = 0; index < Math.min(spine.length, limit); index += 1) {
    try {
      const section = spine[index];
      const href = section.href || section.url;
      if (!section.load) continue;
      await section.load(book.load.bind(book));
      const doc = section.document;
      const link = [...(doc?.querySelectorAll("a") ?? [])].find((anchor) => {
        const type = anchor.getAttribute("epub:type")
          || anchor.getAttributeNS?.("http://www.idpf.org/2007/ops", "type")
          || "";
        return type.includes("noteref") || (anchor.getAttribute("role") || "").includes("doc-noteref");
      });
      section.unload?.();
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
