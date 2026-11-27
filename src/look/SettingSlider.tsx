import { type ComponentRef, useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, TextInput, View, type LayoutChangeEvent } from "react-native";

import { t } from "@/i18n";
import { useChrome } from "@/reader/chrome";
import { stepValue, UNSET } from "@/settings/customize";
import { isSideways, SLIDE_SLOP as SLOP } from "@/settings/look-editor";
import { cleanValue, settingFor, type SettingKey } from "@/settings/registry";

type Props = {
  settingKey: SettingKey;
  label: string;
  value: number;
  /** The value as shown, e.g. "115 %". */
  format: (value: number) => string;
  onChange: (value: number) => void;
  /** One row (label, value, − track +), for the editor's fixed top where height is scarce. */
  compact?: boolean;
};

/** While the thumb moves, changes go out at most this often; the last one goes out on release. */
const SEND_EVERY_MS = 120;

/**
 * A slider for one number setting (docs/customization-roadmap.md, C1): the
 * value shown above the track, − and + for one step, tap the value to type it,
 * and Android's adjustable role with increment and decrement for TalkBack.
 * Every value is cleaned by the registry, so it is always on a step and in range.
 */
export function SettingSlider({ settingKey, label, value, format, onChange, compact = false }: Props) {
  const strings = t().look;
  const c = useChrome();
  const setting = settingFor(settingKey);
  const range = setting && setting.type === "number" ? setting : null;
  const min = range?.min ?? 0;
  const max = range?.max ?? 1;
  const [drag, setDrag] = useState<number | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const geometry = useRef({ width: 0, pageX: 0 });
  const trackRef = useRef<ComponentRef<typeof View>>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const lastSent = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (pending.current) clearTimeout(pending.current);
  }, []);

  // Below a "not set" value's floor (line spacing under 1, say), the slider means "the book's own".
  const unset = UNSET[settingKey];
  const clean = (v: number) => {
    if (unset && v < unset.floor - 1e-9) return unset.value;
    const out = cleanValue(settingKey, v);
    return typeof out === "number" ? out : value;
  };
  const cleanRef = useRef(clean);
  cleanRef.current = clean;

  const at = (pageX: number) => {
    const { width, pageX: left } = geometry.current;
    const fraction = width > 0 ? Math.min(1, Math.max(0, (pageX - left) / width)) : 0;
    return cleanRef.current(min + fraction * (max - min));
  };

  const send = (v: number, now: boolean) => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
    const wait = SEND_EVERY_MS - (Date.now() - lastSent.current);
    if (now || wait <= 0) {
      lastSent.current = Date.now();
      changeRef.current(v);
    } else {
      pending.current = setTimeout(() => send(v, true), wait);
    }
  };

  // A touch only moves the value once it is clearly sideways, so a vertical scroll of the list that starts on
  // a slider scrolls instead (emulator run 19). A touch that barely moves is a tap: the value jumps there.
  const sliding = useRef(false);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, g) => isSideways(g.dx, g.dy),
        // Leave the list's native scroll free to take a vertical swipe that starts here (emulator run 20).
        onShouldBlockNativeResponder: () => false,
        // Until the thumb is sliding, a scroll of the editor may take the gesture.
        onPanResponderTerminationRequest: () => !sliding.current,
        onPanResponderGrant: () => {
          sliding.current = false;
          trackRef.current?.measure((_x, _y, w, _h, left) => {
            geometry.current = { width: w, pageX: left };
          });
        },
        onPanResponderMove: (event, g) => {
          if (!sliding.current) {
            if (!isSideways(g.dx, g.dy)) return;
            sliding.current = true;
          }
          const v = at(event.nativeEvent.pageX);
          setDrag(v);
          send(v, false);
        },
        onPanResponderRelease: (event, g) => {
          const tap = !sliding.current && Math.abs(g.dx) < SLOP && Math.abs(g.dy) < SLOP;
          if (sliding.current || tap) send(at(event.nativeEvent.pageX), true);
          sliding.current = false;
          setDrag(null);
        },
        onPanResponderTerminate: () => {
          sliding.current = false;
          setDrag(null);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [min, max],
  );

  const onLayout = (_event: LayoutChangeEvent) => {
    trackRef.current?.measure((_x, _y, w, _h, left) => {
      geometry.current = { width: w, pageX: left };
    });
  };

  const shown = drag ?? value;
  const fraction = max > min ? (shown - min) / (max - min) : 0;
  const nudge = (dir: 1 | -1) => {
    const next = stepValue(settingKey, value, dir);
    if (next !== null) onChange(next);
  };

  const finishTyping = () => {
    const parsed = Number.parseFloat((typing ?? "").replace(",", ".").replace(/[^0-9.\-]/g, ""));
    setTyping(null);
    if (!Number.isFinite(parsed)) return;
    // Fractions are shown and typed as percents (Dimmer 30 %), so a typed 30 means 0.3 and 1 means 1 %.
    onChange(clean(max <= 1 ? parsed / 100 : parsed));
  };

  return (
    <View style={compact ? styles.compact : styles.wrap}>
      <View style={[styles.head, compact && styles.headCompact]}>
        <Text style={[styles.label, { color: c.ink }]}>{label}</Text>
        {typing === null ? (
          <Pressable
            // An unset value ("Book's", stored as a sentinel such as -1) starts the box empty rather than showing the sentinel.
            onPress={() => setTyping(UNSET[settingKey]?.value === value ? "" : String(max <= 1 ? Math.round(value * 100) : value))}
            accessibilityRole="button"
            accessibilityLabel={strings.typeValue(label, format(value))}
            hitSlop={8}
          >
            <Text style={[styles.value, { color: c.ink, borderColor: c.line }]}>{format(shown)}</Text>
          </Pressable>
        ) : (
          <TextInput
            autoFocus
            value={typing}
            onChangeText={setTyping}
            onSubmitEditing={finishTyping}
            onBlur={finishTyping}
            keyboardType="decimal-pad"
            returnKeyType="done"
            selectTextOnFocus
            accessibilityLabel={label}
            style={[styles.input, { color: c.ink, borderColor: c.accent }]}
          />
        )}
      </View>
      <View style={[styles.row, compact && styles.grow]}>
        <Pressable onPress={() => nudge(-1)} style={styles.step} accessibilityRole="button" accessibilityLabel={t().book.decrease(label)}>
          <Text style={[styles.stepText, { color: c.ink }]}>−</Text>
        </Pressable>
        <View
          ref={trackRef}
          style={styles.hit}
          onLayout={onLayout}
          {...responder.panHandlers}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min, max, now: value, text: format(value) }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) => nudge(event.nativeEvent.actionName === "increment" ? 1 : -1)}
        >
          <View style={[styles.track, { backgroundColor: c.track }]}>
            <View style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: c.accent }]} />
          </View>
          <View style={[styles.thumb, { left: `${fraction * 100}%`, backgroundColor: c.accent, borderColor: c.onAccent }]} />
        </View>
        <Pressable onPress={() => nudge(1)} style={styles.step} accessibilityRole="button" accessibilityLabel={t().book.increase(label)}>
          <Text style={[styles.stepText, { color: c.ink }]}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  compact: { flexDirection: "row", alignItems: "center", gap: 6 },
  headCompact: { gap: 8, justifyContent: "flex-start" },
  grow: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 36 },
  label: { fontSize: 15 },
  value: { fontSize: 15, fontWeight: "600", minWidth: 72, textAlign: "center", paddingVertical: 4, borderWidth: 1, borderRadius: 6 },
  input: { fontSize: 15, minWidth: 72, textAlign: "center", paddingVertical: 2, borderWidth: 2, borderRadius: 6 },
  row: { flexDirection: "row", alignItems: "center" },
  step: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 22 },
  hit: { flex: 1, height: 44, justifyContent: "center", marginHorizontal: 10 },
  track: { height: 4, borderRadius: 2, overflow: "hidden" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0 },
  thumb: { position: "absolute", width: 24, height: 24, marginLeft: -12, top: 10, borderRadius: 12, borderWidth: 2 },
});
