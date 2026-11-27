import { applyFaintFix, setFaintFix } from "./book-colors.js";
import { applyFontScale, setFontScale } from "./font-scale.js";
import { fontCss } from "./fonts.js";
import * as epub from "../../vendor/foliate-js/epub.js";
import * as zip from "../../vendor/foliate-js/vendor/zip.js";
import { restoreTarget } from "./jumps.js";

import { TABLE_CSS, waitFor, wrapWideTables } from "./measure.js";
import { attachBookSecurity } from "./security.js";

// zip.js keeps this reader when size and readUint8Array are both set.
// The directory is read through readUint8Array. An entry is read through
// readable: getData assigns offset and size onto that stream, then pulls it.
// A missing readable is a TypeError inside getData. The bytes returned from
// readUint8Array must own their buffer, because zip.js wraps e.buffer.
export function makeRangeReader(url, size, counter) {
  return {
    size,
    chunkSize: 65536,
    async readUint8Array(offset, length) {
      const start = Number(offset);
      const len = Number(length);
      counter.n += 1;
      if (!Number.isFinite(start) || !Number.isFinite(len) || len < 0) {
        throw new Error("bad range read");
      }
      if (len === 0) return new Uint8Array(0);
      const response = await fetch(url, {
        headers: { Range: `bytes=${start}-${start + len - 1}` },
      });
      if (response.status === 200) counter.fullResponses += 1;
      if (response.status !== 206 && response.status !== 200) {
        throw new Error(`range ${response.status}`);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      return bytes.byteLength > len ? bytes.slice(0, len) : bytes;
    },
    get readable() {
      const reader = this;
      const chunkSize = this.chunkSize || 65536;
      const stream = new ReadableStream({
        start() {
          this.chunkOffset = 0;
        },
        async pull(controller) {
          const offset = stream.offset ?? 0;
          const byteSize = stream.size;
          const chunkOffset = this.chunkOffset;
          const length = byteSize === undefined ? chunkSize : Math.min(chunkSize, byteSize - chunkOffset);
          const bytes = await reader.readUint8Array(offset + chunkOffset, length, stream.diskNumberStart);
          controller.enqueue(bytes);
          if (chunkOffset + chunkSize > byteSize || (byteSize === undefined && bytes.length === 0 && length)) {
            controller.close();
          } else {
            this.chunkOffset += chunkSize;
          }
        },
      });
      return stream;
    },
  };
}

async function bookSize(url) {
  const head = await fetch(url, { method: "HEAD" });
  const length = Number(head.headers.get("content-length"));
  if (head.ok && Number.isFinite(length) && length >= 0) return length;
  const probe = await fetch(url, { headers: { Range: "bytes=0-0" } });
  const match = /\/(\d+)\s*$/.exec(probe.headers.get("content-range") ?? "");
  if (!match) throw new Error(`size unknown (${head.status})`);
  return Number(match[1]);
}

async function loaderFromReader(reader) {
  const entries = await reader.getEntries();
  const map = new Map(entries.map((entry) => [entry.filename, entry]));
  const load = (entry, writer) => (entry ? entry.getData(writer) : null);
  return {
    loadText: (name) => load(map.get(name), new zip.TextWriter()),
    loadBlob: (name, type) => load(map.get(name), new zip.BlobWriter(type)),
    getSize: (name) => map.get(name)?.uncompressedSize ?? 0,
    text(name) {
      const entry = map.get(name);
      return entry ? entry.getData(new zip.TextWriter()) : null;
    },
  };
}

async function encryptionFromBlob(blob) {
  const reader = new zip.ZipReader(new zip.BlobReader(blob));
  try {
    const entries = await reader.getEntries();
    const entry = entries.find((item) => item.filename === "META-INF/encryption.xml");
    if (!entry) return null;
    return await entry.getData(new zip.TextWriter());
  } finally {
    await reader.close();
  }
}

function clearStage() {
  const stage = document.getElementById("stage");
  const existing = stage.querySelector("foliate-view");
  if (existing) {
    try {
      existing.close();
    } catch (error) {
      console.error(error);
    }
    existing.remove();
  }
  return stage;
}

export async function openPrepared(url, id, readMode, askDecision) {
  zip.configure({ useWebWorkers: false });
  const counter = { n: 0, fullResponses: 0 };
  const fetchStarted = performance.now();
  let bytes = null;
  let xml = null;
  let file = null;
  let loader = null;

  if (readMode === "range") {
    bytes = await bookSize(url);
    const zipReader = new zip.ZipReader(makeRangeReader(url, bytes, counter));
    loader = await loaderFromReader(zipReader);
    xml = await loader.text("META-INF/encryption.xml");
  } else {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`fetch ${response.status}`);
    const blob = await response.blob();
    bytes = blob.size;
    file = new File([blob], "book.epub", { type: "application/epub+zip" });
    xml = await encryptionFromBlob(blob);
  }

  const fetchMs = Math.round(performance.now() - fetchStarted);
  const decision = await askDecision(id, xml);
  const report = {
    engineOpened: false,
    kind: decision.kind,
    fetchMs,
    bytes,
    readMode,
    rangeRequests: counter.n,
    fullResponses: counter.fullResponses,
    secureContext: window.isSecureContext,
    hasSubtle: Boolean(globalThis.crypto?.subtle),
  };
  if (!decision.open) return { report, view: null, counter };

  const stage = clearStage();
  const view = document.createElement("foliate-view");
  view.style.cssText = "display:block;width:100%;height:100%";
  stage.append(view);
  view.addEventListener("load", (event) => wrapWideTables(event.detail?.doc, view));
  const openStarted = performance.now();
  if (readMode === "range") {
    const book = await new epub.EPUB(loader).init();
    await view.open(book);
  } else {
    await view.open(file);
  }
  attachBookSecurity(view.book);
  view.renderer.setStyles(TABLE_CSS);
  await view.init({ showTextStart: true });
  await waitFor(() => view.lastLocation?.cfi, 90000);
  report.engineOpened = true;
  report.openMs = Math.round(performance.now() - openStarted);
  report.rangeRequests = counter.n;
  report.fullResponses = counter.fullResponses;
  report.cfi = view.lastLocation?.cfi ?? null;
  report.sections = view.book?.sections?.length ?? null;
  return { report, view, counter };
}

