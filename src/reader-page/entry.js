import * as epub from "../../vendor/foliate-js/epub.js";
import * as fixedLayout from "../../vendor/foliate-js/fixed-layout.js";
import * as paginator from "../../vendor/foliate-js/paginator.js";
import * as zip from "../../vendor/foliate-js/vendor/zip.js";
import "../../vendor/foliate-js/view.js";

import { applyInsets, applySettings, back, closeNote, debug, goTo, historyBack, openForReading, setFlow, setLook, turn } from "./app.js";
import { chapterFacts, liveDoc, timeTurns } from "./measure.js";
import { openPrepared } from "./open-book.js";
import { installPageErrors } from "./page-errors.js";
import { cspOf, installBookCspParser } from "./security.js";

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
installPageErrors(window);

const pending = new Map();
const pendingContinue = new Map();

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

function waitContinue(id) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingContinue.delete(id);
      reject(new Error("continue timeout"));
    }, 180000);
    pendingContinue.set(id, () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function finish(id, report) {
  try {
    await fetch("report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, report }),
    });
  } catch (error) {
    report.postError = String(error);
  }
  reply({ type: "result", id, report });
}

async function turnSamples(view, counter, count) {
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    const mark = counter.n;
    const [sample] = await timeTurns(view, 1);
    sample.rangeRequests = counter.n - mark;
    samples.push(sample);
  }
  return samples;
}

async function runCheck(message) {
  const readMode = message.read === "blob" ? "blob" : "range";
  const { report, view, counter } = await openPrepared(message.url, message.id, readMode, askDecision);
  if (view) {
    Object.assign(report, await chapterFacts(view));
    report.csp = cspOf(liveDoc(view));
  }
  reply({ type: "first", id: message.id, report });
  await waitContinue(message.id);
  if (view && message.mode === "large" && readMode === "range") {
    report.turns = await turnSamples(view, counter, 5);
    report.turnRangeRequests = report.turns.map((turn) => turn.rangeRequests);
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
  if (message.type === "continue") {
    const waiter = pendingContinue.get(message.id);
    if (!waiter) return;
    pendingContinue.delete(message.id);
    waiter();
    return;
  }
  if (message.type === "open") {
    openForReading(message, reply, askDecision).catch((error) => {
      reply({ type: "failed", id: message.id, error: String(error?.message ?? error) });
    });
    return;
  }
  if (message.type === "flow") {
    setFlow(message).catch((error) => console.error(error));
    return;
  }
  if (message.type === "settings") {
    applySettings(message);
    return;
  }
  if (message.type === "insets") {
    applyInsets(message);
    return;
  }
  if (message.type === "history-back") {
    historyBack(message).catch((error) => console.error(error));
    return;
  }
  if (message.type === "close-note") {
    closeNote(message);
    return;
  }
  if (message.type === "look") {
    setLook(message).catch((error) => console.error(error));
    return;
  }
  if (message.type === "goto") {
    goTo(message).catch((error) => console.error(error));
    return;
  }
  if (message.type === "back") {
    back(message).catch((error) => console.error(error));
    return;
  }
  if (message.type === "turn") {
    turn(message).catch((error) => console.error(error));
    return;
  }
  if (message.type === "debug") {
    const reqId = String(message.reqId ?? "");
    debug(message)
      .then((result) => reply({ type: "debug", id: message.id, reqId, result }))
      .catch((error) => reply({ type: "debug", id: message.id, reqId, result: { error: String(error?.message ?? error) } }));
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
