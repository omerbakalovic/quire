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

export function wrapWideTables(doc, view) {
  if (!doc?.querySelectorAll) return;
  const pageWidth = Math.floor(view?.renderer?.size ?? 0);
  for (const table of doc.querySelectorAll("table")) {
    if (table.parentElement?.classList?.contains("quire-table-scroll")) continue;
    const wrap = doc.createElement("div");
    wrap.className = "quire-table-scroll";
    if (pageWidth > 0) {
      wrap.style.width = `${pageWidth}px`;
      wrap.style.maxWidth = `${pageWidth}px`;
    }
    table.replaceWith(wrap);
    wrap.append(table);
  }
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
