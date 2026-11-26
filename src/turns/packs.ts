/**
 * Turn packs (docs/customization.md, 5.4): a page-turn style is a manifest and
 * one SkSL function that draws the old page over the new one for a progress
 * from 0 to 1. The built-ins use the same format as an imported pack would, so
 * nothing about them is special. Kept free of React so it can be tested.
 */
export type TurnParam = { key: string; type: "number"; min: number; max: number; step: number; default: number };

export type TurnPack = {
  id: string;
  name: string;
  author: string;
  licence: string;
  format: 1;
  /** True when a drag can drive progress (curl, flip). Not used yet. */
  drag: boolean;
  /** True when the shader also needs the new page as an image. Not used yet. */
  needsNewPage: boolean;
  easing: "linear" | "easeOut" | "easeInOut";
  params: TurnParam[];
  sksl: string;
};

/**
 * Every pack gets these uniforms, in this order, then its own parameters:
 * the old page as `page`, `progress` (0 to 1, eased), `direction` (1 forward,
 * -1 back, already mirrored for right-to-left books), and the canvas `size`.
 */
export const COMMON_UNIFORMS = `uniform shader page;
uniform float progress;
uniform float direction;
uniform float2 size;
`;

/** The old page fades out over the new one. */
const FADE: TurnPack = {
  id: "fade",
  name: "Fade",
  author: "Quire",
  licence: "MIT",
  format: 1,
  drag: false,
  needsNewPage: false,
  easing: "easeOut",
  params: [],
  sksl: `half4 main(float2 xy) {
  return page.eval(xy) * half(1.0 - progress);
}`,
};

/**
 * The old page slides off toward the side it is turned from, with a soft
 * shadow on the new page along its edge.
 */
const SLIDE: TurnPack = {
  id: "slide",
  name: "Slide",
  author: "Quire",
  licence: "MIT",
  format: 1,
  drag: false,
  needsNewPage: false,
  easing: "easeInOut",
  params: [{ key: "shadow", type: "number", min: 0, max: 1, step: 0.1, default: 0.4 }],
  sksl: `uniform float shadow;

half4 main(float2 xy) {
  // Forward, the old page leaves to the left; back, to the right.
  float shift = progress * size.x * direction;
  float2 from = float2(xy.x + shift, xy.y);
  if (from.x >= 0.0 && from.x <= size.x) return page.eval(from);
  // Just past the old page's edge, a shadow falls on the new page.
  float edge = direction > 0.0 ? size.x - shift : -shift;
  float gap = abs(xy.x - edge);
  float strength = shadow * (1.0 - progress) * clamp(1.0 - gap / 28.0, 0.0, 1.0);
  return half4(0.0, 0.0, 0.0, half(strength * 0.5));
}`,
};

export const BUILT_IN_PACKS: readonly TurnPack[] = [FADE, SLIDE];

export function packFor(id: string): TurnPack | null {
  return BUILT_IN_PACKS.find((pack) => pack.id === id) ?? null;
}

/** The whole shader source for a pack: the common uniforms, then the pack's own code. */
export function shaderSource(pack: TurnPack): string {
  return `${COMMON_UNIFORMS}\n${pack.sksl}\n`;
}

/** Progress after easing, for a time fraction t from 0 to 1. */
export function ease(easing: TurnPack["easing"], t: number): number {
  "worklet";
  const x = Math.min(1, Math.max(0, t));
  if (easing === "linear") return x;
  if (easing === "easeOut") return 1 - (1 - x) * (1 - x);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

/** The uniforms a pack's shader gets for one frame. Parameters missing from `values` take their defaults. */
export function uniformsFor(pack: TurnPack, frame: { progress: number; direction: 1 | -1; width: number; height: number }, values: Record<string, number> = {}) {
  const out: Record<string, number | number[]> = {
    progress: frame.progress,
    direction: frame.direction,
    size: [frame.width, frame.height],
  };
  for (const param of pack.params) {
    const value = values[param.key];
    out[param.key] = typeof value === "number" && Number.isFinite(value) ? Math.min(param.max, Math.max(param.min, value)) : param.default;
  }
  return out;
}
