import { Pressable, StyleSheet, Text, View } from "react-native";

import { t } from "@/i18n";
import { ThemedSwitch } from "@/ui/ThemedSwitch";
import { saveSettingsIn } from "@/library/store";
import { chromeFor, useChrome } from "@/reader/chrome";
import { confirmRemoveFont, pickFont } from "@/reader/font-import";
import { appThemeId, type Customization } from "@/settings/customization";
import { formatNumber, sectionsFor, type Row } from "@/settings/customize";
import { fontLabel } from "@/settings/fonts";
import { barsUnreachable } from "@/settings/gestures";
import { resolve, type LayerValues } from "@/settings/layers";
import { LAYOUT_PRESETS, presetOf, presetValues } from "@/settings/layout";
import { layerOf, originOf, PINNED, TAB_GROUPS, type Origin, type Tab, type Target } from "@/settings/look-editor";
import { CONTROL_SLOTS, type SettingKey } from "@/settings/registry";
import { shelfInk, shelfOf } from "@/settings/shelf";
import { contrast, themeFor } from "@/settings/themes";

import { SettingSlider } from "./SettingSlider";

type Props = {
  tab: Tab;
  layers: LayerValues;
  target: Target;
  custom: Customization;
  bookId: string | null;
  onChange: (key: SettingKey, value: number | string | boolean | readonly string[] | null) => void;
};

/**
 * One tab of Reading Look: every setting of its groups that the target layer
 * may hold, generated from the registry, with where each value comes from.
 */
