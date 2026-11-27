import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";

import type { Flow } from "@/domain/library";
import type { NavEntry } from "@/domain/navigation";
import { t } from "@/i18n";
import { barRows, type ZoneLayout } from "@/settings/bars";
import type { Resolved } from "@/settings/registry";

import { ProgressSlider } from "./ProgressSlider";
import { useChrome } from "./chrome";

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
  const side = { paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right };

  const onLayout = (event: LayoutChangeEvent) => props.onBottomHeight(event.nativeEvent.layout.height);
  const hasBottom = upper.length > 0 || lower.length > 0;

  return (
    <>
      {top.length > 0 ? (
        <View style={[styles.bar, styles.top, side, { paddingTop: insets.top + 6, backgroundColor: c.bar }]}>
          <Row zones={top} {...props} />
        </View>
      ) : null}
      {hasBottom ? (
        <View onLayout={onLayout} style={[styles.bar, styles.bottom, side, { paddingBottom: insets.bottom + 8, backgroundColor: c.bar }]}>
          {upper.length > 0 ? <Row zones={upper} {...props} /> : null}
          {lower.length > 0 ? <Row zones={lower} {...props} /> : null}
        </View>
      ) : (
        <View onLayout={() => props.onBottomHeight(insets.bottom)} />
      )}
    </>
  );
}

/**
 * One row of zones (src/settings/bars.ts): start, centre and end, or one
 * spread zone. A zone with a slider or the title takes the free space. A zone
 * with more than fits wraps onto a second line rather than pushing controls off
 * the screen; the slider and the title keep a minimum width, so they move down a
 * line instead of shrinking to nothing.
 */
function Row({ zones, ...props }: Props & { zones: ZoneLayout[] }) {
  return (
    <View style={styles.row}>
      {zones.map((zone) =>
        zone.items.length === 0 && !zone.grow ? null : (
          <View key={zone.zone} style={[styles.zone, zone.grow && styles.grow, { justifyContent: zone.justify }]}>
            {zone.items.map((item) => (
              <Control key={item} item={item} {...props} />
            ))}
          </View>
        ),
      )}
    </View>
  );
}

function Control({ item, ...props }: Props & { item: string }): ReactNode {
  const strings = t().book;
  const c = useChrome();
  const ink = { color: c.ink };
  switch (item) {
    case "back":
      return (
        <Pressable onPress={props.onBack} accessibilityRole="button" hitSlop={10} style={styles.control}>
          <Text style={[styles.label, ink]}>‹ {strings.back}</Text>
        </Pressable>
      );
    case "title":
      return (
        <View style={styles.titleBox}>
          <Text style={[styles.title, ink]} numberOfLines={1}>
            {props.title}
          </Text>
          {props.chapter ? (
            <Text style={[styles.sub, { color: c.muted }]} numberOfLines={1}>
              {props.chapter}
            </Text>
          ) : null}
        </View>
      );
    case "contents":
      return (
        <Pressable onPress={props.onContents} accessibilityRole="button" hitSlop={6} style={styles.control}>
          <Text style={[styles.label, ink]}>☰ {strings.contents}</Text>
        </Pressable>
      );
    case "look":
      return (
        <Pressable onPress={props.onLook} accessibilityRole="button" accessibilityLabel={strings.look} hitSlop={6} style={[styles.control, props.fixedLayout && styles.hidden]}>
          <Text style={[styles.label, ink]}>Aa</Text>
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
              <Text style={[styles.segmentText, ink, props.flow === option && [styles.segmentTextOn, { color: c.onAccent }]]}>
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
          <Text style={[styles.label, ink]}>{dir === "prev" ? "«" : "»"}</Text>
        </Pressable>
      );
    }
    case "slider":
      return <ProgressSlider fraction={props.fraction} toc={props.toc} onCommit={props.onSeek} onScrub={props.onScrub} />;
    case "percent":
      return (
        <Text style={[styles.percent, { color: c.muted }]}>{props.fraction === null ? "" : `${Math.round(props.fraction * 100)}%`}</Text>
      );
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  bar: { position: "absolute", left: 0, right: 0, gap: 4 },
  top: { top: 0, paddingBottom: 10 },
  bottom: { bottom: 0, paddingTop: 4 },
  row: { flexDirection: "row", alignItems: "center", columnGap: 6, minHeight: 44 },
  zone: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 2, minHeight: 44 },
  grow: { flex: 1, flexBasis: 0 },
  control: { minHeight: 44, justifyContent: "center" },
  label: { fontSize: 18, paddingVertical: 6 },
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
