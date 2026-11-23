import { type ComponentRef, useMemo, useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";

import { chapterAt, chapterTicks, type NavEntry } from "@/domain/navigation";
import { clamp01 } from "@/domain/position";
import { t } from "@/i18n";
import { useChrome } from "./chrome";

type Props = {
  fraction: number | null;
  toc: NavEntry[];
  /** Called once, when the thumb is let go. The page then jumps and pushes the back stack. */
  onCommit: (fraction: number) => void;
  onScrub?: (active: boolean) => void;
};

const STEP = 0.01;

/**
 * The bottom progress slider: chapter tick marks, and a preview of the target
 * chapter and percentage while scrubbing. No dependency; a PanResponder over
 * a measured track.
 */
export function ProgressSlider({ fraction, toc, onCommit, onScrub }: Props) {
  const strings = t().book;
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const ticks = useMemo(() => chapterTicks(toc), [toc]);
  const c = useChrome();
  const geometry = useRef({ width: 0, pageX: 0 });
  const trackRef = useRef<ComponentRef<typeof View>>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const scrubRef = useRef(onScrub);
  scrubRef.current = onScrub;

  const at = (pageX: number) => {
    const { width: w, pageX: left } = geometry.current;
    return w > 0 ? clamp01((pageX - left) / w) : 0;
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          scrubRef.current?.(true);
          const pageX = event.nativeEvent.pageX;
          trackRef.current?.measure((_x, _y, w, _h, left) => {
            geometry.current = { width: w, pageX: left };
            setDrag(at(pageX));
          });
          setDrag(at(pageX));
        },
        onPanResponderMove: (event) => setDrag(at(event.nativeEvent.pageX)),
        onPanResponderRelease: (event) => {
          const value = at(event.nativeEvent.pageX);
          setDrag(null);
          scrubRef.current?.(false);
          commitRef.current(value);
        },
        onPanResponderTerminate: () => {
          setDrag(null);
          scrubRef.current?.(false);
        },
      }),
    [],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width;
    setWidth(w);
    trackRef.current?.measure((_x, _y, mw, _h, left) => {
      geometry.current = { width: mw || w, pageX: left };
    });
  };

  const shown = drag ?? fraction ?? 0;
  const percent = Math.round(shown * 100);
  const preview = drag === null ? null : chapterAt(toc, drag);

  return (
    <View style={styles.wrap}>
      {drag !== null ? (
        <View style={[styles.bubble, { left: Math.max(0, Math.min(width - 180, shown * width - 90)), backgroundColor: c.panel, borderColor: c.line }]} pointerEvents="none">
          {preview ? (
            <Text style={[styles.bubbleTitle, { color: c.ink }]} numberOfLines={1}>
              {preview}
            </Text>
          ) : null}
          <Text style={[styles.bubbleSub, { color: c.muted }]}>{`${percent}%`}</Text>
        </View>
      ) : null}
      <View
        ref={trackRef}
        style={styles.hit}
        onLayout={onLayout}
        {...responder.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={strings.progress}
        accessibilityValue={{ min: 0, max: 100, now: percent, text: strings.progressValue(percent) }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => {
          const base = fraction ?? 0;
          const next = event.nativeEvent.actionName === "increment" ? base + STEP : base - STEP;
          onCommit(clamp01(next));
        }}
      >
        <View style={[styles.track, { backgroundColor: c.track }]}>
          <View style={[styles.fill, { width: `${shown * 100}%`, backgroundColor: c.accent }]} />
        </View>
        {/* Ticks sit in their own layer: Android clips children to a rounded view, which hid all
            but a sliver of each tick inside the 4 px track (phone run 7b). They change colour
            where the fill passes them, so they show on both sides. */}
        <View style={styles.ticks} pointerEvents="none">
          {ticks.map((tick) => (
            <View key={tick} style={[styles.tick, { left: `${tick * 100}%` }, { backgroundColor: tick <= shown ? c.onAccent : c.muted }]} />
          ))}
        </View>
        <View style={[styles.thumb, { left: `${shown * 100}%`, backgroundColor: c.accent, borderColor: c.onAccent }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Wide enough to drag; in a crowded control row it wraps to its own line instead.
  wrap: { flex: 1, minWidth: 120, justifyContent: "center" },
  hit: { height: 44, justifyContent: "center" },
  track: { height: 4, borderRadius: 2, backgroundColor: "#555", overflow: "hidden" },
  ticks: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 2, backgroundColor: "#ddd" },
  tick: { position: "absolute", top: 16, width: 2, height: 12, marginLeft: -1, borderRadius: 1 },
  thumb: {
    position: "absolute",
    borderWidth: 2,
    width: 18,
    height: 18,
    marginLeft: -9,
    borderRadius: 9,
    backgroundColor: "#fff",
  },
  bubble: {
    borderWidth: StyleSheet.hairlineWidth,
    position: "absolute",
    bottom: 48,
    width: 180,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#2c2c2e",
    alignItems: "center",
  },
  bubbleTitle: { color: "#fff", fontSize: 14, fontWeight: "600" },
  bubbleSub: { color: "#bbb", fontSize: 12 },
});
