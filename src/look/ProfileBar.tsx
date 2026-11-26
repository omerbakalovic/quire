import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { t } from "@/i18n";
import { chooseProfile, copyProfile, refreshProfile, removeProfile, renameProfile, restoreProfile, saveProfile } from "@/library/store";
import { useChrome } from "@/reader/chrome";
import { currentProfileValues, profileIdFor, type Customization } from "@/settings/customization";

type Props = {
  custom: Customization;
  /** A short message, with an Undo when one is given. */
  onNotice: (text: string, undo?: () => void) => void;
};

/**
 * The editor's profile row (docs/customization-roadmap.md, C1): one tap
 * switches, "+ New" saves what is in use now, and a long press opens rename,
 * duplicate, update and delete (with Undo).
 */
export function ProfileBar({ custom, onNotice }: Props) {
  const c = useChrome();
  const strings = t().look;
  const [naming, setNaming] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [rename, setRename] = useState("");
  const active = custom.activeProfile;
  const menuProfile = custom.profiles.find((p) => p.id === menuFor) ?? null;

  const chip = (key: string, text: string, on: boolean, onPress: () => void, onLongPress?: () => void) => (
    <Pressable
      key={key}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityHint={onLongPress ? strings.profileHint : undefined}
      style={[styles.chip, { borderColor: c.line }, on && { backgroundColor: c.accent, borderColor: c.accent }]}
    >
      <Text style={[styles.chipText, { color: on ? c.onAccent : c.ink }, on && styles.bold]} numberOfLines={1}>
        {text}
      </Text>
    </Pressable>
  );

  function create() {
    const name = (naming ?? "").trim();
    setNaming(null);
    if (!name) return;
    if (custom.profiles.length >= 50) {
      onNotice(strings.profileFull);
      return;
    }
    const id = profileIdFor(custom, name);
    void saveProfile(id, name, currentProfileValues(custom)).then(() => chooseProfile(id));
  }

  function openMenu(id: string) {
    const profile = custom.profiles.find((p) => p.id === id);
    if (!profile) return;
    setRename(profile.name);
    setMenuFor(id);
  }

  function remove() {
    if (!menuProfile) return;
    const index = custom.profiles.findIndex((p) => p.id === menuProfile.id);
    const wasActive = active === menuProfile.id;
    const profile = menuProfile;
    setMenuFor(null);
    void removeProfile(profile.id);
    onNotice(strings.profileDeleted(profile.name), () => void restoreProfile(profile, index, wasActive));
  }

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
        {chip("none", strings.profileNone, active === null, () => void chooseProfile(null))}
        {custom.profiles.map((p) => chip(p.id, p.name, active === p.id, () => void chooseProfile(p.id), () => openMenu(p.id)))}
        {naming === null ? chip("new", strings.profileNew, false, () => setNaming("")) : null}
      </ScrollView>
      {naming !== null ? (
        <View style={styles.row}>
          <TextInput
            autoFocus
            value={naming}
            onChangeText={setNaming}
            placeholder={strings.profileName}
            placeholderTextColor={c.muted}
            accessibilityLabel={strings.profileName}
            maxLength={60}
            onSubmitEditing={create}
            returnKeyType="done"
            style={[styles.input, { color: c.ink, borderColor: c.line }]}
          />
          {chip("create", strings.profileCreate, true, create)}
          <Pressable onPress={() => setNaming(null)} accessibilityRole="button" hitSlop={8}>
            <Text style={[styles.link, { color: c.accent }]}>{t().customize.cancel}</Text>
          </Pressable>
        </View>
      ) : null}
      <Modal visible={menuProfile !== null} transparent animationType="fade" onRequestClose={() => setMenuFor(null)}>
        <Pressable style={[styles.scrim, { backgroundColor: c.shade }]} onPress={() => setMenuFor(null)} accessibilityLabel={strings.done}>
          <Pressable style={[styles.sheet, { backgroundColor: c.panel }]} onPress={() => undefined}>
            {menuProfile ? (
              <>
                <Text style={[styles.title, { color: c.ink }]} accessibilityRole="header">
                  {strings.profileMenu(menuProfile.name)}
                </Text>
                <View style={styles.row}>
                  <TextInput
                    value={rename}
                    onChangeText={setRename}
                    accessibilityLabel={strings.profileName}
                    maxLength={60}
                    style={[styles.input, { color: c.ink, borderColor: c.line }]}
                    onSubmitEditing={() => void renameProfile(menuProfile.id, rename)}
                    returnKeyType="done"
                  />
                  {chip("rename", strings.profileRename, true, () => {
                    void renameProfile(menuProfile.id, rename);
                    setMenuFor(null);
                  })}
                </View>
                <Pressable
                  style={styles.action}
                  accessibilityRole="button"
                  onPress={() => {
                    setMenuFor(null);
                    void copyProfile(menuProfile.id, strings.profileCopyName(menuProfile.name)).then((id) => (id ? undefined : onNotice(strings.profileFull)));
                  }}
                >
                  <Text style={[styles.actionText, { color: c.ink }]}>{strings.profileDuplicate}</Text>
                </Pressable>
                <Pressable
                  style={styles.action}
                  accessibilityRole="button"
                  onPress={() => {
                    setMenuFor(null);
                    void refreshProfile(menuProfile.id);
                    onNotice(strings.profileUpdated(menuProfile.name));
                  }}
                >
                  <Text style={[styles.actionText, { color: c.ink }]}>{strings.profileUpdate}</Text>
                  <Text style={[styles.help, { color: c.muted }]}>{strings.profileUpdateHelp}</Text>
                </Pressable>
                <Pressable style={styles.action} accessibilityRole="button" onPress={remove}>
                  <Text style={[styles.actionText, styles.bold, { color: c.accent }]}>{strings.profileDelete}</Text>
                </Pressable>
                <Pressable style={styles.action} accessibilityRole="button" onPress={() => setMenuFor(null)}>
                  <Text style={[styles.actionText, { color: c.muted }]}>{strings.done}</Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  chips: { flexDirection: "row", gap: 8, paddingRight: 8 },
  chip: { minHeight: 40, maxWidth: 200, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, justifyContent: "center" },
  chipText: { fontSize: 14 },
  bold: { fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
  link: { fontSize: 15, paddingHorizontal: 4 },
  scrim: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 32, gap: 6 },
  title: { fontSize: 18, fontWeight: "700", marginBottom: 6 },
  action: { minHeight: 48, justifyContent: "center", paddingVertical: 6 },
  actionText: { fontSize: 16 },
  help: { fontSize: 13, lineHeight: 18, marginTop: 2 },
});
