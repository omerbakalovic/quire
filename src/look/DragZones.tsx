import { type ComponentRef, type ReactNode, useMemo, useRef, useState } from "react";
import { type GestureResponderEvent, type LayoutChangeEvent, PanResponder, StyleSheet, Text, View } from "react-native";

import { useChrome } from "@/reader/chrome";

type Rect = { x: number; y: number; w: number; h: number };

type Drag = {
  element: string;
  /** The finger, in the zones box. */
  x: number;
  y: number;
  zone: number;
  /** Where it would land, counting the zone's items without it. */
  index: number;
  full: boolean;
  outside: boolean;
};

export type DragApi = {
  /** Spread on a zone's View. */
  zoneProps: (zone: number) => { onLayout: (event: LayoutChangeEvent) => void };
  /** The zone's look while a drag is over it, or null. */
  zoneStyle: (zone: number) => object | null;
  /** Spread on an item's chip: long press picks it up. */
  chipProps: (element: string, zone: number) => object;
  /** Spread on the zone's last chip (+), which marks where the zone's items end. */
  endProps: (zone: number) => { onLayout: (event: LayoutChangeEvent) => void };
  dragging: string | null;
};

type Props = {
  /** Each zone's items, start to end. */
  zones: readonly (readonly string[])[];
  full: (element: string, zone: number) => boolean;
  onDrop: (element: string, zone: number, index: number) => void;
  /** True while an item is held, so the list around stops scrolling. */
  onActive: (active: boolean) => void;
  label: (element: string) => string;
  style?: object;
  children: (api: DragApi) => ReactNode;
};

/** How far past the box a finger may go before letting go cancels the drop. */
const SLACK_X = 24;
const SLACK_Y = 48;

/**
 * Drag to reorder within one region (docs/customization-roadmap.md, C5b). A
 * long press on an item picks it up; moving the finger shows where it would
 * land in the region's start, centre and end zones (red when that zone is
 * full); letting go there drops it, and letting go outside the region puts it
 * back. A drag never leaves its region: ▲ ▼ do that. Scrolling first never
 * starts a drag, since the scroll takes the touch before the long press. Every
 * drop can also be made with ◀ ▶ and the accessibility actions.
 */
