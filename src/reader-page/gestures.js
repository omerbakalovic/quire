/**
 * Gestures on the page (docs/customization.md, 3.5). The host sends which
 * action each gesture runs; the page turns pages itself, so a turn costs no
 * round trip, and hands every other action to the host.
 */
export const ACTIONS = ["none", "prevPage", "nextPage", "bars", "contents", "look", "prevChapter", "nextChapter", "flow", "back"];
export const PAGE_ACTIONS = ["prevPage", "nextPage"];

export const DEFAULT_GESTURES = {
  tapLeft: "prevPage",
  tapCenter: "bars",
  tapRight: "nextPage",
  swipeUp: "none",
  swipeDown: "none",
  twoFingerTap: "none",
};

/** The gesture map from a settings message, with every unknown or missing entry at its default. */
export function cleanGestures(raw) {
  const out = { ...DEFAULT_GESTURES };
  if (!raw || typeof raw !== "object") return out;
  for (const key of Object.keys(DEFAULT_GESTURES)) {
    if (ACTIONS.includes(raw[key])) out[key] = raw[key];
  }
  return out;
}

// A touch that moves less than this is a tap, not a swipe.
export const TAP_SLOP_PX = 10;
// A vertical swipe travels at least this far, mostly up or down, within the time limit.
const SWIPE_PX = 60;
const SWIPE_MS = 700;
const TWO_FINGER_MS = 350;

/**
 * What one finished touch was. `start` and `end` are { x, y, t } of the first
 * finger; `fingers` is the most fingers down at once. Returns "swipeUp",
 * "swipeDown", "twoFingerTap", or null (a tap or a horizontal swipe, which
 * foliate and the click handler already take).
 */
export function classifyTouch(start, end, fingers) {
  if (!start || !end) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const ms = end.t - start.t;
  if (fingers >= 2) {
    return fingers === 2 && ms <= TWO_FINGER_MS && Math.abs(dx) < TAP_SLOP_PX * 2 && Math.abs(dy) < TAP_SLOP_PX * 2 ? "twoFingerTap" : null;
  }
  if (ms > SWIPE_MS || Math.abs(dy) < SWIPE_PX || Math.abs(dy) < 2 * Math.abs(dx)) return null;
  return dy < 0 ? "swipeUp" : "swipeDown";
}

/** The gesture name for a tap zone. */
export function tapGesture(zone) {
  return zone === "left" ? "tapLeft" : zone === "right" ? "tapRight" : "tapCenter";
}
