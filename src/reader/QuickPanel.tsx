import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { t } from "@/i18n";
import { stepValue } from "@/settings/customize";
import { FONT_CHOICES, fontLabel, type UserFont } from "@/settings/fonts";
import { ALIGNMENTS, THEME_IDS, type Resolved, type SettingKey } from "@/settings/registry";
import { THEMES, type ThemeTokens } from "@/settings/themes";

export type Scope = "global" | "book";

type Props = {
  settings: Resolved;
  chrome: ThemeTokens;
  scope: Scope;
  /** Keys this book overrides, to mark them. */
  overridden: ReadonlySet<SettingKey>;
  bottomInset: number;
  /** Fonts the reader imported, listed after the built-in ones. */
  userFonts: readonly UserFont[];
  onAddFont: () => void;
  onRemoveFont: (font: UserFont) => void;
  onScope: (scope: Scope) => void;
  onChange: (key: SettingKey, value: number | string | boolean) => void;
  onReset: () => void;
  onClose: () => void;
};

/**
 * The reader's quick panel (Aa): the settings people change while reading.
 * Every change applies live; the scope switch decides whether it is saved for
 * all books or only this one.
 */
export function QuickPanel({ settings, chrome, scope, overridden, bottomInset, userFonts, onAddFont, onRemoveFont, onScope, onChange, onReset, onClose }: Props) {
  const strings = t().book;
  const ink = { color: chrome.chromeInk };
  const muted = { color: chrome.chromeInk, opacity: 0.7 };

  const step = (key: SettingKey, dir: 1 | -1) => {
    const next = stepValue(key, settings[key] as number, dir);
    if (next !== null) onChange(key, next);
  };

  const mark = (key: SettingKey) => (scope === "book" && overridden.has(key) ? " •" : "");

  const stepper = (label: string, key: SettingKey, shown: string) => (
    <View style={styles.row}>
      <Text style={[styles.label, ink]}>
        {label}
        {mark(key)}
      </Text>
      <Pressable onPress={() => step(key, -1)} style={styles.stepButton} accessibilityRole="button" accessibilityLabel={strings.decrease(label)}>
        <Text style={[styles.stepText, ink]}>−</Text>
      </Pressable>
      <Text style={[styles.value, ink]}>{shown}</Text>
      <Pressable onPress={() => step(key, 1)} style={styles.stepButton} accessibilityRole="button" accessibilityLabel={strings.increase(label)}>
        <Text style={[styles.stepText, ink]}>+</Text>
      </Pressable>
    </View>
  );

  const chips = (label: string, key: SettingKey, options: readonly string[], names: Record<string, string>) => (
    <View style={styles.block}>
      <Text style={[styles.label, ink]}>
        {label}
        {mark(key)}
      </Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const on = settings[key] === option;
          return (
            <Pressable
              key={option}
              onPress={() => onChange(key, option)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.chip, { borderColor: chrome.chromeInk }, on && { backgroundColor: chrome.accent, borderColor: chrome.accent }]}
            >
              <Text style={[styles.chipText, ink, on && { color: chrome.page }]}>{names[option] ?? option}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const chip = (key: string, text: string, on: boolean, onPress: () => void, extra?: { onLongPress?: () => void; hint?: string }) => (
    <Pressable
      key={key}
      onPress={onPress}
      onLongPress={extra?.onLongPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityHint={extra?.hint}
      style={[styles.chip, { borderColor: chrome.chromeInk }, on && { backgroundColor: chrome.accent, borderColor: chrome.accent }]}
    >
      <Text style={[styles.chipText, ink, on && { color: chrome.page }]}>{text}</Text>
    </Pressable>
  );

  const font = settings["type.fontFamily"];
  const fontRow = (
    <View style={styles.block}>
      <Text style={[styles.label, ink]}>
        {strings.lookFont}
        {mark("type.fontFamily")}
      </Text>
      <View style={styles.chips}>
        {FONT_CHOICES.map((id) => chip(id, fontLabel(id, strings.fonts), font === id, () => onChange("type.fontFamily", id)))}
        {userFonts.map((f) =>
          chip(f.id, f.label, font === f.id, () => onChange("type.fontFamily", f.id), { onLongPress: () => onRemoveFont(f), hint: strings.fontRemoveHint }),
        )}
        {chip("add", `+ ${strings.fontAdd}`, false, onAddFont, { hint: strings.fontAddHint })}
      </View>
    </View>
  );

  const lineHeight = settings["type.lineHeight"];
  return (
    <View style={styles.shade}>
      <Pressable style={styles.rest} onPress={onClose} accessibilityLabel={strings.lookClose} />
      <View style={[styles.sheet, { backgroundColor: chrome.chrome, paddingBottom: bottomInset + 12 }]}>
        <View style={styles.header}>
          <Text style={[styles.title, ink]} accessibilityRole="header">
            {strings.look}
          </Text>
          <Pressable onPress={onReset} accessibilityRole="button" hitSlop={8}>
            <Text style={[styles.link, { color: chrome.accent }]}>{strings.lookReset}</Text>
          </Pressable>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={strings.lookClose} hitSlop={12}>
            <Text style={[styles.close, ink]}>✕</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.block}>
            <Text style={[styles.label, ink]}>{strings.lookScope}</Text>
            <View style={styles.chips}>
              {(["global", "book"] as const).map((option) => {
                const on = scope === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => onScope(option)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[styles.chip, { borderColor: chrome.chromeInk }, on && { backgroundColor: chrome.accent, borderColor: chrome.accent }]}
                  >
                    <Text style={[styles.chipText, ink, on && { color: chrome.page }]}>{option === "global" ? strings.scopeAll : strings.scopeBook}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {stepper(strings.lookSize, "type.fontSize", `${settings["type.fontSize"]}%`)}
          {fontRow}
          <View style={styles.block}>
            <Text style={[styles.label, ink]}>
              {strings.lookTheme}
              {mark("theme.id")}
            </Text>
            <View style={styles.chips}>
              {THEME_IDS.map((id) => {
                const theme = THEMES[id];
                const on = settings["theme.id"] === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => onChange("theme.id", id)}
                    accessibilityRole="button"
                    accessibilityLabel={strings.themes[id]}
                    accessibilityState={{ selected: on }}
                    style={[styles.swatch, { backgroundColor: theme.page, borderColor: on ? chrome.accent : theme.inkMuted }, on && styles.swatchOn]}
                  >
                    <Text style={[styles.swatchText, { color: theme.ink }]}>Aa</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {stepper(strings.lookBrightness, "light.brightness", settings["light.brightness"] > 0 ? `${Math.round(settings["light.brightness"] * 100)}%` : strings.system)}
          {stepper(strings.lookDimmer, "light.dimmer", settings["light.dimmer"] > 0 ? `${Math.round(settings["light.dimmer"] * 100)}%` : strings.off)}
          {stepper(strings.lookWarmth, "light.warmth", settings["light.warmth"] > 0 ? `${Math.round(settings["light.warmth"] * 100)}%` : strings.off)}
          {stepper(strings.lookSpacing, "type.lineHeight", lineHeight > 0 ? lineHeight.toFixed(2) : strings.bookDefault)}
          {stepper(strings.lookMargins, "page.marginX", `${settings["page.marginX"]}%`)}
          {chips(strings.lookAlign, "type.alignment", ALIGNMENTS, strings.aligns)}
          <View style={styles.row}>
            <Text style={[styles.label, styles.grow, ink]}>
              {strings.lookHyphens}
              {mark("type.hyphenation")}
            </Text>
            <Switch value={settings["type.hyphenation"]} onValueChange={(value) => onChange("type.hyphenation", value)} />
          </View>
          <View style={styles.row}>
            <Text style={[styles.label, styles.grow, ink]}>
              {strings.lookPublisher}
              {mark("type.publisherStyles")}
            </Text>
            <Switch value={settings["type.publisherStyles"]} onValueChange={(value) => onChange("type.publisherStyles", value)} />
          </View>
          <Text style={[styles.hint, muted]}>{strings.themes[settings["theme.id"]]}</Text>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shade: { ...StyleSheet.absoluteFill, justifyContent: "flex-end" },
  rest: { flex: 1 },
  sheet: { maxHeight: "70%", borderTopLeftRadius: 14, borderTopRightRadius: 14, paddingTop: 10 },
  header: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 16, paddingBottom: 6 },
  title: { flex: 1, fontSize: 17, fontWeight: "600" },
  link: { fontSize: 15 },
  close: { fontSize: 18, padding: 4 },
  body: { paddingHorizontal: 16, gap: 14, paddingBottom: 8 },
  block: { gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  grow: { flex: 1 },
  label: { fontSize: 14, minWidth: 96 },
  value: { minWidth: 64, textAlign: "center", fontSize: 15 },
  stepButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  stepText: { fontSize: 22 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, justifyContent: "center" },
  chipText: { fontSize: 14 },
  swatch: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  swatchOn: { borderWidth: 3 },
  swatchText: { fontSize: 15, fontWeight: "600" },
  hint: { fontSize: 12 },
});
