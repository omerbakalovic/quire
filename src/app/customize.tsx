import { Stack } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { t } from "@/i18n";
import { chooseProfile, loadLibrary, removeProfile, saveProfile, saveSetting, useLibrary } from "@/library/store";
import { confirmRemoveFont, pickFont } from "@/reader/font-import";
import { layersFor } from "@/settings/customization";
import { formatNumber, sectionsFor, stepValue, type Row } from "@/settings/customize";
import { fontLabel } from "@/settings/fonts";
import type { SettingKey } from "@/settings/registry";

const ACCENT = "#1F3A5F";

/**
 * Every reading-look setting, generated from the registry, for all books or
 * the active reading profile; and the profiles themselves. The reader's Aa
 * panel covers the everyday few; this screen has the rest.
 */
export default function CustomizeScreen() {
  const strings = t().customize;
  const book = t().book;
  const library = useLibrary();
  const custom = library.custom;
  const active = custom.profiles.find((p) => p.id === custom.activeProfile) ?? null;
  const layer = active ? "profile" : "global";
  const layers = useMemo(() => layersFor(custom, null), [custom]);
  const sections = useMemo(() => sectionsFor(layers, layer, custom.fonts), [layers, layer, custom.fonts]);
  const [name, setName] = useState("");

  useEffect(() => {
    void loadLibrary();
  }, []);

  const change = (key: SettingKey, value: number | string | boolean | null) => void saveSetting(layer, key, value, null);

  const choiceName = (key: SettingKey, option: string): string => {
    if (key === "type.fontFamily") return fontLabel(option, book.fonts, custom.fonts);
    if (key === "theme.id") return book.themes[option] ?? option;
    if (key === "type.alignment") return book.aligns[option] ?? option;
    if (key === "turn.style") return strings.turns[option] ?? option;
    return option;
  };

  function saveAsProfile() {
    const label = name.trim();
    if (!label) return;
    const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "profile";
    let id = base;
    for (let n = 2; custom.profiles.some((p) => p.id === id); n++) id = `${base}-${n}`;
    void saveProfile(id, label, { ...custom.global, ...(active?.values ?? {}) }).then(() => chooseProfile(id));
    setName("");
  }

  function confirmDelete(id: string, label: string) {
    Alert.alert(strings.profileDeleteTitle, strings.profileDeleteBody(label), [
      { text: strings.cancel, style: "cancel" },
      { text: strings.profileDelete, style: "destructive", onPress: () => void removeProfile(id) },
    ]);
  }

  const chip = (key: string, text: string, on: boolean, onPress: () => void, onLongPress?: () => void) => (
    <Pressable
      key={key}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.chip, on && styles.chipOn]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{text}</Text>
    </Pressable>
  );

  const label = (row: Row) => (
    <View style={styles.labelWrap}>
      <Text style={styles.label}>{strings.names[row.key] ?? row.key}</Text>
      {row.set ? (
        <Pressable onPress={() => change(row.key, null)} accessibilityRole="button" accessibilityLabel={strings.resetLabel(strings.names[row.key] ?? row.key)} hitSlop={8}>
          <Text style={styles.reset}>{strings.reset}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  const draw = (row: Row) => {
    const title = strings.names[row.key] ?? row.key;
    if (row.kind === "boolean") {
      return (
        <View key={row.key} style={styles.row}>
          {label(row)}
          <Switch value={row.value} onValueChange={(value) => change(row.key, value)} accessibilityLabel={title} />
        </View>
      );
    }
    if (row.kind === "number") {
      const step = (dir: 1 | -1) => {
        const next = stepValue(row.key, row.value, dir);
        if (next !== null) change(row.key, next);
      };
      return (
        <View key={row.key} style={styles.row}>
          {label(row)}
          <Pressable onPress={() => step(-1)} style={styles.step} accessibilityRole="button" accessibilityLabel={book.decrease(title)}>
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <Text style={styles.value}>{formatNumber(row.key, row.value, { system: book.system, off: book.off, bookDefault: book.bookDefault })}</Text>
          <Pressable onPress={() => step(1)} style={styles.step} accessibilityRole="button" accessibilityLabel={book.increase(title)}>
            <Text style={styles.stepText}>+</Text>
          </Pressable>
        </View>
      );
    }
    const fonts = row.key === "type.fontFamily";
    return (
      <View key={row.key} style={styles.block}>
        {label(row)}
        <View style={styles.chips}>
          {row.options.map((option) => {
            const imported = fonts ? custom.fonts.find((f) => f.id === option) : undefined;
            return chip(option, choiceName(row.key, option), row.value === option, () => change(row.key, option), imported ? () => confirmRemoveFont(imported) : undefined);
          })}
          {fonts ? chip("add", `+ ${book.fontAdd}`, false, () => void pickFont((font) => change(row.key, font.id))) : null}
        </View>
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: strings.title }} />
      <Text style={styles.section}>{strings.profiles}</Text>
      <View style={styles.chips}>
        {chip("none", strings.profileNone, active === null, () => void chooseProfile(null))}
        {custom.profiles.map((p) => chip(p.id, p.name, active?.id === p.id, () => void chooseProfile(p.id), () => confirmDelete(p.id, p.name)))}
      </View>
      <View style={styles.row}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={strings.profileName}
          accessibilityLabel={strings.profileName}
          maxLength={60}
          style={styles.input}
          onSubmitEditing={saveAsProfile}
          returnKeyType="done"
        />
        <Pressable onPress={saveAsProfile} accessibilityRole="button" style={[styles.chip, styles.chipOn]} disabled={!name.trim()}>
          <Text style={[styles.chipText, styles.chipTextOn]}>{strings.profileSave}</Text>
        </Pressable>
      </View>
      <Text style={styles.help}>{strings.profilesHelp}</Text>
      <Text style={styles.editing}>
        {strings.editing}: {active ? strings.editingProfile(active.name) : strings.editingAll}
      </Text>
      {sections.map((section) => (
        <View key={section.group} style={styles.group}>
          <Text style={styles.section}>{strings.groups[section.group] ?? section.group}</Text>
          {section.rows.map(draw)}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  group: { gap: 6 },
  section: { fontSize: 13, fontWeight: "600", textTransform: "uppercase", opacity: 0.6, marginTop: 12 },
  editing: { fontSize: 14, fontWeight: "600", marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48 },
  block: { gap: 8, paddingVertical: 4 },
  labelWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  label: { fontSize: 16 },
  reset: { fontSize: 14, color: ACCENT, textDecorationLine: "underline" },
  value: { minWidth: 72, textAlign: "center", fontSize: 15 },
  step: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 22 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: "#8888", justifyContent: "center" },
  chipOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { fontSize: 14 },
  chipTextOn: { color: "#fff", fontWeight: "600" },
  input: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: "#8888", borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
  help: { fontSize: 14, opacity: 0.7, lineHeight: 20 },
});
