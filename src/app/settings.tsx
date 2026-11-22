import { Stack } from "expo-router";
import { useEffect } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { t } from "@/i18n";
import { loadLibrary, saveSettings, useLibrary } from "@/library/store";

/** Global reader settings. Typography and themes join this screen in Milestone 4. */
export default function SettingsScreen() {
  const strings = t().settings;
  const library = useLibrary();
  const followBook = library.settings.tapZones === "reading";

  useEffect(() => {
    void loadLibrary();
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: strings.title }} />
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
  help: { fontSize: 14, opacity: 0.7, lineHeight: 20 },
});
