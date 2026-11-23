import {
  confirmNote,
  findTarget,
  hideInlineFootnotes,
  linkFromEvent,
  markNoterefs,
  noteBlock,
  noterefKind,
  noterefsIn,
  NOTEREF_CSS,
  sanitizeInto,
} from "./notes.js";

/**
 * The note popup. Tapping a noteref shows its note over the current page;
 * the reader does not move. Notes in another file are read in the background.
 * Actions: previous and next note in this chapter, go to the note's real
 * place (with a Back to text control), copy, and close. A link inside a note
 * that is itself a note opens on top, with Back.
 */
const POPUP_CSS = `
#quire-note { position: fixed; inset: 0; z-index: 50; display: none; }
#quire-note.open { display: block; }
#quire-note .shade { position: absolute; inset: 0; background: rgba(0,0,0,.28); }
#quire-note .sheet { position: absolute; left: 0; right: 0; bottom: 0; max-height: 62vh; display: flex;
  padding: 0 var(--quire-inset-right, 0px) var(--quire-inset-bottom, 0px) var(--quire-inset-left, 0px);
  flex-direction: column; background: #fdfdfb; color: #1a1a1a; border-radius: 14px 14px 0 0;
  box-shadow: 0 -4px 24px rgba(0,0,0,.25); font: 17px/1.5 Georgia, "Noto Serif", serif; }
#quire-note .bar { display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid #e3e1da;
  font: 14px system-ui, sans-serif; color: #555; }
#quire-note .bar .label { flex: 1; padding-left: 8px; }
#quire-note button { font: 14px system-ui, sans-serif; min-width: 44px; min-height: 44px; padding: 0 10px;
  border: 0; border-radius: 8px; background: transparent; color: #1f5fbf; }
#quire-note button:disabled { color: #aaa; }
#quire-note button:focus:not(:focus-visible) { outline: none; }
#quire-note .body { overflow-y: auto; padding: 12px 18px 18px; -webkit-overflow-scrolling: touch; }
#quire-note .body p { margin: 0 0 .7em; }
#quire-note .body img { max-width: 100%; height: auto; }
#quire-note .body a { color: #1f5fbf; }
#quire-note .body .quire-sc { font-variant: small-caps; }
#quire-note .actions { display: flex; justify-content: space-between; gap: 4px; padding: 4px 8px 10px;
  border-top: 1px solid #e3e1da; }
#quire-back { position: fixed; left: 50%; bottom: calc(18px + var(--quire-inset-bottom, 0px)); transform: translateX(-50%); z-index: 40; display: none;
  min-height: 44px; padding: 0 18px; border: 0; border-radius: 22px; background: #1c1c1e; color: #fff;
  font: 15px system-ui, sans-serif; box-shadow: 0 2px 10px rgba(0,0,0,.3); }
#quire-back.show { display: block; }
`;

const STRINGS = {
  note: "Note",
  of: (a, b) => `${a} of ${b}`,
  prev: "Previous",
  next: "Next",
  goTo: "Go to note",
  copy: "Copy",
  copied: "Copied",
  close: "Close",
  back: "Back",
  backToText: "Back to text",
};

/** Past this many look-alike links in one section, the rest count without a check. */
const MAX_CONFIRM = 200;

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text) node.textContent = text;
  return node;
}

export class NotePopup {
  #view;
  #reply;
  #id;
  #root;
  #body;
  #label;
  #buttons = {};
  #backChip;
  #stack = [];
  #list = [];
  #options = { aggressive: false };
  #liveDocs = new Map();
  #parsedDocs = new Map();

  constructor(view, reply, id) {
    this.#view = view;
    this.#reply = reply;
    this.#id = id;
    this.#build();
  }

