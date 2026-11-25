import { Canvas, Fill, ImageShader, makeImageFromView, Shader, Skia, type SkImage } from "@shopify/react-native-skia";
import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
import { StyleSheet, View } from "react-native";
import { Easing, useDerivedValue, useFrameCallback, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { ease, packFor, shaderSource, type TurnPack } from "@/turns/packs";

/**
 * The page-turn overlay (docs/customization.md, 5.3). While the reader is
 * idle it keeps a picture of the page. When a turn is asked for, it shows that
 * picture over the WebView, the page turns underneath, and a turn pack's
 * shader draws the old page away from progress 0 to 1. Wherever the shader
 * leaves transparency, the real new page shows through.
 */
export type TurnOverlayHandle = {
  /** Take a picture of the page now. Resolves with how long it took, or null when it failed. */
  capture(): Promise<number | null>;
  /** Forget the picture: the page changed some other way. */
  invalidate(): void;
  /** Show the picture at progress 0. Resolves true once it is on screen, false when there is no picture. */
  show(direction: 1 | -1): Promise<boolean>;
  /** Animate the picture away. */
  play(): void;
  /** Stop at once and hide, for a tap during an animation. */
  finish(): void;
  busy(): boolean;
};

type Props = {
  /** The view to picture: the WebView and the header and footer lines, not the controls. */
  target: RefObject<ComponentRef<typeof View> | null>;
  style: string;
  durationMs: number;
  width: number;
  height: number;
  onFrameTimes?: (report: { style: string; frames: number; ms: number; longestFrameMs: number }) => void;
  /** The overlay went away; the page can be pictured again. */
  onIdle?: () => void;
};

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export const TurnOverlay = forwardRef<TurnOverlayHandle, Props>(function TurnOverlay({ target, style, durationMs, width, height, onFrameTimes, onIdle }, ref) {
  const pack: TurnPack | null = packFor(style);
  const effect = useMemo(() => (pack ? Skia.RuntimeEffect.Make(shaderSource(pack)) : null), [pack]);
  const snapshot = useRef<SkImage | null>(null);
  const [shown, setShown] = useState<SkImage | null>(null);
  const animating = useRef(false);
  const started = useRef(0);
  const t = useSharedValue(0);
  const direction = useSharedValue(1);
  const frames = useSharedValue(0);
  const longest = useSharedValue(0);
  const easing = pack?.easing ?? "linear";
  const params = useMemo(() => Object.fromEntries((pack?.params ?? []).map((p) => [p.key, p.default])), [pack]);

  const uniforms = useDerivedValue(
    () => ({ progress: ease(easing, t.value), direction: direction.value, size: [width, height], ...params }),
    [easing, width, height, params],
  );
  // Frame times for the spike's measurements, counted only while an animation runs.
  const meter = useFrameCallback((frame) => {
    frames.value += 1;
    const gap = frame.timeSincePreviousFrame ?? 0;
    if (frames.value > 1 && gap > longest.value) longest.value = gap;
  }, false);

  const hide = () => {
    animating.current = false;
    meter.setActive(false);
    setShown(null);
    // The picture was of the old page; the next one is taken once the new page settles.
    snapshot.current?.dispose();
    snapshot.current = null;
  };

  const done = () => {
    if (!animating.current) return;
    onFrameTimes?.({ style, frames: frames.value, ms: Math.round(performance.now() - started.current), longestFrameMs: Math.round(longest.value) });
    hide();
    onIdle?.();
  };

  useImperativeHandle(ref, () => ({
    async capture() {
      if (!pack || animating.current || shown) return null;
      const at = performance.now();
      try {
        // Skia's types predate React Native's element refs; the call takes the host view either way.
        const image = await makeImageFromView(target as unknown as RefObject<number | null>);
        if (!image) return null;
        snapshot.current?.dispose();
        snapshot.current = image;
        return Math.round(performance.now() - at);
      } catch (error) {
        console.warn("turn capture", error);
        return null;
      }
    },
    invalidate() {
      if (animating.current) return;
      snapshot.current?.dispose();
      snapshot.current = null;
    },
    async show(dir) {
      const image = snapshot.current;
      if (!pack || !effect || !image || animating.current) return false;
      animating.current = true;
      t.value = 0;
      frames.value = 0;
      longest.value = 0;
      direction.value = dir;
      setShown(image);
      // Two frames: React commits the canvas, then Skia draws it.
      await nextFrame();
      await nextFrame();
      return true;
    },
    play() {
      if (!animating.current) return;
      started.current = performance.now();
      meter.setActive(true);
      t.value = withTiming(1, { duration: durationMs, easing: Easing.linear }, (finished) => {
        if (finished) scheduleOnRN(done);
      });
    },
    finish() {
      if (!animating.current) return;
      t.value = 1;
      hide();
      onIdle?.();
    },
    busy: () => animating.current,
  }));

  if (!pack || !effect || !shown) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={StyleSheet.absoluteFill}>
        <Fill>
          <Shader source={effect} uniforms={uniforms}>
            <ImageShader image={shown} fit="fill" rect={{ x: 0, y: 0, width, height }} />
          </Shader>
        </Fill>
      </Canvas>
    </View>
  );
});
