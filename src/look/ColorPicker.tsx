import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, Text, TextInput, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";

import { t } from "@/i18n";
import { useChrome } from "@/reader/chrome";
import { hexToHsv, hslToRgb, hsvToHex, hsvToRgb, parseHex, rgbToHsl, rgbToHsv, type Hsv } from "@/settings/colour";

type Props = {
  value: string;
  /** Called while a handle moves (at most every 50 ms) and once more when it stops. */
  onChange: (hex: string) => void;
  /** A colour was settled on: a drag ended, a field or swatch set it. For the recent swatches. */
  onPicked: (hex: string) => void;
  /** Offer the opacity strip. */
  alpha: boolean;
  swatches: readonly string[];
  /** The token's name, for screen readers. */
  label: string;
  /** True while a handle is held, so the list around it stops scrolling. */
  onActive?: (active: boolean) => void;
  /** The square's height; smaller when the list under the preview is short, so square and hue strip fit together. */
  squareHeight?: number;
};

type State = Hsv & { a: number };

// Fixed colours: the picker draws the colour space itself, whatever the theme. colour-ok
const HUES = ["#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff", "#ff0000"]; // colour-ok
const WHITE = "#ffffff"; // colour-ok
const BLACK = "#000000"; // colour-ok
const CLEAR = "#00000000"; // colour-ok
const CHECKER = "#cccccc"; // colour-ok
const SQUARE = 176;
/** Below this the square is too small to aim in; the editor scrolls the picker to the top instead. */
export const MIN_SQUARE = 96;
const STRIP = 28;
const THROTTLE = 50;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The colour picker (docs/customization-roadmap.md, C4): a saturation and
 * brightness square, a hue strip, an optional opacity strip, hex, RGB and HSL
 * fields, and swatches of the theme's colours and the last ones picked.
 * Every handle has one-step accessibility actions, and the fields take exact values.
 */