  #build() {
    document.getElementById("quire-note")?.remove();
    document.getElementById("quire-back")?.remove();
    if (!document.getElementById("quire-note-style")) {
      const style = el("style", { id: "quire-note-style" });
      style.textContent = POPUP_CSS;
      document.head.append(style);
    }
    const root = el("div", { id: "quire-note", role: "dialog", "aria-modal": "true", "aria-label": STRINGS.note });
    const shade = el("div", { class: "shade" });
    shade.addEventListener("click", () => this.close());
    const sheet = el("div", { class: "sheet" });
    const bar = el("div", { class: "bar" });
    this.#buttons.back = el("button", { type: "button" }, `‹ ${STRINGS.back}`);
    this.#buttons.back.addEventListener("click", () => this.#pop());
    this.#label = el("span", { class: "label" }, STRINGS.note);
    this.#buttons.close = el("button", { type: "button", "aria-label": STRINGS.close }, "✕");
    this.#buttons.close.addEventListener("click", () => this.close());
    bar.append(this.#buttons.back, this.#label, this.#buttons.close);
    this.#body = el("div", { class: "body" });
    this.#body.addEventListener("click", (event) => this.#onBodyClick(event));
    const actions = el("div", { class: "actions" });
    for (const [key, label] of [
      ["prev", `‹ ${STRINGS.prev}`],
      ["goTo", STRINGS.goTo],
      ["copy", STRINGS.copy],
      ["next", `${STRINGS.next} ›`],
    ]) {
      const button = el("button", { type: "button" }, label);
      this.#buttons[key] = button;
      actions.append(button);
    }
    this.#buttons.prev.addEventListener("click", () => this.#step(-1));
    this.#buttons.next.addEventListener("click", () => this.#step(1));
    this.#buttons.goTo.addEventListener("click", () => this.#goToNote());
    this.#buttons.copy.addEventListener("click", () => this.#copy());
    sheet.append(bar, this.#body, actions);
    root.append(shade, sheet);
    document.body.append(root);
    this.#root = root;
    this.#backChip = el("button", { id: "quire-back", type: "button" }, `‹ ${STRINGS.backToText}`);
    this.#backChip.addEventListener("click", () => {
      this.#backChip.classList.remove("show");
      this.#view.history.back();
    });
    document.body.append(this.#backChip);
  }

  get isOpen() {
    return this.#root.classList.contains("open");
  }

  setOptions(options) {
    this.#options = { ...this.#options, ...options };
  }

  /** Called for every section document foliate loads. */
  attach(doc, index) {
    const style = doc.createElement("style");
    style.textContent = NOTEREF_CSS;
    (doc.head ?? doc.documentElement).append(style);
    markNoterefs(doc, this.#options);
    hideInlineFootnotes(doc);
    this.#liveDocs.set(index, doc);
    // Capture phase, so foliate's own link handler never sees a noteref tap.
    doc.addEventListener(
      "click",
      (event) => {
        const a = linkFromEvent(event);
        if (!a) return;
        const kind = noterefKind(a, this.#options);
        if (kind === "no") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void this.openFrom(a, doc, index, kind);
      },
      true,
    );
  }

  #section(index) {
    return this.#view.book.sections[index];
  }

  /** The document for a section: the live one when it is on screen, else read in the background. */
  #docFor(index) {
    const live = this.#liveDocs.get(index);
    if (live?.defaultView) return Promise.resolve(live);
    let parsed = this.#parsedDocs.get(index);
    if (!parsed) {
      parsed = (async () => {
        const url = await this.#section(index).load();
        const html = await (await fetch(url)).text();
        return new DOMParser().parseFromString(html, "text/html");
      })();
      parsed.catch(() => this.#parsedDocs.delete(index));
      this.#parsedDocs.set(index, parsed);
    }
    return parsed;
  }

  async #resolve(a, index) {
    const raw = a.getAttribute("data-href") ?? a.getAttribute("href");
    const section = this.#section(index);
    const href = a.hasAttribute("data-href") ? raw : (section?.resolveHref?.(raw) ?? raw);
    const resolved = this.#view.book.resolveHref(href);
    if (!resolved || resolved.index == null || resolved.index < 0) return null;
    const fragment = href.includes("#") ? href.slice(href.indexOf("#") + 1) : null;
    return { href, index: resolved.index, fragment };
  }

