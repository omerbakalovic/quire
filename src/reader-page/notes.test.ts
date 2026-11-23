import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// @ts-expect-error jsdom ships no types here; the tests only use DOMParser and documents.
import { JSDOM } from "jsdom";

const { window } = new JSDOM("<!doctype html><html><body></body></html>");
// notes.js runs in the reader WebView, where these are globals.
const globals = globalThis as Record<string, unknown>;
globals.CSS ??= { escape: (value: string) => value.replace(/[^\w-]/g, (c) => `\\${c}`) };
globals.DOMParser ??= window.DOMParser;
globals.document ??= window.document;

const { confirmNote, findTarget, noteBlock, sanitizeInto } = await import("./notes.js");
const { readSection } = await import("./note-popup.js");
const { installPageErrors, pageErrors, recordPageError } = await import("./page-errors.js");

const XHTML = "application/xhtml+xml";

function xhtml(body: string, title = "Notes") {
  return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${title}</title></head><body>${body}</body></html>`;
}

function parse(markup: string, type = XHTML) {
  return new window.DOMParser().parseFromString(markup, type);
}

/** The note an id resolves to, as its blocks' text joined by " | ". */
function noteText(doc: Document, id: string) {
  const blocks = noteBlock(findTarget(doc, id));
  return blocks?.map((block: Element) => block.textContent?.replace(/\s+/g, " ").trim()).join(" | ") ?? null;
}

test("the fixture's empty anchor is the paragraph after it, not the rest of the endnotes", () => {
  const source = readFileSync(new URL("../../test-books/src/noteref/OEBPS/endnotes.xhtml", import.meta.url), "utf8");
  const doc = parse(source);
  assert.equal(noteText(doc, "en-empty"), "This paragraph follows an empty anchor.");
  // The semantic link (ref-empty-sem) and the plain <sup> link (ref-empty-sup) both treat it as a note.
  const target = findTarget(doc, "en-empty");
  const blocks = noteBlock(target);
  assert.equal(confirmNote("semantic", target, blocks, "ref-empty-sem"), true);
  assert.equal(confirmNote("maybe", target, blocks, "ref-empty-sup"), true);
});

test("an empty anchor before paragraphs takes them up to the next anchor", () => {
  const doc = parse(xhtml(`<div><a id="n1"/><p>Note one.</p><p>Second paragraph.</p><a id="n2"/><p>Note two.</p></div>`));
  assert.equal(noteText(doc, "n1"), "Note one. | Second paragraph.");
  assert.equal(noteText(doc, "n2"), "Note two.");
});

test("an empty anchor inside its paragraph is that paragraph, and stops at the next note", () => {
  const doc = parse(xhtml(`<p><a id="n1"/>1. First note.</p><p>It goes on.</p><p><a id="n2"/>2. Second note.</p>`));
  assert.equal(noteText(doc, "n1"), "1. First note. | It goes on.");
  assert.equal(noteText(doc, "n2"), "2. Second note.");
});

test("an empty anchor in a heading label takes the heading and the note under it", () => {
  const doc = parse(xhtml(`<div><h3><a id="n1"/>1</h3><p>Under the first heading.</p><h3><a id="n2"/>2</h3><p>Other.</p></div>`));
  assert.equal(noteText(doc, "n1"), "1 | Under the first heading.");
});

test("an empty anchor in an empty wrapper is the text after the wrapper", () => {
  const doc = parse(xhtml(`<div><div><a id="n1"/></div><p>After the wrapper.</p><div><a id="n2"/></div><p>Other.</p></div>`));
  assert.equal(noteText(doc, "n1"), "After the wrapper.");
});

test("an empty anchor at the end of a paragraph does not take that paragraph's text", () => {
  const doc = parse(xhtml(`<div><p>The previous note.<a id="n1"/></p><p>The real note.</p></div>`));
  assert.equal(noteText(doc, "n1"), "The real note.");
});

test("an empty anchor in its own note div is the whole div", () => {
  const doc = parse(xhtml(`<div class="note"><a id="n1"/><p>Para one.</p><p>Para two.</p></div><div class="note"><a id="n2"/><p>Next.</p></div>`));
  assert.equal(noteText(doc, "n1"), "Para one.Para two.");
});

test("an empty anchor before another id's heading is not a note", () => {
  const doc = parse(xhtml(`<p>Text.</p><a id="n1"/><h2 id="ch3">Chapter Three</h2><p>Body.</p>`));
  assert.equal(noteBlock(findTarget(doc, "n1")), null);
});

test("an empty anchor with nothing after it is not a note", () => {
  const doc = parse(xhtml(`<p>Last words.</p><a id="n1"/>`));
  assert.equal(noteBlock(findTarget(doc, "n1")), null);
});

test("an old-style name anchor is found and read the same way", () => {
  const doc = parse(xhtml(`<p><a name="n1"/>Named note.</p><p><a name="n2"/>Other.</p>`));
  assert.equal(noteText(doc, "n1"), "Named note.");
});

test("ids on note elements and text blocks still resolve as before", () => {
  const source = readFileSync(new URL("../../test-books/src/noteref/OEBPS/endnotes.xhtml", import.meta.url), "utf8");
  const doc = parse(source);
  assert.match(noteText(doc, "en1") ?? "", /^Endnote in another file, with italics\./);
  const chapter = parse(readFileSync(new URL("../../test-books/src/noteref/OEBPS/chapter-1.xhtml", import.meta.url), "utf8"));
  assert.match(noteText(chapter, "fn1") ?? "", /First paragraph of the same-file footnote/);
});

test("the popup copy of an empty-anchor note keeps its text and nothing executable", () => {
  const doc = parse(xhtml(`<a id="n1"/><p onclick="x()">Note <script>bad()</script><a href="javascript:x()">link</a>.</p>`));
  const { fragment } = sanitizeInto(window.document, noteBlock(findTarget(doc, "n1")), { originId: null, resolveLink: null });
  const holder = window.document.createElement("div");
  holder.append(fragment);
  assert.equal(holder.textContent, "Note link.");
  assert.equal(holder.querySelector("script"), null);
  assert.equal(holder.querySelector("[onclick]"), null);
  assert.equal(holder.querySelector("a")?.getAttribute("data-href"), null);
});

// Notes in another file are read in the background. Read as text/html, <a id="n1"/>
// opens an <a> that swallows what follows, and the wrong note came back.
const selfClosing = xhtml(`<div><a id="n1"/><p>Note one.</p><p>More of one.</p><a id="n2"/><p>Note two.</p></div>`);

test("parsing XHTML as text/html breaks self-closed anchors (why readSection exists)", () => {
  assert.notEqual(noteText(parse(selfClosing, "text/html"), "n1"), "Note one. | More of one.");
});

test("readSection uses the section's own parser when foliate gives one", async () => {
  const section = { createDocument: async () => parse(selfClosing), load: () => assert.fail("load is not used") };
  const doc = await readSection(section);
  assert.equal(noteText(doc, "n1"), "Note one. | More of one.");
});

test("readSection without createDocument parses an XHTML response as XML", async () => {
  const restore = globals.fetch;
  globals.fetch = async () => new Response(selfClosing, { headers: { "content-type": "application/xhtml+xml" } });
  try {
    const doc = await readSection({ load: async () => "blob:section" });
    assert.equal(noteText(doc, "n1"), "Note one. | More of one.");
  } finally {
    globals.fetch = restore;
  }
});

test("readSection falls back to text/html when the XHTML does not parse", async () => {
  const restore = globals.fetch;
  globals.fetch = async () =>
    new Response("<html><body><p id=n1>Loose &nbsp; HTML<br></body></html>", { headers: { "content-type": "application/xhtml+xml" } });
  try {
    const doc = await readSection({ load: async () => "blob:section" });
    assert.equal(doc.querySelector("parsererror"), null);
    assert.match(noteText(doc, "n1") ?? "", /Loose/);
  } finally {
    globals.fetch = restore;
  }
});

test("the note popup reads notes itself and never builds foliate views", () => {
  // M1a's 67 "doc is null" errors came from foliate's FootnoteHandler: each note
  // opened a hidden <foliate-view>, and removing it left its paginator's
  // ResizeObserver and font callbacks reading the gone iframe's null document.
  for (const file of ["./note-popup.js", "./notes.js", "./app.js", "./entry.js"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /footnotes\.js|FootnoteHandler/, file);
    if (file !== "./entry.js") assert.doesNotMatch(source, /createElement\(\s*["']foliate-view/, file);
  }
});

test("page errors are counted, sampled, and reset", () => {
  pageErrors({ reset: true });
  const target = new window.EventTarget();
  installPageErrors(target);
  const error = new window.Event("error");
  Object.defineProperty(error, "message", { value: "doc is null" });
  target.dispatchEvent(error);
  const rejection = new window.Event("unhandledrejection");
  Object.defineProperty(rejection, "reason", { value: new Error("late") });
  target.dispatchEvent(rejection);
  recordPageError(undefined);
  assert.deepEqual(pageErrors({ reset: true }), { count: 3, samples: ["doc is null", "late", "unknown error"] });
  assert.deepEqual(pageErrors(), { count: 0, samples: [] });
});
