import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { t } from "@/i18n";
import { ThemedSwitch } from "@/ui/ThemedSwitch";
import type { LibraryStyle, LookOptions } from "@/domain/library-look";
import { loadLibrary, saveLook, saveSetting, saveSettings, useLibrary } from "@/library/store";
import { useChrome } from "@/reader/chrome";
import { resolvedFor } from "@/settings/customization";
import { APP_THEMES } from "@/settings/registry";
import { themeFor } from "@/settings/themes";

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  const c = useChrome();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: c.appInk }]}>{label}</Text>
      <ThemedSwitch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

/** Library look and global reader settings. The reading look has its own screen (customize.tsx). */
export default function SettingsScreen() {
  const strings = t().settings;
  const reading = t().customize;
  const router = useRouter();
  const library = useLibrary();
  const followBook = library.settings.tapZones === "reading";
  const look = library.look;
  const set = (patch: Partial<LookOptions>) => void saveLook(patch);
  const c = useChrome();
  const appTheme = resolvedFor(library.custom, null)["app.theme"];
  const themeNames = t().book.themes;
  const text = { color: c.appInk };
  const muted = { color: c.appMuted };

  useEffect(() => {
    void loadLibrary();
  }, []);

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: strings.title }} />
      <Text style={[styles.section, muted]}>{strings.library}</Text>
      <View style={styles.row}>
        <Text style={[styles.label, text]}>{strings.style}</Text>
        <View style={[styles.segment, { borderColor: c.line }]}>
          {(["minimal", "pills"] as LibraryStyle[]).map((option) => (
            <Pressable
              key={option}
              onPress={() => void saveLook({ style: option })}
              accessibilityRole="button"
              accessibilityState={{ selected: look.style === option }}
              style={[styles.segmentItem, look.style === option && { backgroundColor: c.controlOn }]}
            >
              <Text style={[styles.segmentText, { color: look.style === option ? c.controlOnInk : c.appInk }, look.style === option && styles.bold]}>
                {option === "minimal" ? strings.styleMinimal : strings.stylePills}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <Text style={[styles.help, muted]}>{strings.styleHelp}</Text>
      {look.style === "pills" ? (
        <Toggle label={strings.showCovers} value={look.showCovers} onChange={(value) => set({ showCovers: value })} />
      ) : null}
      <Toggle label={strings.showAuthor} value={look.showAuthor} onChange={(value) => set({ showAuthor: value })} />
      <Toggle label={strings.showProgress} value={look.showProgress} onChange={(value) => set({ showProgress: value })} />
      <Text style={[styles.section, muted]}>{strings.appTheme}</Text>
      <View style={styles.chips}>
        {APP_THEMES.map((option) => {
          const on = appTheme === option;
          const swatch = option === "follow" ? null : themeFor(option);
          return (
            <Pressable
              key={option}
              onPress={() => void saveSetting("global", "app.theme", option, null)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[
                styles.chip,
                { borderColor: on ? c.accent : c.line, backgroundColor: swatch ? swatch.page : c.control },
                on && styles.chipOn,
              ]}
            >
              <Text style={[styles.chipText, { color: swatch ? swatch.ink : c.controlInk }]}>
                {option === "follow" ? reading.appThemeFollow : (themeNames[option] ?? option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.help, muted]}>{strings.appThemeHelp}</Text>
      <Text style={[styles.section, muted]}>{reading.title}</Text>
      <Pressable onPress={() => router.push("/look")} accessibilityRole="button" style={styles.row}>
        <Text style={[styles.label, text]}>{reading.open}</Text>
        <Text style={[styles.chevron, muted]}>›</Text>
      </Pressable>
      <Text style={[styles.help, muted]}>{reading.openHelp}</Text>
      <Text style={[styles.section, muted]}>{strings.taps}</Text>
      <View style={styles.row}>
        <Text style={[styles.label, text]}>{strings.tapsFollowBook}</Text>
        <ThemedSwitch
          value={followBook}
          onValueChange={(value) => void saveSettings({ tapZones: value ? "reading" : "screen" })}
          accessibilityLabel={strings.tapsFollowBook}
        />
      </View>
      <Text style={[styles.help, muted]}>{followBook ? strings.tapsFollowBookOn : strings.tapsFollowBookOff}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8 },
  section: { fontSize: 13, fontWeight: "600", textTransform: "uppercase", opacity: 0.6, marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, minHeight: 48 },
  label: { flex: 1, fontSize: 16 },
  segment: { flexDirection: "row", borderRadius: 8, borderWidth: 1, overflow: "hidden" },
  segmentItem: { paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: "center" },
  segmentText: { fontSize: 14 },
  bold: { fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, minHeight: 40, justifyContent: "center" },
  chipOn: { borderWidth: 3 },
  chipText: { fontSize: 14 },
  chevron: { fontSize: 22, opacity: 0.6 },
  help: { fontSize: 14, opacity: 0.7, lineHeight: 20 },
});
