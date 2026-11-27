import { useEffect, useRef } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import type { NavEntry } from "@/domain/navigation";
import { t } from "@/i18n";
import { useChrome } from "./chrome";

type Props = {
  toc: NavEntry[];
  current: number;
  topInset: number;
  bottomInset: number;
  onSelect: (entry: NavEntry) => void;
  onClose: () => void;
};

const ROW = 52;

/** The nested table of contents. The current chapter is marked and scrolled into view. */
export function TocPanel({ toc, current, topInset, bottomInset, onSelect, onClose }: Props) {
  const strings = t().book;
  const list = useRef<FlatList<NavEntry>>(null);
  const c = useChrome();

  useEffect(() => {
    if (current < 0 || current >= toc.length) return;
    const timer = setTimeout(() => list.current?.scrollToIndex({ index: current, viewPosition: 0.4, animated: false }), 0);
    return () => clearTimeout(timer);
  }, [current, toc.length]);

  return (
    <View style={[styles.shade, { backgroundColor: c.shade }]}>
      <View style={[styles.panel, { paddingTop: topInset + 8, paddingBottom: bottomInset, backgroundColor: c.panel }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: c.ink }]} accessibilityRole="header">
            {strings.contents}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={strings.contentsClose} hitSlop={12}>
            <Text style={[styles.close, { color: c.ink }]}>✕</Text>
          </Pressable>
        </View>
        {toc.length === 0 ? (
          <Text style={[styles.empty, { color: c.muted }]}>{strings.contentsEmpty}</Text>
        ) : (
          <FlatList
            ref={list}
            data={toc}
            keyExtractor={(_item, index) => String(index)}
            getItemLayout={(_data, index) => ({ length: ROW, offset: ROW * index, index })}
            onScrollToIndexFailed={() => undefined}
            renderItem={({ item, index }) => {
              const here = index === current;
              const disabled = item.href === null;
              return (
                <Pressable
                  onPress={() => onSelect(item)}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityState={{ selected: here, disabled }}
                  accessibilityHint={here ? strings.currentChapter : undefined}
                  style={[styles.row, { paddingLeft: 16 + Math.min(item.depth, 6) * 16 }, here && { backgroundColor: c.selected }]}
                >
                  <Text style={[styles.label, { color: c.ink }, here && styles.labelHere, disabled && { color: c.line }]} numberOfLines={2}>
                    {item.label || "—"}
                  </Text>
                  {item.fraction !== null ? <Text style={[styles.percent, { color: c.muted }]}>{Math.round(item.fraction * 100)}%</Text> : null}
                </Pressable>
              );
            }}
          />
        )}
      </View>
      <Pressable style={styles.rest} onPress={onClose} accessibilityLabel={strings.contentsClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  shade: { ...StyleSheet.absoluteFill, flexDirection: "row" },
  panel: { width: "86%", maxWidth: 420 },
  rest: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  title: { flex: 1, fontSize: 18, fontWeight: "600" },
  close: { fontSize: 18, padding: 6 },
  empty: { padding: 16, fontSize: 15 },
  row: { height: ROW, flexDirection: "row", alignItems: "center", paddingRight: 16, gap: 8 },
  label: { flex: 1, fontSize: 15 },
  labelHere: { fontWeight: "700" },
  percent: { fontSize: 12, minWidth: 36, textAlign: "right" },
});