export function ColorPicker({ value, onChange, onPicked, alpha, swatches, label, onActive, squareHeight = SQUARE }: Props) {
  // The editor keeps the square at MIN_SQUARE or more where it can; the floor only guards a very short window.
  const height = clamp(squareHeight, 72, SQUARE);
  const heightRef = useRef(height);
  heightRef.current = height;
  const c = useChrome();
  const strings = t().look.picker;
  const [state, setState] = useState<State>(() => hexToHsv(value) ?? { h: 0, s: 0, v: 0, a: 1 });
  const stateRef = useRef(state);
  stateRef.current = state;
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const lastEmit = useRef(0);
  const hexOf = (s: State) => hsvToHex(s, alpha ? s.a : 1);

  // A value from outside (a swatch, Reset, another token): follow it, keeping the hue of greys.
  useEffect(() => {
    if (hexOf(stateRef.current) === value) return;
    const next = hexToHsv(value);
    if (!next) return;
    setState(next.s === 0 || next.v === 0 ? { ...next, h: stateRef.current.h } : next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const set = (next: State, final: boolean) => {
    setState(next);
    stateRef.current = next;
    const now = Date.now();
    if (final || now - lastEmit.current >= THROTTLE) {
      lastEmit.current = now;
      onChange(hexOf(next));
    }
    if (final) onPicked(hexOf(next));
  };
  const setRef = useRef(set);
  setRef.current = set;
  const activeRef = useRef(onActive);
  activeRef.current = onActive;

  /** A drag on a square or strip: positions come from page coordinates, so the handle under the finger can't skew them. */
  const drag = (apply: (x: number, y: number, s: State) => State) => {
    let origin = { x: 0, y: 0 };
    const at = (event: GestureResponderEvent, final: boolean) => {
      const x = event.nativeEvent.pageX - origin.x;
      const y = event.nativeEvent.pageY - origin.y;
      setRef.current(apply(x, y, stateRef.current), final);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Held until let go: the list doesn't take a vertical move inside the square.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        origin = { x: event.nativeEvent.pageX - event.nativeEvent.locationX, y: event.nativeEvent.pageY - event.nativeEvent.locationY };
        activeRef.current?.(true);
        at(event, false);
      },
      onPanResponderMove: (event) => at(event, false),
      onPanResponderRelease: (event) => {
        at(event, true);
        activeRef.current?.(false);
      },
      onPanResponderTerminate: () => activeRef.current?.(false),
    });
  };

  const square = useMemo(
    () => drag((x, y, s) => ({ ...s, s: clamp(x / Math.max(1, widthRef.current), 0, 1), v: 1 - clamp(y / heightRef.current, 0, 1) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const hue = useMemo(
    () => drag((x, _y, s) => ({ ...s, h: clamp(x / Math.max(1, widthRef.current), 0, 1) * 359.999 })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const opacity = useMemo(
    () => drag((x, _y, s) => ({ ...s, a: Math.round(clamp(x / Math.max(1, widthRef.current), 0, 1) * 100) / 100 })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onLayout = (event: LayoutChangeEvent) => {
    const w = event.nativeEvent.layout.width;
    widthRef.current = w;
    setWidth(w);
  };

  const pure = hsvToHex({ h: state.h, s: 1, v: 1 });
  const solid = hsvToHex(state);
  const hex = hexOf(state);
  const rgb = hsvToRgb(state);
  const hsl = rgbToHsl(rgb);
  const pct = (v: number) => Math.round(v * 100);

  const step = (change: Partial<State>) => set({ ...state, ...change }, true);

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      <View
        style={[styles.square, { height, borderColor: c.line }]}
        {...square.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={strings.square(label)}
        accessibilityValue={{ text: strings.squareValue(pct(state.s), pct(state.v)) }}
        accessibilityActions={[
          { name: "increment", label: strings.brighter },
          { name: "decrement", label: strings.darker },
          { name: "moreSaturation", label: strings.moreSaturation },
          { name: "lessSaturation", label: strings.lessSaturation },
        ]}
        onAccessibilityAction={(event) => {
          const name = event.nativeEvent.actionName;
          if (name === "increment") step({ v: clamp(state.v + 0.01, 0, 1) });
          else if (name === "decrement") step({ v: clamp(state.v - 0.01, 0, 1) });
          else if (name === "moreSaturation") step({ s: clamp(state.s + 0.01, 0, 1) });
          else if (name === "lessSaturation") step({ s: clamp(state.s - 0.01, 0, 1) });
        }}
      >
        {/* View gradients, not a Skia canvas: a canvas opened below the screen edge stayed half drawn (emulator run 28). */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundImage: `linear-gradient(to right, ${WHITE}, ${pure})` }]} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundImage: `linear-gradient(to bottom, ${CLEAR}, ${BLACK})` }]} />
        <View
          pointerEvents="none"
          style={[styles.ring, { left: state.s * width - 11, top: (1 - state.v) * height - 11, backgroundColor: solid, borderColor: state.v > 0.6 && state.s < 0.4 ? BLACK : WHITE }]}
        />
      </View>

      <View
        style={[styles.strip, { borderColor: c.line }]}
        {...hue.panHandlers}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={strings.hue(label)}
        accessibilityValue={{ min: 0, max: 360, now: Math.round(state.h), text: strings.hueValue(Math.round(state.h)) }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => step({ h: (state.h + (event.nativeEvent.actionName === "increment" ? 1 : 359)) % 360 })}
      >
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundImage: `linear-gradient(to right, ${HUES.join(", ")})` }]} />
        <View pointerEvents="none" style={[styles.bar, { left: (state.h / 360) * width - 4, borderColor: WHITE, backgroundColor: pure }]} />
      </View>

      {alpha ? (
        <View
          style={[styles.strip, { borderColor: c.line }]}
          {...opacity.panHandlers}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={strings.opacity(label)}
          accessibilityValue={{ min: 0, max: 100, now: pct(state.a), text: `${pct(state.a)}%` }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) => step({ a: clamp(Math.round((state.a + (event.nativeEvent.actionName === "increment" ? 0.01 : -0.01)) * 100) / 100, 0, 1) })}
        >
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: CHECKER, backgroundImage: `linear-gradient(to right, ${solid}00, ${solid})` }]} />
          <View pointerEvents="none" style={[styles.bar, { left: state.a * width - 4, borderColor: WHITE, backgroundColor: solid }]} />
        </View>
      ) : null}

      <View style={styles.fields}>
        <Field label={strings.hex} width={104} value={hex} keyboard="default" onSubmit={(text) => {
          const parsed = parseHex(text.startsWith("#") ? text : `#${text}`);
          if (!parsed) return false;
          set({ ...rgbToHsv(parsed), a: alpha ? parsed.a : 1 }, true);
          return true;
        }} />
        {(["r", "g", "b"] as const).map((key) => (
          <Field key={key} label={strings[key]} width={52} value={String(Math.round(rgb[key]))} onSubmit={(text) => {
            const n = Number.parseInt(text, 10);
            if (!Number.isFinite(n)) return false;
            set({ ...rgbToHsv({ ...rgb, [key]: clamp(n, 0, 255) }), a: state.a }, true);
            return true;
          }} />
        ))}
      </View>
      <View style={styles.fields}>
        {([
          ["h", Math.round(hsl.h), 360],
          ["s", pct(hsl.s), 100],
          ["l", pct(hsl.l), 100],
        ] as const).map(([key, shown, max]) => (
          <Field key={key} label={strings[key]} width={60} value={String(shown)} onSubmit={(text) => {
            const n = Number.parseFloat(text);
            if (!Number.isFinite(n)) return false;
            const next = { ...hsl, [key]: key === "h" ? clamp(n, 0, 360) : clamp(n, 0, max) / 100 };
            const hsv = rgbToHsv(hslToRgb(next));
            set({ ...hsv, h: key === "h" ? clamp(n, 0, 359.999) : hsv.s === 0 ? state.h : hsv.h, a: state.a }, true);
            return true;
          }} />
        ))}
        {alpha ? <Text style={[styles.small, { color: c.muted }]}>{strings.opacityShort(pct(state.a))}</Text> : null}
      </View>

      <View style={styles.swatches}>
        {swatches.map((swatch) => (
          <Pressable
            key={swatch}
            onPress={() => {
              const next = hexToHsv(swatch);
              if (next) set({ ...next, a: alpha ? next.a : 1 }, true);
            }}
            accessibilityRole="button"
            accessibilityLabel={strings.swatch(swatch)}
            style={[styles.swatch, { backgroundColor: swatch, borderColor: c.line }]}
          />
        ))}
      </View>
    </View>
  );
}