  async #noteFor(a, index, kind) {
    const where = await this.#resolve(a, index);
    if (!where?.fragment) return { where, note: null };
    const doc = await this.#docFor(where.index);
    const target = findTarget(doc, where.fragment);
    const blocks = noteBlock(target);
    const originId = a.id || a.closest("[id]")?.id || null;
    if (!confirmNote(kind, target, blocks, originId, this.#options)) return { where, note: null };
    const noteSection = this.#section(where.index);
    const { fragment, backHref } = sanitizeInto(document, blocks, {
      originId,
      resolveLink: (href) => (href.startsWith("blob:") ? href : (noteSection?.resolveHref?.(href) ?? href)),
    });
    const hidden = blocks.some((block) => block.closest?.("[data-quire-hidden]"));
    return { where, note: { fragment, backHref, hidden, a } };
  }

  /** Open from a noteref in a section. Not a note after all: follow it as a link. */
  async openFrom(a, doc, index, kind) {
    try {
      const { where, note } = await this.#noteFor(a, index, kind);
      if (!note) {
        if (where) await this.#view.goTo(where.href);
        return;
      }
      const list = noterefsIn(doc, this.#options);
      this.#list = list;
      this.#stack = [{ ...note, where, index, kind }];
      this.#render();
      this.#reply({ type: "note", id: this.#id, open: true, href: where.href });
      void this.#confirmList(list, index);
    } catch (error) {
      console.error("note failed", error);
      this.#reply({ type: "note", id: this.#id, open: false, error: String(error?.message ?? error) });
    }
  }

  /**
   * Links that only look like noterefs (a superscript, a [1]) count toward
   * "N of M" and Previous/Next only once their target reads as a note.
   */
  async #confirmList(list, index) {
    const kept = [];
    let checked = 0;
    for (const a of list) {
      const kind = noterefKind(a, this.#options);
      if (kind === "semantic" || this.#stack[0]?.a === a) {
        kept.push(a);
        continue;
      }
      if (++checked > MAX_CONFIRM) {
        // Past the cap, a superscript or [1] still counts; a plain id'd link does not.
        if (kind === "maybe") kept.push(a);
        continue;
      }
      try {
        const { note } = await this.#noteFor(a, index, kind);
        if (note) kept.push(a);
      } catch {
        // A link we cannot read is left out of the count.
      }
    }
    if (this.#list !== list) return;
    this.#list = kept;
    if (this.isOpen) this.#renderControls();
  }

  #render() {
    const top = this.#stack[this.#stack.length - 1];
    if (!top) return this.close();
    this.#body.replaceChildren(top.fragment.cloneNode(true));
    this.#body.scrollTop = 0;
    this.#renderControls();
    this.#buttons.copy.textContent = STRINGS.copy;
    this.#root.classList.add("open");
    this.#buttons.close.focus({ preventScroll: true });
  }

  #renderControls() {
    const top = this.#stack[this.#stack.length - 1];
    if (!top) return;
    const position = this.#list.indexOf(top.a);
    this.#label.textContent =
      this.#stack.length === 1 && position >= 0 ? STRINGS.of(position + 1, this.#list.length) : STRINGS.note;
    this.#buttons.back.style.visibility = this.#stack.length > 1 ? "visible" : "hidden";
    this.#buttons.prev.disabled = this.#stack.length > 1 || position <= 0;
    this.#buttons.next.disabled = this.#stack.length > 1 || position < 0 || position >= this.#list.length - 1;
    this.#buttons.goTo.disabled = Boolean(top.hidden);
  }

  close() {
    if (!this.isOpen) return;
    this.#root.classList.remove("open");
    this.#stack = [];
    this.#reply({ type: "note", id: this.#id, open: false });
  }

  #pop() {
    this.#stack.pop();
    this.#render();
  }

  async #step(dir) {
    const top = this.#stack[0];
    // A look-alike link not yet checked may turn out not to be a note: skip past it.
    for (let position = this.#list.indexOf(top?.a) + dir; position >= 0 && position < this.#list.length; position += dir) {
      const ref = this.#list[position];
      const { where, note } = await this.#noteFor(ref, top.index, noterefKind(ref, this.#options));
      if (!note) continue;
      this.#stack = [{ ...note, where, index: top.index, kind: "semantic" }];
      this.#render();
      return;
    }
  }

  async #goToNote() {
    const top = this.#stack[this.#stack.length - 1];
    if (!top || top.hidden) return;
    this.close();
    await this.#view.goTo(top.where.href);
    this.#backChip.classList.add("show");
  }

  async #copy() {
    const text = this.#body.innerText.trim();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = el("textarea");
      area.value = text;
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    this.#buttons.copy.textContent = STRINGS.copied;
  }

  /** Links inside a note: another note opens on top; a book link closes and goes; a web link asks the host. */
  async #onBodyClick(event) {
    const a = event.target?.closest?.("a[data-href]");
    if (!a) return;
    event.preventDefault();
    const href = a.getAttribute("data-href");
    if (/^(?:https?|mailto):/i.test(href)) {
      this.#reply({ type: "external-link", id: this.#id, href });
      return;
    }
    const top = this.#stack[this.#stack.length - 1];
    const { where, note } = await this.#noteFor(a, top.where.index, a.hasAttribute("data-noteref") ? "semantic" : "maybe");
    if (note) {
      this.#stack.push({ ...note, where, index: top.where.index, kind: "semantic" });
      this.#render();
      return;
    }
    this.close();
    if (where) {
      await this.#view.goTo(where.href);
      this.#backChip.classList.add("show");
    }
  }

  /** The reader turned a page: the Back to text control is only for the jump it came from. */
  hideBack() {
    this.#backChip.classList.remove("show");
  }
}
