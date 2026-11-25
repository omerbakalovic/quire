import type { Resolved } from "./registry.ts";

/** Gesture keys as the page knows them (src/reader-page/gestures.js). */
export const GESTURE_KEYS = {
  tapLeft: "gesture.tapLeft",
  tapCenter: "gesture.tapCenter",
  tapRight: "gesture.tapRight",
  swipeUp: "gesture.swipeUp",
  swipeDown: "gesture.swipeDown",
  twoFingerTap: "gesture.twoFingerTap",
} as const;

export type GestureMap = { -readonly [K in keyof typeof GESTURE_KEYS]: string };

/** The gesture map the page gets with its settings. */
export function gestureMap(settings: Resolved): GestureMap {
  const out: Partial<GestureMap> = {};
  for (const name of Object.keys(GESTURE_KEYS) as (keyof GestureMap)[]) out[name] = settings[GESTURE_KEYS[name]];
  return out as GestureMap;
}

/**
 * True when no gesture brings up the bars, so Contents, Aa and the slider are
 * out of reach in the book. The Reading look screen warns.
 */
export function barsUnreachable(settings: Resolved): boolean {
  return !Object.values(gestureMap(settings)).includes("bars");
}
