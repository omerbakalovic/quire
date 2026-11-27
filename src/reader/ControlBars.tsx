import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";

import type { Flow } from "@/domain/library";
import type { NavEntry } from "@/domain/navigation";
import { t } from "@/i18n";
import { barFrame, barRows, CONTROL_TEXT, type BarFrame, type ZoneLayout } from "@/settings/bars";
import type { Resolved } from "@/settings/registry";

import { ProgressSlider } from "./ProgressSlider";
import { useChrome, withAlpha, type Chrome } from "./chrome";

type Props = {
  settings: Resolved;
  insets: { top: number; bottom: number; left: number; right: number };
  title: string;
  chapter: string | null;
  fraction: number | null;
  toc: NavEntry[];
  flow: Flow;
  /** Fixed-layout pages have no scroll mode or reading CSS: those controls keep their space but hide. */
  fixedLayout: boolean;
  onBack: () => void;
  onFlow: (flow: Flow) => void;
  onContents: () => void;
  onChapter: (dir: "prev" | "next") => void;
  onSeek: (fraction: number) => void;
  /** True while the slider is dragged, so the Back pill can step out of the preview's way. */
  onScrub: (active: boolean) => void;
  onLook: () => void;
  /** Height of the bottom bars, so pills and notices sit above them. */
  onBottomHeight: (height: number) => void;
  /** The Bars editor's preview: outline each zone, so empty ones show where they are. */
  outlines?: boolean;
};

type RowProps = Props & {
  /** A see-through or bare bar: its text gets a soft halo in the bar colour, so it reads over the book's text (emulator runs 33, 34). */
  halo?: boolean;
};

/**
 * The controls that appear on a tap in the middle of the page, drawn from the
 * layout slots (docs/customization.md, 3.2): a top bar, and a bottom bar with
 * two rows. Each slot lists its controls in order; an empty slot draws nothing.
 */
export function ControlBars(props: Props) {
  const { settings, insets } = props;
  const c = useChrome();
  const rows = barRows(settings);
  const top = rows.top;
  const upper = rows.quick;
  const lower = rows.bottom;
  const topFrame = barFrame(settings, "top", insets);
  const bottomFrame = barFrame(settings, "bottom", insets);

  // Pills and notices sit above the whole panel, the gap under a floating one included.
  const onLayout = (event: LayoutChangeEvent) => props.onBottomHeight(event.nativeEvent.layout.height + bottomFrame.edge);
  const hasBottom = upper.length > 0 || lower.length > 0;

  return (
    <>
      {top.length > 0 ? (
        <View style={[styles.bar, frameStyle(topFrame, c), { top: topFrame.edge }]}>
          <Row zones={top} {...props} halo={topFrame.background !== "solid"} />
        </View>
      ) : null}
      {hasBottom ? (
        <View onLayout={onLayout} style={[styles.bar, frameStyle(bottomFrame, c), { bottom: bottomFrame.edge }]}>
          {upper.length > 0 ? <Row zones={upper} {...props} halo={bottomFrame.background !== "solid"} /> : null}
          {lower.length > 0 ? <Row zones={lower} {...props} halo={bottomFrame.background !== "solid"} /> : null}
        </View>
      ) : (
        <View onLayout={() => props.onBottomHeight(insets.bottom)} />
      )}
    </>
  );
}

function frameStyle(frame: BarFrame, c: Chrome) {
  const background = frame.background === "solid" ? c.bar : frame.background === "translucent" ? withAlpha(c.bar.slice(0, 7), 0.9) : "transparent";
  return {
    left: frame.left,
    right: frame.right,
    marginHorizontal: frame.marginHorizontal,
    paddingTop: frame.paddingTop,
    paddingBottom: frame.paddingBottom,
    paddingLeft: frame.paddingLeft,
    paddingRight: frame.paddingRight,
    borderRadius: frame.radius,
    backgroundColor: background,
  };
}

/**
 * One row of zones (src/settings/bars.ts): start, centre and end, or one
 * spread zone. A zone with a slider or the title takes the free space. A zone
 * with more than fits wraps onto a second line rather than pushing controls off
 * the screen; the slider and the title keep a minimum width, so they move down a
 * line instead of shrinking to nothing.
 */
function Row({ zones, ...props }: RowProps & { zones: ZoneLayout[] }) {
  const c = useChrome();
  const gap = props.settings["bar.gap"];
  return (
    <View style={[styles.row, { columnGap: gap }]}>
      {zones.map((zone) =>
        zone.items.length === 0 && !zone.grow ? (
          // The book draws nothing here; the preview marks the spot without taking room, so its row breaks
          // where the book's does (emulator run 34: the outlines' width wrapped a full row).
          props.outlines ? <View key={zone.zone} pointerEvents="none" style={[styles.outline, styles.marker, markerAt(zone.zone), { borderColor: c.muted }]} /> : null
        ) : (
          <View
            key={zone.zone}
            style={[styles.zone, zone.grow ? [styles.grow, { minWidth: growMin(zone.items) }] : styles.fixed, { justifyContent: zone.justify, columnGap: gap }, props.outlines && [styles.outline, { borderColor: c.muted }]]}
          >
            {zone.items.map((item) => (
              <Control key={item} item={item} {...props} />
            ))}
          </View>
        ),
      )}
    </View>
  );
}

/**
 * The narrowest a growing zone may get: its slider or title's own minimum. With
 * the row wrapping, zones that don't fit beside it move down a line rather than
 * squeezing it until controls overlap (Codex review of PR #18).
 */