/**
 * The reading open path. Range reads only, which the M1a phone run chose.
 * DRM is refused before the engine sees the book. onView runs before
 * view.open, so load and relocate listeners see the first section.
 */
// One light look until themes arrive in Milestone 4. Publisher colors still win where set.
const READING_CSS = "html { color-scheme: light; background: #fdfdfb; color: #1a1a1a; }";

/**
 * The reader's look: CSS for book content (src/settings/reading-css.ts, built
 * by the host) and foliate's paginator attributes for margins and line width.
 * Without a look from the host, the plain light page.
 */
let lookSeq = 0;

export async function applyLookTo(view, look) {
  if (!view || view.isFixedLayout) return;
  const seq = ++lookSeq;
  const css = typeof look?.css === "string" && look.css.length < 20000 ? look.css : READING_CSS;
  const faces = await fontCss(look?.fonts);
  // A newer look arrived while this one's fonts loaded: that one wins.
  if (seq !== lookSeq) return;
  // The new CSS first: the size is measured against it, never against the old look's
  // forced sizes (turning the book's styles back on at 130% would scale twice).
  view.renderer.setStyles?.(`${faces}\n${TABLE_CSS}\n${css}`);
  setFontScale(view, look);
  setFaintFix(view, look);
  if (typeof look?.gap === "string" && /^\d{1,2}%$/.test(look.gap)) view.renderer.setAttribute("gap", look.gap);
  if (typeof look?.maxInlineSize === "string" && /^\d{3,4}px$/.test(look.maxInlineSize)) {
    view.renderer.setAttribute("max-inline-size", look.maxInlineSize);
  }
}

export async function openBook(url, id, askDecision, { flow, lastLocation, position, look, onView }) {
  zip.configure({ useWebWorkers: false });
  const counter = { n: 0, fullResponses: 0 };
  const bytes = await bookSize(url);
  const zipReader = new zip.ZipReader(makeRangeReader(url, bytes, counter));
  const loader = await loaderFromReader(zipReader);
  const xml = await loader.text("META-INF/encryption.xml");
  const decision = await askDecision(id, xml);
  const report = { engineOpened: false, kind: decision.kind, bytes, rangeRequests: counter.n };
  if (!decision.open) return { report, view: null, counter };

  const stage = clearStage();
  const view = document.createElement("foliate-view");
  view.style.cssText = "display:block;width:100%;height:100%";
  stage.append(view);
  view.addEventListener("load", (event) => {
    // Before wide tables are measured, so they see the final text size.
    applyFontScale(event.detail?.doc);
    applyFaintFix(event.detail?.doc);
    wrapWideTables(event.detail?.doc, view);
  });
  onView?.(view);
  const openStarted = performance.now();
  const book = await new epub.EPUB(loader).init();
  await view.open(book);
  attachBookSecurity(view.book);
  // Fixed-layout books get foliate's fixed-layout renderer, which has no flow and no setStyles.
  if (!view.isFixedLayout) {
    view.renderer.setAttribute("flow", flow === "scrolled" ? "scrolled" : "paginated");
    await applyLookTo(view, look);
  }
  // The saved CFI, else the saved section and offset, else the book fraction, else the start of the text.
  let restore = { target: null, plan: { kind: "start" } };
  try {
    restore = restoreTarget(view, position ?? (lastLocation ? { cfi: lastLocation } : null));
  } catch (error) {
    console.error("saved location did not resolve", error);
  }
  const restored = restore.target !== null;
  await view.init({ lastLocation: restore.target, showTextStart: true });
  await waitFor(() => view.lastLocation?.cfi, 90000);
  report.engineOpened = true;
  report.restored = restored;
  report.restoredFrom = restore.plan.kind === "fraction" ? restore.plan.from : restore.plan.kind;
  report.fixedLayout = Boolean(view.isFixedLayout);
  report.openMs = Math.round(performance.now() - openStarted);
  report.rangeRequests = counter.n;
  report.fullResponses = counter.fullResponses;
  return { report, view, counter };
}
