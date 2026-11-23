/**
 * Uncaught errors on the reader page, counted so a debug run can check that a
 * step raised none. In Milestone 1a, opening notes through foliate's own
 * footnote views raised 67 `doc is null` errors (see PROGRESS.md); this is how
 * the phone matrix proves the popup does not.
 */
const MAX_SAMPLES = 10;
let count = 0;
let samples = [];

export function recordPageError(message) {
  count += 1;
  if (samples.length < MAX_SAMPLES) samples.push(String(message ?? "unknown error").slice(0, 300));
}

export function installPageErrors(target = globalThis) {
  target.addEventListener?.("error", (event) => recordPageError(event?.message ?? event?.error));
  target.addEventListener?.("unhandledrejection", (event) =>
    recordPageError(event?.reason?.message ?? event?.reason),
  );
}

/** The errors since the last reset. `reset` starts a new count after reading. */
export function pageErrors({ reset = false } = {}) {
  const out = { count, samples: [...samples] };
  if (reset) {
    count = 0;
    samples = [];
  }
  return out;
}