function growMin(items: string[]): number {
  if (items.includes("title")) return 96;
  if (items.includes("slider")) return 72;
  return 0;
}

/** Where an empty zone's marker sits in its row: in the padding at either end, or across the middle. */
function markerAt(zone: string) {
  if (zone === "start") return { left: -10 };
  if (zone === "end") return { right: -10 };
  return { left: "50%" as const, marginLeft: -4 };
}

function Control({ item, ...props }: RowProps & { item: string }): ReactNode {
  const strings = t().book;
  const c = useChrome();
  const halo = props.halo ? { textShadowColor: c.bar.slice(0, 7), textShadowRadius: 6, textShadowOffset: { width: 0, height: 0 } } : null;
  const ink = [{ color: c.ink }, halo];
  const size = CONTROL_TEXT[props.settings["bar.controlSize"]] ?? CONTROL_TEXT.medium;
  const icons = props.settings["bar.labels"] === "icons";
  const compact = props.settings["bar.height"] === "compact";
  const label = [styles.label, ink, { fontSize: size.label }, compact && styles.labelCompact];
  switch (item) {
    case "back":
      return (
        <Pressable onPress={props.onBack} accessibilityRole="button" accessibilityLabel={strings.back} hitSlop={10} style={[styles.control, icons && styles.icon]}>
          <Text style={label}>{icons ? "‹" : `‹ ${strings.back}`}</Text>
        </Pressable>
      );
    case "title":
      return (
        <View style={styles.titleBox}>
          <Text style={[styles.title, ink, { fontSize: size.title }]} numberOfLines={1} ellipsizeMode="middle">
            {props.title}
          </Text>
          {props.chapter ? (
            <Text style={[styles.sub, { color: c.muted, fontSize: size.small }, halo]} numberOfLines={1}>
              {props.chapter}
            </Text>
          ) : null}
        </View>
      );
    case "contents":
      return (
        <Pressable onPress={props.onContents} accessibilityRole="button" accessibilityLabel={strings.contents} hitSlop={6} style={[styles.control, icons && styles.icon]}>
          <Text style={label}>{icons ? "☰" : `☰ ${strings.contents}`}</Text>
        </Pressable>
      );
    case "look":
      return (
        <Pressable onPress={props.onLook} accessibilityRole="button" accessibilityLabel={strings.look} hitSlop={6} style={[styles.control, props.fixedLayout && styles.hidden]}>
          <Text style={label}>Aa</Text>
        </Pressable>
      );
    case "flow":
      return (
        <View style={[styles.segment, { borderColor: c.line }, props.fixedLayout && styles.hidden]}>
          {(["paginated", "scrolled"] as const).map((option) => (
            <Pressable
              key={option}
              onPress={() => props.onFlow(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: props.flow === option }}
              style={[styles.segmentItem, props.flow === option && { backgroundColor: c.accent }]}
            >
              <Text style={[styles.segmentText, { color: c.ink }, props.flow !== option && halo, { fontSize: size.small }, props.flow === option && [styles.segmentTextOn, { color: c.onAccent }]]}>
                {option === "paginated" ? strings.paginated : strings.scrolled}
              </Text>
            </Pressable>
          ))}
        </View>
      );
    case "prevChapter":
    case "nextChapter": {
      const dir = item === "prevChapter" ? "prev" : "next";
      return (
        <Pressable
          onPress={() => props.onChapter(dir)}
          accessibilityRole="button"
          accessibilityLabel={dir === "prev" ? strings.prevChapter : strings.nextChapter}
          style={styles.icon}
        >
          <Text style={label}>{dir === "prev" ? "«" : "»"}</Text>
        </Pressable>
      );
    }
    case "slider":
      return <ProgressSlider fraction={props.fraction} toc={props.toc} onCommit={props.onSeek} onScrub={props.onScrub} />;
    case "percent":
      return (
        <Text style={[styles.percent, { color: c.muted, fontSize: size.small }, halo]}>{props.fraction === null ? "" : `${Math.round(props.fraction * 100)}%`}</Text>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  // No overflow clip: the slider's chapter bubble draws above the bar.
  bar: { position: "absolute", gap: 4 },
  // Zones wrap as wholes when together they are wider than the bar; a zone alone wider than the bar wraps inside itself.
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 2, minHeight: 44 },
  zone: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 2, minHeight: 44 },
  grow: { flex: 1, flexBasis: 0 },
  fixed: { flexShrink: 1, maxWidth: "100%" },
  outline: { borderWidth: 1, borderStyle: "dashed", borderRadius: 6, minWidth: 24 },
  marker: { position: "absolute", top: 4, bottom: 4, width: 8, minWidth: 8, borderRadius: 4 },
  control: { minHeight: 44, justifyContent: "center" },
  label: { fontSize: 18, paddingVertical: 6 },
  labelCompact: { paddingVertical: 2 },
  icon: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  titleBox: { flex: 1, minWidth: 96, paddingHorizontal: 6 },
  title: { fontSize: 16, fontWeight: "600" },
  sub: { fontSize: 13 },
  percent: { fontSize: 14, minWidth: 44, textAlign: "center" },
  segment: { flexDirection: "row", borderRadius: 8, borderWidth: 1, overflow: "hidden" },
  hidden: { opacity: 0, pointerEvents: "none" },
  segmentItem: { paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: "center" },
  segmentText: { fontSize: 14 },
  segmentTextOn: { fontWeight: "600" },
});
