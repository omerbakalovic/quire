import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

import { BUILT_IN_PACKS, ease, packFor, shaderSource, uniformsFor } from "./packs.ts";
import { TURN_STYLES } from "../settings/registry.ts";

// CanvasKit is Skia built for the web, the same SkSL compiler the app uses. It comes with react-native-skia.
const require = createRequire(import.meta.url);
type Kit = {
  RuntimeEffect: { Make(source: string, onError?: (error: string) => void): { delete(): void; getUniformCount(): number } | null };
  MakeSurface(w: number, h: number): unknown;
};
let kit: Kit | null = null;
try {
  const init = require("canvaskit-wasm/bin/full/canvaskit.js") as (options: object) => Promise<Kit>;
  kit = await init({ locateFile: (file: string) => require.resolve(`canvaskit-wasm/bin/full/${file}`) });
} catch {
  kit = null;
}

test("every built-in pack compiles as SkSL", { skip: kit ? false : "canvaskit-wasm not available" }, () => {
  for (const pack of BUILT_IN_PACKS) {
    let message = "";
    const effect = kit!.RuntimeEffect.Make(shaderSource(pack), (error) => (message = error));
    assert.ok(effect, `${pack.id}: ${message}`);
    effect!.delete();
  }
  assert.equal(kit!.RuntimeEffect.Make("half4 main(float2 xy) { return nope; }", () => undefined), null);
});

test("every animated turn style has a pack", () => {
  for (const style of TURN_STYLES) {
    if (style !== "none") assert.ok(packFor(style), style);
  }
  assert.equal(packFor("burn-everything"), null);
});

test("uniforms take the frame and clamp parameters to their range", () => {
  const slide = packFor("slide")!;
  assert.deepEqual(uniformsFor(slide, { progress: 0.5, direction: -1, width: 400, height: 800 }, { shadow: 9 }), {
    progress: 0.5,
    direction: -1,
    size: [400, 800],
    shadow: 1,
  });
  assert.equal(uniformsFor(slide, { progress: 0, direction: 1, width: 1, height: 1 }).shadow, 0.4);
});

test("easing runs from 0 to 1", () => {
  for (const easing of ["linear", "easeOut", "easeInOut"] as const) {
    assert.equal(ease(easing, 0), 0);
    assert.equal(ease(easing, 1), 1);
    assert.equal(ease(easing, 2), 1);
  }
  assert.ok(ease("easeOut", 0.5) > 0.5);
  assert.equal(ease("easeInOut", 0.5), 0.5);
});

/** Draw a pack at one progress over a 100×10 "page" that is red on the left half and blue on the right; return the colour at x. */
function sample(packId: string, progress: number, direction: 1 | -1, xs: number[]): number[][] {
  const k = kit as unknown as Record<string, any>;
  const pack = packFor(packId)!;
  const effect = k.RuntimeEffect.Make(shaderSource(pack));
  const red = k.Color(255, 0, 0, 1);
  const blue = k.Color(0, 0, 255, 1);
  const pageShader = k.Shader.MakeLinearGradient([0, 0], [100, 0], [red, red, blue, blue], [0, 0.5, 0.5, 1], k.TileMode.Clamp);
  const u = uniformsFor(pack, { progress, direction, width: 100, height: 10 });
  const flat = [u.progress, u.direction, ...(u.size as number[]), ...pack.params.map((p) => u[p.key] as number)];
  const shader = effect.makeShaderWithChildren(flat, [pageShader]);
  const surface = k.MakeSurface(100, 10);
  const canvas = surface.getCanvas();
  canvas.clear(k.TRANSPARENT);
  const paint = new k.Paint();
  paint.setShader(shader);
  canvas.drawRect(k.LTRBRect(0, 0, 100, 10), paint);
  const out = xs.map((x) => Array.from(canvas.readPixels(x, 5, { width: 1, height: 1, colorType: k.ColorType.RGBA_8888, alphaType: k.AlphaType.Unpremul, colorSpace: k.ColorSpace.SRGB }) as Uint8Array));
  surface.delete();
  return out;
}

test("slide moves the old page off toward the side it turns from; fade thins it", { skip: kit ? false : "canvaskit-wasm not available" }, () => {
  // At 0 the overlay is the page itself.
  assert.deepEqual(sample("slide", 0, 1, [10, 90]), [[255, 0, 0, 255], [0, 0, 255, 255]]);
  // Forward, halfway: the old page's right half has moved to the left half of the screen.
  const [left, right] = sample("slide", 0.5, 1, [10, 95]);
  assert.deepEqual(left, [0, 0, 255, 255]);
  assert.ok(right[3] < 40, "the new page shows through on the right");
  // Back, halfway: the old page's left half has moved right.
  assert.deepEqual(sample("slide", 0.5, -1, [90])[0], [255, 0, 0, 255]);
  const [faded] = sample("fade", 0.75, 1, [10]);
  assert.ok(faded[3] > 50 && faded[3] < 80, `alpha ${faded[3]}`);
});
