import { Pressable, StyleSheet, Text, View } from "react-native";

import { t } from "@/i18n";
import { useChrome } from "./chrome";

type Props = { depth: number; label: string | null; bottom: number; onBack: () => void; onDismiss: () => void };

/** "Back to where you were", floating above the page after any jump. */
export function BackPill({ depth, label, bottom, onBack, onDismiss }: Props) {
  const strings = t().book;
  const c = useChrome();
  if (depth <= 0) return null;
  const text = label ? strings.backTo(label) : strings.backToWhereYouWere;
  return (
    <View style={[styles.wrap, { bottom }]} pointerEvents="box-none">
      <View style={[styles.pill, { backgroundColor: c.bar, borderColor: c.line }]}>
        <Pressable onPress={onBack} accessibilityRole="button" style={styles.main} hitSlop={6}>
          <Text style={[styles.text, { color: c.ink }]} numberOfLines={1}>
            ‹ {text}
          </Text>
          {depth > 1 ? <Text style={[styles.count, { color: c.muted }]}>{strings.backLevels(depth)}</Text> : null}
        </Pressable>
        <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel={strings.backDismiss} style={styles.x} hitSlop={6}>
          <Text style={[styles.text, { color: c.ink }]}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "90%",
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: "#2c2c2ef0",
    minHeight: 44,
  },
  main: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 16, paddingRight: 8, minHeight: 44 },
  text: { color: "#fff", fontSize: 15, flexShrink: 1 },
  count: { color: "#aaa", fontSize: 12 },
  x: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", paddingRight: 4 },
});
