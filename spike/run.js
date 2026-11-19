const params = new URLSearchParams(location.search);
window.__errors = [];
window.addEventListener("error", (event) => {
  window.__errors.push(String(event.message));
});
const reportError = console.error;
console.error = (...args) => {
  window.__errors.push(args.map((item) => String(item?.stack || item)).join(" "));
  reportError.apply(console, args);
};
window.addEventListener("unhandledrejection", (event) => {
  window.__errors.push(String(event.reason));
});

try {
  const engine = params.get("engine");
  const mod = engine === "foliate"
    ? await import("./engines/foliate.js")
    : await import("./engines/epubjs.js");
  window.__result = await mod.run(params);
  window.__result.errorCount = window.__errors.length;
  window.__result.errors = window.__errors.slice(0, 8);
} catch (error) {
  window.__result = {
    ok: false,
    error: String(error),
    stack: error?.stack ?? null,
    errorCount: window.__errors.length,
    errors: window.__errors.slice(0, 8),
  };
}