export function SettingRows({ tab, layers, target, custom, bookId, onChange }: Props) {
  const c = useChrome();
  const strings = t().customize;
  const look = t().look;
  const book = t().book;
  const layer = layerOf(target);
  const groups = TAB_GROUPS[tab];
  const sections = sectionsFor(layers, layer, custom.fonts, custom.themes).filter((s) => groups.includes(s.group));
  const resolved = resolve(layers);
  const profileName = custom.profiles.find((p) => p.id === custom.activeProfile)?.name ?? "";
  const presetNow = presetOf(resolved);

  const originText = (origin: Origin): string | null => {
    if (origin.kind === "here") return look.origin.here;
    if (origin.kind === "above") return origin.source === "book" ? look.origin.book : look.origin.profile(profileName);
    if (origin.source === "global") return look.origin.global;
    if (origin.source === "profile") return look.origin.profileBelow(profileName);
    return null;
  };

  const chip = (key: string, text: string, on: boolean, onPress: () => void, onLongPress?: () => void, hint?: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityHint={hint}
      style={[styles.chip, { borderColor: c.line }, on && { backgroundColor: c.accent, borderColor: c.accent }]}
    >
      <Text style={[styles.chipText, { color: on ? c.onAccent : c.ink }, on && styles.bold]}>{text}</Text>
    </Pressable>
  );

  const label = (row: Row, withName = true) => {
    const name = strings.names[row.key] ?? row.key;
    const origin = originOf(layers, target, row.key);
    const text = originText(origin);
    return (
      <View style={styles.labelWrap}>
        {withName ? <Text style={[styles.label, { color: c.ink }]}>{name}</Text> : null}
        {text ? <Text style={[styles.origin, { color: origin.kind === "above" ? c.accent : c.muted }]}>{text}</Text> : null}
        {row.set ? (
          <Pressable onPress={() => onChange(row.key, null)} accessibilityRole="button" accessibilityLabel={strings.resetLabel(name)} hitSlop={8}>
            <Text style={[styles.reset, { color: c.accent }]}>{strings.reset}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const choiceName = (key: SettingKey, option: string): string => {
    if (key === "type.fontFamily") return fontLabel(option, book.fonts, custom.fonts);
    if (key === "theme.id" || key === "app.theme") {
      if (option === "follow") return strings.appThemeFollow;
      return (book.themes as Record<string, string>)[option] ?? custom.themes.find((u) => u.id === option)?.name ?? option;
    }
    if (key === "theme.bookColors") return strings.bookColors[option as "auto"] ?? option;
    if (key === "type.alignment") return book.aligns[option] ?? option;
    if (key === "turn.style") return strings.turns[option] ?? option;
    if (key.startsWith("gesture.")) return strings.actions[option] ?? option;
    if (key.startsWith("bar.")) return strings.barChoices[option] ?? option;
    if (key.startsWith("library.")) return strings.shelfChoices[option] ?? option;
    return option;
  };

  const numberWords = { system: book.system, off: book.off, bookDefault: book.bookDefault };

  const draw = (row: Row) => {
    const title = strings.names[row.key] ?? row.key;
    if (row.kind === "boolean") {
      return (
        <View key={row.key} style={styles.row}>
          {label(row)}
          <ThemedSwitch value={row.value} onValueChange={(value) => onChange(row.key, value)} accessibilityLabel={title} />
        </View>
      );
    }
    if (row.kind === "number") {
      return (
        <View key={row.key} style={styles.block}>
          <SettingSlider settingKey={row.key} label={title} value={row.value} format={(v) => formatNumber(row.key, v, numberWords)} onChange={(v) => onChange(row.key, v)} />
          {label(row, false)}
        </View>
      );
    }
    if (row.kind === "elements") {
      const toggle = (element: string) => {
        const next = row.value.includes(element) ? row.value.filter((e) => e !== element) : [...row.value, element];
        if (next.length <= row.max) onChange(row.key, next);
      };
      const names = (CONTROL_SLOTS as readonly string[]).includes(row.key) ? strings.controls : strings.elements;
      return (
        <View key={row.key} style={styles.block}>
          {label(row)}
          <View style={styles.chips}>
            {row.catalog.map((element) => {
              const at = row.value.indexOf(element);
              const text = `${at >= 0 && row.value.length > 1 ? `${at + 1}. ` : ""}${names[element] ?? element}`;
              return chip(element, text, at >= 0, () => toggle(element));
            })}
          </View>
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
            return chip(
              option,
              choiceName(row.key, option),
              row.value === option,
              () => onChange(row.key, option),
              imported ? () => confirmRemoveFont(imported, c) : undefined,
              imported ? book.fontRemoveHint : undefined,
            );
          })}
          {fonts ? chip("add", `+ ${book.fontAdd}`, false, () => void pickFont((font) => onChange(row.key, font.id), c), undefined, book.fontAddHint) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      {tab === "colours" ? <Text style={[styles.help, { color: c.muted }]}>{look.coloursHelp}</Text> : null}
      {tab === "library" ? <Text style={[styles.help, { color: c.muted }]}>{strings.libraryHelp}</Text> : null}
      {tab === "library" && faintPills(resolved, custom) ? (
        // Emulator run 40: the theme's pill colour with fixed light text was unreadable on Light.
        <Text style={[styles.help, styles.bold, { color: c.accent }]}>{strings.libraryFaint}</Text>
      ) : null}
      {sections.map((section) => {
        // The theme itself is chosen in the theme list above (ThemeEditor) and the pinned row.
        const rows = section.rows.filter((row) => !PINNED.includes(row.key));
        // The Bars tab edits the layout in its own editor, as a draft.
        if (tab === "bars" && section.group === "layout") return null;
        if (rows.length === 0) return null;
        return (
          <View key={section.group} style={styles.group}>
            {groups.length > 1 || section.group === "layout" ? (
              <Text style={[styles.section, { color: c.muted }]} accessibilityRole="header">
                {strings.groups[section.group] ?? section.group}
              </Text>
            ) : null}
            {section.group === "layout" ? (
              <>
                <Text style={[styles.help, { color: c.muted }]}>{strings.layoutHelp}</Text>
                <View style={styles.chips}>
                  {LAYOUT_PRESETS.map((preset) =>
                    chip(preset, strings.layoutPresets[preset] ?? preset, presetNow === preset, () => void saveSettingsIn(layer, presetValues(preset), bookId)),
                  )}
                  {presetNow === null ? chip("custom", strings.layoutCustom, true, () => undefined) : null}
                </View>
              </>
            ) : null}
            {section.group === "gestures" ? (
              <>
                <Text style={[styles.help, { color: c.muted }]}>{strings.gesturesHelp}</Text>
                {barsUnreachable(resolved) ? <Text style={[styles.help, styles.bold, { color: c.accent }]}>{strings.gesturesNoBars}</Text> : null}
              </>
            ) : null}
            {section.group === "barStyle" && (resolved["bar.top.background"] === "none" || resolved["bar.bottom.background"] === "none") ? (
              // Emulator run 35: with no background, a bar's text sits on the book's text.
              <Text style={[styles.help, { color: c.muted }]}>{strings.barNoneHelp}</Text>
            ) : null}
            {rows.map(draw)}
          </View>
        );
      })}
    </View>
  );
}

/** Fixed pill text on the theme's pill colour that reads under 3:1. Cover colours vary per book, so only this case is known ahead. */
function faintPills(resolved: ReturnType<typeof resolve>, custom: Customization): boolean {
  const shelf = shelfOf(resolved);
  if (!shelf.pills || shelf.ink === "auto" || shelf.colour !== "theme") return false;
  const pill = chromeFor(themeFor(appThemeId(custom), custom.themes)).pillDefault;
  const ratio = contrast(shelfInk(shelf, pill), pill.slice(0, 7));
  return ratio !== null && ratio < 3;
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  group: { gap: 8 },
  section: { fontSize: 13, fontWeight: "600", textTransform: "uppercase", marginTop: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 48 },
  block: { gap: 6, paddingVertical: 4 },
  labelWrap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  label: { fontSize: 16 },
  origin: { fontSize: 13 },
  reset: { fontSize: 14, textDecorationLine: "underline" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, justifyContent: "center" },
  chipText: { fontSize: 14 },
  bold: { fontWeight: "600" },
  help: { fontSize: 14, lineHeight: 20 },
});