export function DragZones({ zones, full, onDrop, onActive, label, style, children }: Props) {
  const c = useChrome();
  const box = useRef<ComponentRef<typeof View>>(null);
  const origin = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const zoneRects = useRef<Rect[]>([]);
  const chipRects = useRef(new Map<string, Rect>());
  const ends = useRef<Rect[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const live = useRef<Drag | null>(null);
  const granted = useRef(false);
  const props = useRef({ zones, full, onDrop, onActive });
  props.current = { zones, full, onDrop, onActive };

  const show = (next: Drag | null) => {
    live.current = next;
    setDrag(next);
  };

  /** The zone and slot under a point in the box. */
  const target = (element: string, x: number, y: number): Drag => {
    const rects = zoneRects.current;
    let zone = rects.findIndex((r) => r && x >= r.x && x < r.x + r.w);
    if (zone < 0) zone = x < (rects[0]?.x ?? 0) ? 0 : Math.max(0, rects.length - 1);
    const inZone = y - (rects[zone]?.y ?? 0);
    const others = (props.current.zones[zone] ?? []).filter((e) => e !== element);
    let index = 0;
    for (const other of others) {
      const r = chipRects.current.get(other);
      if (r && r.y + r.h / 2 < inZone) index++;
    }
    const { w, h } = origin.current;
    const outside = x < -SLACK_X || x > w + SLACK_X || y < -SLACK_Y || y > h + SLACK_Y;
    return { element, x, y, zone, index, full: props.current.full(element, zone), outside };
  };

  const finish = (drop: boolean) => {
    const now = live.current;
    granted.current = false;
    show(null);
    props.current.onActive(false);
    if (drop && now && !now.outside && !now.full) props.current.onDrop(now.element, now.zone, now.index);
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Only once an item is held: until then, touches belong to the chips and the scroll.
        onMoveShouldSetPanResponderCapture: () => live.current !== null,
        onPanResponderGrant: () => {
          granted.current = true;
        },
        onPanResponderMove: (_event, gesture) => {
          const now = live.current;
          if (!now) return;
          show(target(now.element, gesture.moveX - origin.current.x, gesture.moveY - origin.current.y));
        },
        onPanResponderRelease: () => finish(true),
        onPanResponderTerminate: () => finish(false),
        onPanResponderTerminationRequest: () => false,
      }),
    // Made once: the handlers read the latest values through refs.
    [],
  );

  const pickUp = (element: string, zone: number, event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;
    // Nothing is drawn for the drag until the box is measured again.
    origin.current = { x: 0, y: 0, w: 0, h: 0 };
    box.current?.measure((_x, _y, w, h, px, py) => {
      origin.current = { x: px, y: py, w, h };
      show(target(element, pageX - px, pageY - py));
    });
    // Held at once (dimmed in place), before the box is measured.
    show({ element, x: 0, y: 0, zone, index: 0, full: false, outside: false });
    props.current.onActive(true);
  };

  const api: DragApi = {
    zoneProps: (zone) => ({
      onLayout: (event) => {
        const { x, y, width, height } = event.nativeEvent.layout;
        zoneRects.current[zone] = { x, y, w: width, h: height };
      },
    }),
    zoneStyle: (zone) =>
      drag && !drag.outside && drag.zone === zone ? { borderStyle: "solid", borderWidth: 2, borderColor: drag.full ? c.danger : c.accent } : null,
    chipProps: (element, zone) => ({
      delayLongPress: 350,
      onLongPress: (event: GestureResponderEvent) => pickUp(element, zone, event),
      // Let go without moving: nothing took the touch over, so the item goes back.
      onPressOut: () =>
        setTimeout(() => {
          if (live.current?.element === element && !granted.current) finish(false);
        }, 0),
      onLayout: (event: LayoutChangeEvent) => {
        const { x, y, width, height } = event.nativeEvent.layout;
        chipRects.current.set(element, { x, y, w: width, h: height });
      },
      style: drag?.element === element ? styles.held : undefined,
    }),
    endProps: (zone) => ({
      onLayout: (event) => {
        const { x, y, width, height } = event.nativeEvent.layout;
        ends.current[zone] = { x, y, w: width, h: height };
      },
    }),
    dragging: drag?.element ?? null,
  };

  // The line where the item would land: above the item it would go before, or above the zone's +.
  let line: Rect | null = null;
  if (drag && !drag.outside && !drag.full && origin.current.w > 0) {
    const zone = zoneRects.current[drag.zone];
    const others = (zones[drag.zone] ?? []).filter((e) => e !== drag.element);
    const before = drag.index < others.length ? chipRects.current.get(others[drag.index]) : ends.current[drag.zone];
    if (zone && before) line = { x: zone.x + 4, y: zone.y + before.y - 3, w: zone.w - 8, h: 3 };
  }

  return (
    <View ref={box} style={style} {...responder.panHandlers}>
      {children(api)}
      {line ? <View pointerEvents="none" style={[styles.line, { left: line.x, top: line.y, width: line.w, backgroundColor: c.accent }]} /> : null}
      {/* Kept inside the box: the list clips anything past it, and the label is what tells you a drag is on (emulator run 38). */}
      {drag && origin.current.w > 0 ? (
        <View
          pointerEvents="none"
          style={[styles.ghost, { left: Math.max(0, Math.min(origin.current.w - 120, drag.x - 60)), top: Math.max(0, Math.min(origin.current.h - 36, drag.y - 52)), backgroundColor: c.accent, opacity: drag.outside ? 0.5 : 1 }]}
        >
          <Text style={[styles.ghostText, { color: c.onAccent }]} numberOfLines={1}>
            {label(drag.element)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  held: { opacity: 0.35 },
  line: { position: "absolute", height: 3, borderRadius: 2 },
  ghost: { position: "absolute", width: 120, minHeight: 36, borderRadius: 18, paddingHorizontal: 10, justifyContent: "center", elevation: 6 },
  ghostText: { fontSize: 13, fontWeight: "600" },
});
