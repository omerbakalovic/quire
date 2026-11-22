/** Left and right thirds turn the page, in reading direction (view.goLeft and view.goRight handle RTL). The middle third shows or hides the controls. */
export const SIDE_ZONE = 0.3;

export function tapZone(x, width) {
  if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) return "center";
  const ratio = x / width;
  if (ratio < SIDE_ZONE) return "left";
  if (ratio > 1 - SIDE_ZONE) return "right";
  return "center";
}
