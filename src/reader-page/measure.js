export const TABLE_CSS = [
  ".quire-table-scroll {",
  "  display: block;",
  "  overflow-x: auto;",
  "  overflow-y: hidden;",
  "  max-width: 100%;",
  "  -webkit-overflow-scrolling: touch;",
  "}",
  ".quire-table-scroll table {",
  "  max-width: none !important;",
  "}",
].join("\n");

export function liveDoc(view) {
  return view.renderer?.getContents?.()?.[0]?.doc ?? null;
}

/**
 * A table wider than the page scrolls sideways inside its own box.
 * The box is never wider than one column. foliate sizes a paginated section
 * from the rects of everything in it, clipped or not, so a 4000 px table
 * still added a run of blank pages. The table is therefore moved into a
 * shadow root on its wrapper, where that measurement does not reach, with
 * a copy of the book's own rules so it keeps its look.
 */
export function wrapWideTables(doc, view) {
  if (!doc?.querySelectorAll) return;
  let wrapped = 0;
  for (const table of doc.querySelectorAll("table")) {
    if (table.closest(".quire-table-scroll")) continue;
    const wrap = doc.createElement("div");
    wrap.className = "quire-table-scroll";
    wrap.style.cssText = "display:block;overflow-x:auto;overflow-y:hidden;max-width:100%;box-sizing:border-box";
    table.replaceWith(wrap);
    wrap.append(table);
    wrapped += 1;
  }
  if (!wrapped || !view?.renderer) return;
  // The section is laid out after this load event. Measure then, and lay out again if a table moved.
  const win = doc.defaultView;
  win?.requestAnimationFrame(() =>
    win.requestAnimationFrame(() => {
      if (shadowWideTables(doc)) view.renderer.render?.();
    }),
  );
}

function shadowWideTables(doc) {
  let rules = null;
  let moved = 0;
  for (const wrap of doc.querySelectorAll(".quire-table-scroll")) {
    const table = wrap.firstElementChild;
    if (!table || wrap.shadowRoot || typeof wrap.attachShadow !== "function") continue;
    if (table.scrollWidth <= wrap.clientWidth + 1) continue;
    rules ??= bookRules(doc);
    const root = wrap.attachShadow({ mode: "open" });
    const style = doc.createElement("style");
    style.textContent = `${rules}\n:host { display: block; overflow-x: auto; overflow-y: hidden; max-width: 100%; }`;
    root.append(style, table);
    moved += 1;
  }
  return moved;
}

function bookRules(doc) {
  const out = [];
  for (const sheet of Array.from(doc.styleSheets ?? [])) {
    try {
      for (const rule of Array.from(sheet.cssRules ?? [])) out.push(rule.cssText);
    } catch {
      // A sheet that cannot be read keeps its rules to itself.
    }
  }
  return out.join("\n");
}

export function waitFor(predicate, timeoutMs) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      let done = false;
      try {
        done = Boolean(predicate());
      } catch (error) {
        reject(error);
        return;
      }
      if (done) resolve();
      else if (performance.now() - started > timeoutMs) reject(new Error("timed out"));
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

export async function chapterFacts(view) {
  const doc = liveDoc(view);
  const img = doc?.querySelector("img") ?? null;
  if (img && !img.complete) {
    await new Promise((resolve) => {
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
    });
  }
  const text = (doc?.body?.innerText ?? "").replace(/\s+/g, " ").trim();
  return {
    text: text.slice(0, 180),
    imageCount: doc?.querySelectorAll("img").length ?? 0,
    imageWidth: img ? img.naturalWidth : null,
    scriptRan: doc?.documentElement?.getAttribute("data-script-ran") === "yes",
    scriptFlag: doc?.documentElement?.getAttribute("data-script-ran") ?? null,
  };
}

export async function tableFacts(view) {
  await view.renderer.goTo({ index: 1, anchor: () => 0 });
  await waitFor(() => liveDoc(view)?.querySelector(".quire-table-scroll"), 15000);
  const doc = liveDoc(view);
  const wrap = doc.querySelector(".quire-table-scroll");
  const table = wrap.querySelector("table");
  const before = wrap.scrollLeft;
  wrap.scrollLeft = 80;
  return {
    clientWidth: Math.round(wrap.clientWidth),
    scrollWidth: Math.round(wrap.scrollWidth),
    tableWidth: Math.round(table.getBoundingClientRect().width),
    scrollLeft: wrap.scrollLeft,
    scrolls: wrap.scrollLeft > before,
    pageWidth: Math.round(view.renderer?.size ?? 0),
  };
}

export async function timeTurns(view, count) {
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    const before = view.lastLocation?.cfi ?? null;
    let relocateMs = null;
    const started = performance.now();
    const onRelocate = () => {
      const cfi = view.lastLocation?.cfi;
      if (relocateMs == null && cfi && cfi !== before) {
        relocateMs = Math.round(performance.now() - started);
      }
    };
    view.addEventListener("relocate", onRelocate);
    try {
      await view.next();
      samples.push({
        wallMs: Math.round(performance.now() - started),
        relocateMs,
        section: view.lastLocation?.section?.current ?? null,
      });
    } catch (error) {
      samples.push({
        wallMs: Math.round(performance.now() - started),
        relocateMs,
        error: String(error),
      });
      view.removeEventListener("relocate", onRelocate);
      break;
    }
    view.removeEventListener("relocate", onRelocate);
  }
  return samples;
}
