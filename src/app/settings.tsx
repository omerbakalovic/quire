import { Stack } from "expo-router";
import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { t } from "@/i18n";
import type { LibraryStyle, LookOptions } from "@/domain/library-look";
import { loadLibrary, saveLook, saveSettings, useLibrary } from "@/library/store";

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

/** Library look and global reader settings. Typography and themes join this screen in Milestone 4. */
export default function SettingsScreen() {
  const strings = t().settings;
  const library = useLibrary();
  const followBook = library.settings.tapZones === "reading";
  const look = library.look;
  const set = (patch: Partial<LookOptions>) => void saveLook(patch);

  useEffect(() => {
    void loadLibrary();
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: strings.title }} />
      <Text style={styles.section}>{strings.library}</Text>
      <View style={styles.row}>
        <Text style={styles.label}>{strings.style}</Text>
        <View style={styles.segment}>
          {(["minimal", "pills"] as LibraryStyle[]).map((option) => (
            <Pressable
              key={option}
              onPress={() => void saveLook({ style: option })}
              accessibilityRole="button"
              accessibilityState={{ selected: look.style === option }}
              style={[styles.segmentItem, look.style === option && styles.segmentOn]}
            >
              <Text style={[styles.segmentText, look.style === option && styles.segmentTextOn]}>
                {option === "minimal" ? strings.styleMinimal : strings.stylePills}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Text style={styles.help}>{strings.styleHelp}</Text>
      {look.style === "pills" ? (
        <Toggle label={strings.showCovers} value={look.showCovers} onChange={(value) => set({ showCovers: value })} />
      ) : null}
      <Toggle label={strings.showAuthor} value={look.showAuthor} onChange={(value) => set({ showAuthor: value })} />
      <Toggle label={strings.showProgress} value={look.showProgress} onChange={(value) => set({ showProgress: value })} />
      <Text style={styles.section}>{strings.taps}</Text>
      <View style={styles.row}>
        <Text style={styles.label}>{strings.tapsFollowBook}</Text>
        <Switch
          value={followBook}
          onValueChange={(value) => void saveSettings({ tapZones: value ? "reading" : "screen" })}
          accessibilityLabel={strings.tapsFollowBook}
        />
      </View>
      <Text style={styles.help}>{followBook ? strings.tapsFollowBookOn : strings.tapsFollowBookOff}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8 },
  section: { fontSize: 13, fontWeight: "600", textTransform: "uppercase", opacity: 0.6, marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 48 },
  label: { flex: 1, fontSize: 16 },
  segment: { flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: "#8886", overflow: "hidden" },
  segmentItem: { paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: "center" },
  segmentOn: { backgroundColor: "#1F3A5F" },
  segmentText: { fontSize: 14 },
  segmentTextOn: { color: "#fff", fontWeight: "600" },
  help: { fontSize: 14, opacity: 0.7, lineHeight: 20 },
});