/** A small typed field: the text is the user's while focused, and goes back to the value when it doesn't parse. */
function Field({ label, value, width, onSubmit, keyboard = "number-pad" }: { label: string; value: string; width: number; onSubmit: (text: string) => boolean; keyboard?: "default" | "number-pad" }) {
  const c = useChrome();
  const [text, setText] = useState<string | null>(null);
  const done = () => {
    if (text !== null && text !== value) onSubmit(text.trim());
    setText(null);
  };
  return (
    <View style={styles.field}>
      <Text style={[styles.small, { color: c.muted }]}>{label}</Text>
      <TextInput
        value={text ?? value}
        onFocus={() => setText(value)}
        onChangeText={setText}
        onEndEditing={done}
        onSubmitEditing={done}
        keyboardType={keyboard}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        accessibilityLabel={label}
        style={[styles.input, { width, color: c.ink, borderColor: c.line }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingVertical: 6 },
  square: { borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  ring: { position: "absolute", width: 22, height: 22, borderRadius: 11, borderWidth: 3 },
  strip: { height: STRIP, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  bar: { position: "absolute", top: 1, bottom: 1, width: 8, borderRadius: 4, borderWidth: 2 },
  fields: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", gap: 8 },
  field: { gap: 2 },
  input: { fontSize: 15, minHeight: 40, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderRadius: 6, fontVariant: ["tabular-nums"] },
  small: { fontSize: 13 },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 1 },
});
