import * as epub from "../../vendor/foliate-js/epub.js";
import * as fixedLayout from "../../vendor/foliate-js/fixed-layout.js";
import * as paginator from "../../vendor/foliate-js/paginator.js";
import * as zip from "../../vendor/foliate-js/vendor/zip.js";
import "../../vendor/foliate-js/view.js";

import { chapterFacts, liveDoc, TABLE_CSS, tableFacts, timeTurns, waitFor, wrapWideTables } from "./measure.js";
import { attachBookSecurity, cspOf, installBookCspParser } from "./security.js";

const bundled = {
  "./epub.js": epub,
  "./fixed-layout.js": fixedLayout,
  "./paginator.js": paginator,
  "./vendor/zip.js": zip,
};

const stubs = {
  "./pdf.js": { makePDF() { throw new Error("PDF is not bundled"); } },
  "./mobi.js": { isMOBI: async () => false, MOBI: class MOBI {} },
  "./fb2.js": { makeFB2() { throw new Error("FB2 is not bundled"); } },
  "./comic-book.js": { makeComicBook() { throw new Error("CBZ is not bundled"); } },
  "./vendor/fflate.js": { unzlibSync() { throw new Error("fflate is not bundled"); } },
  "./search.js": { searchMatcher() { throw new Error("search is not bundled"); } },
  "./tts.js": { TTS: class TTS { constructor() { throw new Error("TTS is not bundled"); } } },
};

globalThis.__quireImport = (spec) => {
  const mod = bundled[spec] ?? stubs[spec];
  if (!mod) return Promise.reject(new Error(`not bundled: ${spec}`));
  return Promise.resolve(mod);
};

installBookCspParser();

const pending = new Map();

function reply(message) {
  const raw = JSON.stringify(message);
  window.__quireReply = raw;
  if (window.ReactNativeWebView?.postMessage) window.ReactNativeWebView.postMessage(raw);
}

function askDecision(id, xml) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("decision timeout"));
    }, 20000);
    pending.set(id, (decision) => {
      clearTimeout(timer);
      resolve(decision);
    });
    reply({ type: "encryption", id, xml });
  });
}

async function readEncryptionXml(blob) {
  zip.configure({ useWebWorkers: false });
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

async function openPrepared(url, id) {
  const fetchStarted = performance.now();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fetch ${response.status}`);
  const blob = await response.blob();
  const fetchMs = Math.round(performance.now() - fetchStarted);
  const xml = await readEncryptionXml(blob);
  const decision = await askDecision(id, xml);
  const report = {
    engineOpened: false,
    kind: decision.kind,
    fetchMs,
    bytes: blob.size,
    secureContext: window.isSecureContext,
    hasSubtle: Boolean(globalThis.crypto?.subtle),
  };
  if (!decision.open) return { report, view: null };

  const stage = clearStage();
  const view = document.createElement("foliate-view");
  view.style.cssText = "display:block;width:100%;height:100%";
  stage.append(view);
  view.addEventListener("load", (event) => wrapWideTables(event.detail?.doc, view));
  const file = new File([blob], "book.epub", { type: "application/epub+zip" });
  const openStarted = performance.now();
  await view.open(file);
  attachBookSecurity(view.book);
  view.renderer.setStyles(TABLE_CSS);
  await view.init({ showTextStart: true });
  await waitFor(() => view.lastLocation?.cfi, 90000);
  report.engineOpened = true;
  report.openMs = Math.round(performance.now() - openStarted);
  report.cfi = view.lastLocation?.cfi ?? null;
  report.sections = view.book?.sections?.length ?? null;
  return { report, view };
}

async function finish(id, report) {
  try {
    await fetch("/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, report }),
    });
  } catch (error) {
    report.postError = String(error);
  }
  reply({ type: "result", id, report });
}

async function runCheck(message) {
  clearStage();
  const { report, view } = await openPrepared(message.url, message.id);
  if (view && message.mode !== "table") {
    Object.assign(report, await chapterFacts(view));
    report.csp = cspOf(liveDoc(view));
  }
  if (view && message.mode === "table") {
    view.renderer.setAttribute("flow", "scrolled");
    report.table = await tableFacts(view);
    report.csp = cspOf(liveDoc(view));
    report.flow = view.renderer.getAttribute("flow");
  }
  if (view && message.mode === "large") {
    report.turns = await timeTurns(view, 5);
    report.waitNote =
      "wallMs is next() and includes the hardcoded 100ms paginator wait. relocateMs is the time until the page has moved, before that wait. The wait is not a setting.";
  }
  await finish(message.id, report);
}

function onMessage(event) {
  if (typeof event.data !== "string") return;
  let message;
  try {
    message = JSON.parse(event.data);
  } catch {
    return;
  }
  if (!message || typeof message.id !== "string") return;
  if (message.type === "ping") {
    reply({ type: "pong", id: message.id });
    return;
  }
  if (message.type === "decision") {
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    waiter(message);
    return;
  }
  if (message.type === "run") {
    runCheck(message).catch((error) => {
      void finish(message.id, { engineOpened: false, error: String(error) });
    });
  }
}

document.addEventListener("message", onMessage);
window.addEventListener("message", onMessage);
