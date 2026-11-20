import { BOOK_CSP, ensureBookCsp, hasBookCsp } from "../renderer/book-csp.ts";

let parserInstalled = false;

/** Book HTML is parsed before it is placed in the iframe. XML container files are left alone. */
export function installBookCspParser() {
  if (parserInstalled) return;
  parserInstalled = true;
  const original = DOMParser.prototype.parseFromString;
  DOMParser.prototype.parseFromString = function (markup, type) {
    const doc = original.call(this, markup, type);
    const root = doc.documentElement;
    if (!root || root.localName !== "html") return doc;
    if (cspMeta(doc)) return doc;
    const meta = doc.createElement("meta");
    meta.setAttribute("http-equiv", "Content-Security-Policy");
    meta.setAttribute("content", BOOK_CSP);
    let head = doc.querySelector("head");
    if (!head) {
      head = doc.createElement("head");
      root.insertBefore(head, root.firstChild);
    }
    head.insertBefore(meta, head.firstChild);
    return doc;
  };
}

/**
 * A meta CSP is ignored in an application/xhtml+xml document.
 * The bridge rewrites book HTML to text/html so the policy is enforced,
 * and it refuses external script resources. Script tags stay in the file:
 * the policy is what has to stop them.
 */
export function attachBookSecurity(book) {
  const target = book?.transformTarget;
  if (!target) throw new Error("book has no transform target");
  target.addEventListener("load", (event) => {
    if (event.detail?.isScript) event.detail.allow = false;
  });
  target.addEventListener("data", (event) => {
    const type = event.detail?.type;
    if (type !== "application/xhtml+xml" && type !== "text/html") return;
    event.detail.type = "text/html";
    event.detail.data = Promise.resolve(event.detail.data).then(async (html) => {
      if (typeof html !== "string") return html;
      return inlineStylesheets(ensureBookCsp(html));
    });
  });
}

export function cspOf(doc) {
  const meta = cspMeta(doc);
  return meta ? meta.getAttribute("content") : null;
}

/** A blob stylesheet link is blocked by the book policy. Inline CSS is already allowed. */
async function inlineStylesheets(html) {
  const tags = html.match(/<link\b[^>]*>/gi) ?? [];
  let next = html;
  for (const tag of tags) {
    if (!/\brel\s*=\s*["']stylesheet["']/i.test(tag)) continue;
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!href?.[1].startsWith("blob:")) continue;
    const css = await (await fetch(href[1])).text();
    const safe = css.replace(/<\/style/gi, "<\\/style");
    next = next.replace(tag, `<style>${safe}</style>`);
  }
  return next;
}

function cspMeta(doc) {
  if (!doc?.querySelectorAll) return null;
  for (const meta of doc.querySelectorAll("meta")) {
    const equiv = meta.getAttribute("http-equiv") || meta.httpEquiv || "";
    if (equiv.toLowerCase() === "content-security-policy") return meta;
  }
  return null;
}

export { hasBookCsp };
