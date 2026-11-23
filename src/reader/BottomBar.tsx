import { Pressable, StyleSheet, Text, View } from "react-native";

import type { Flow } from "@/domain/library";
import type { NavEntry } from "@/domain/navigation";
import { t } from "@/i18n";

import { ProgressSlider } from "./ProgressSlider";

type Props = {
  bottomInset: number;
  fraction: number | null;
  toc: NavEntry[];
  flow: Flow;
  /** Fixed-layout pages have no scroll mode; the switch keeps its space so the other controls do not move. */
  fixedLayout: boolean;
  onFlow: (flow: Flow) => void;
  onContents: () => void;
  onChapter: (dir: "prev" | "next") => void;
  onSeek: (fraction: number) => void;
};

/** Reader controls: chapter buttons around the progress slider, then contents and the flow switch. */
export function BottomBar({ bottomInset, fraction, toc, flow, fixedLayout, onFlow, onContents, onChapter, onSeek }: Props) {
  const strings = t().book;
  const percent = fraction === null ? null : Math.round(fraction * 100);
  return (
    <View style={[styles.bar, { paddingBottom: bottomInset + 8 }]}>
      <View style={styles.row}>
        <Pressable onPress={() => onChapter("prev")} accessibilityRole="button" accessibilityLabel={strings.prevChapter} style={styles.icon}>
          <Text style={styles.button}>«</Text>
        </Pressable>
        <ProgressSlider fraction={fraction} toc={toc} onCommit={onSeek} />
        <Pressable onPress={() => onChapter("next")} accessibilityRole="button" accessibilityLabel={strings.nextChapter} style={styles.icon}>
          <Text style={styles.button}>»</Text>
        </Pressable>
        <Text style={styles.percent}>{percent === null ? "" : `${percent}%`}</Text>
      </View>
      <View style={[styles.row, styles.spread]}>
        <Pressable onPress={onContents} accessibilityRole="button" style={styles.contents} hitSlop={6}>
          <Text style={styles.button}>☰ {strings.contents}</Text>
        </Pressable>
        <View style={[styles.segment, fixedLayout && styles.hidden]}>
          {(["paginated", "scrolled"] as const).map((option) => (
            <Pressable
              key={option}
              onPress={() => onFlow(option)}
              accessibilityRole="button"
              accessibilityState={{ selected: flow === option }}
              style={[styles.segmentItem, flow === option && styles.segmentOn]}
            >
              <Text style={[styles.segmentText, flow === option && styles.segmentTextOn]}>
                {option === "paginated" ? strings.paginated : strings.scrolled}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 4,
    backgroundColor: "#1c1c1ef2",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  spread: { justifyContent: "space-between" },
  button: { color: "#fff", fontSize: 18, paddingVertical: 6 },
  icon: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  contents: { minHeight: 44, justifyContent: "center" },
  percent: { color: "#ccc", fontSize: 14, minWidth: 44, textAlign: "center" },
  segment: { flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: "#555", overflow: "hidden" },
  hidden: { opacity: 0, pointerEvents: "none" },
  segmentItem: { paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: "center" },
  segmentOn: { backgroundColor: "#eee" },
  segmentText: { color: "#eee", fontSize: 14 },
  segmentTextOn: { color: "#111", fontWeight: "600" },
});
