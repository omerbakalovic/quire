import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { findBook } from "@/domain/library";
import { t } from "@/i18n";
import { getLibrary, loadLibrary, revertCustomization, saveSetting, useLibrary } from "@/library/store";
import { PreviewPane } from "@/look/PreviewPane";
import { ProfileBar } from "@/look/ProfileBar";
import { SettingRows } from "@/look/SettingRows";
import { SettingSlider } from "@/look/SettingSlider";
import { ChromeProvider, chromeFor } from "@/reader/chrome";
import { changedSince, resolvedFor, type Customization } from "@/settings/customization";
import { formatNumber } from "@/settings/customize";
import { defaultTarget, editorLayers, isTab, layerOf, MIN_SETTINGS_HEIGHT, originOf, previewHeight, TABS, targetsFor, validTarget, type Tab, type Target } from "@/settings/look-editor";
import { THEME_IDS, type SettingKey } from "@/settings/registry";
import { THEMES, themeFor } from "@/settings/themes";

/**
 * Reading Look (docs/customization-roadmap.md, C1): the one editor for the
 * reading look, from Settings or from Aa in a book. The top stays put:
 * profiles, text size, theme, and where changes are saved, with Revert.
 * Everything else is in tabs. Opened from a book, the book stays open under
 * this screen and follows every change; Back returns to the same place.
 */
export default function LookScreen() {
  const params = useLocalSearchParams<{ book?: string; tab?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const library = useLibrary();
  const custom = library.custom;
  const bookId = typeof params.book === "string" && findBook(library, params.book) ? params.book : null;
  const book = bookId ? findBook(library, bookId) : null;
  const strings = t().look;
  const words = t().book;

  // Revert goes back to the saved state from when the editor opened (roadmap 2.6).
  const snapshot = useRef<Customization>(getLibrary().custom);
  const touched = useRef(false);
  useEffect(() => {
    void loadLibrary().then(() => {
      if (!touched.current) snapshot.current = getLibrary().custom;
    });
  }, []);

  const window = useWindowDimensions();
  const [preview, setPreview] = useState(true);
  // Heights of the screen and of everything fixed above the settings list, so the preview never squeezes the list out.
  const [heights, setHeights] = useState({ screen: 0, top: 0, toggle: 0, tabs: 0 });
  const measure = (part: keyof typeof heights) => (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    // The screen is measured without the keyboard, so the top doesn't move between fixed and scrolling while typing.
    if (part === "screen" && Keyboard.isVisible()) return;
    setHeights((old) => (old[part] === height ? old : { ...old, [part]: height }));
  };
  const free = heights.screen > 0 ? heights.screen - heights.top - heights.toggle - heights.tabs : null;
  const pinTop = free === null || free >= MIN_SETTINGS_HEIGHT;
  // The keyboard folds the preview away (kept loaded) so the field being typed into stays in view.
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () => setKeyboard(true));
    const hidden = Keyboard.addListener("keyboardDidHide", () => setKeyboard(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  const paneHeight = previewHeight(window, free);
  const [tab, setTab] = useState<Tab>(isTab(params.tab) ? params.tab : "text");
  const [chosen, setTarget] = useState<Target>(() => defaultTarget(custom, bookId));
  const target = validTarget(custom, bookId, chosen);
  const layers = useMemo(() => editorLayers(custom, bookId), [custom, bookId]);
  const settings = useMemo(() => resolvedFor(custom, bookId), [custom, bookId]);
  const theme = themeFor(settings["theme.id"]);
  const chrome = chromeFor(theme);
  const profile = custom.profiles.find((p) => p.id === custom.activeProfile) ?? null;
  const changed = changedSince(custom, snapshot.current);

  const [notice, setNotice] = useState<{ text: string; undo?: () => void } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = (text: string, undo?: () => void) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ text, undo });
    noticeTimer.current = setTimeout(() => setNotice(null), 5000);
  };
  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  const change = (key: SettingKey, value: number | string | boolean | readonly string[] | null) => {
    touched.current = true;
    void saveSetting(layerOf(target), key, value, bookId);
  };

  const revert = () => {
    void revertCustomization(snapshot.current);
    showNotice(strings.reverted);
  };

  const targetName = (option: Target) =>
    option === "profile" ? strings.target.profile(profile?.name ?? "") : option === "book" ? strings.target.book : strings.target.global;
  const help =
    target === "profile" ? strings.targetHelp.profile(profile?.name ?? "") : target === "book" ? strings.targetHelp.book(book?.title ?? "") : strings.targetHelp.global;
  const bookOverrides = bookId && target !== "book" ? Object.keys(custom.books[bookId] ?? {}).length : 0;

  const chip = (key: string, text: string, on: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.chip, { borderColor: chrome.line }, on && { backgroundColor: chrome.accent, borderColor: chrome.accent }]}
    >
      <Text style={[styles.chipText, { color: on ? chrome.onAccent : chrome.ink }, on && styles.bold]} numberOfLines={1}>
        {text}
      </Text>
    </Pressable>
  );

  const sizeOrigin = originOf(layers, target, "type.fontSize");
  const themeOrigin = originOf(layers, target, "theme.id");
  // The pinned controls have no row in the tabs, so their reset lives here.
  const note = (origin: ReturnType<typeof originOf>, key: SettingKey, name: string) => {
    if (origin.kind === "above") {
      return <Text style={[styles.small, { color: chrome.accent }]}>{origin.source === "book" ? strings.origin.book : strings.origin.profile(profile?.name ?? "")}</Text>;
    }
    if (origin.kind !== "here") return null;
    return (
      <View style={styles.noteRow}>
        <Text style={[styles.small, { color: chrome.muted }]}>{strings.origin.hereNamed(name)}</Text>
        <Pressable onPress={() => change(key, null)} accessibilityRole="button" accessibilityLabel={t().customize.resetLabel(name)} hitSlop={8}>
          <Text style={[styles.small, styles.underline, { color: chrome.accent }]}>{t().customize.reset}</Text>
        </Pressable>
      </View>
    );
  };

  // The top: fixed while the settings list keeps room under it, so a quick change is Aa → change → Back.
  // In a short window (a landscape phone) it scrolls with the list instead (emulator run 19).
  const fixedTop = (
    <View style={[styles.top, !pinTop && styles.topInList, { borderBottomColor: chrome.line }]} onLayout={measure("top")}>
      <ProfileBar custom={custom} onNotice={showNotice} />
      <SettingSlider
        settingKey="type.fontSize"
        label={strings.textSize}
        value={settings["type.fontSize"]}
        format={(v) => formatNumber("type.fontSize", v, { system: words.system, off: words.off, bookDefault: words.bookDefault })}
        onChange={(v) => change("type.fontSize", v)}
        compact
      />
      {note(sizeOrigin, "type.fontSize", strings.textSize)}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatches}>
        {THEME_IDS.map((id) => {
          const swatch = THEMES[id];
          const on = settings["theme.id"] === id;
          return (
            <Pressable
              key={id}
              onPress={() => change("theme.id", id)}
              accessibilityRole="button"
              accessibilityLabel={`${strings.theme}: ${words.themes[id]}`}
              accessibilityState={{ selected: on }}
              style={[styles.swatch, { backgroundColor: swatch.page, borderColor: on ? chrome.accent : swatch.inkMuted }, on && styles.swatchOn]}
            >
              <Text style={[styles.swatchText, { color: swatch.ink }]}>Aa</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {note(themeOrigin, "theme.id", strings.theme)}
      <View style={styles.targetRow}>
        <Text style={[styles.small, { color: chrome.muted }]}>{strings.savingTo}</Text>
        {/* Wraps rather than scrolls, so "This book" is never hidden off the edge (phone run 16). */}
        <View style={[styles.chips, styles.wrap]}>
          {targetsFor(custom, bookId).map((option) => chip(option, targetName(option), option === target, () => setTarget(option)))}
        </View>
      </View>
    </View>
  );

  return (
    <ChromeProvider chrome={chrome}>
      <View style={[styles.screen, { backgroundColor: chrome.panel }]} onLayout={measure("screen")}>
        <Stack.Screen
          options={{
            title: strings.title,
            headerStyle: { backgroundColor: chrome.panel },
            headerTintColor: chrome.ink,
            headerRight: () => (
              <View style={styles.headerRight}>
                {changed ? (
                  <Pressable onPress={revert} accessibilityRole="button" accessibilityLabel={strings.revertLabel} hitSlop={8}>
                    <Text style={[styles.headerLink, { color: chrome.accent }]}>{strings.revert}</Text>
                  </Pressable>
                ) : null}
                {bookId ? (
                  <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={strings.close} hitSlop={8}>
                    <Text style={[styles.headerLink, { color: chrome.ink }]}>✕</Text>
                  </Pressable>
                ) : null}
              </View>
            ),
          }}
        />
        {pinTop ? fixedTop : null}
        {/* The live sample page (roadmap C2): the real reader page with the sample chapter. */}
        <Pressable
          onPress={() => setPreview((v) => !v)}
          disabled={paneHeight === 0}
          onLayout={measure("toggle")}
          accessibilityRole="button"
          style={[styles.previewToggle, { borderBottomColor: chrome.line }]}
        >
          <Text style={[styles.small, { color: chrome.muted }]}>
            {paneHeight === 0 ? strings.previewNoRoom : preview ? `${strings.previewHide} ▴` : `${strings.previewShow} ▾`}
          </Text>
        </Pressable>
        {preview && paneHeight > 0 ? (
          <View style={{ height: keyboard ? 0 : paneHeight }}>
            <PreviewPane settings={settings} fonts={custom.fonts} />
          </View>
        ) : null}
        <View style={[styles.tabs, { borderBottomColor: chrome.line }]} accessibilityRole="tablist" onLayout={measure("tabs")}>
          {TABS.map((option) => (
            <Pressable
              key={option}
              onPress={() => setTab(option)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === option }}
              style={[styles.tab, tab === option && { borderBottomColor: chrome.accent }]}
            >
              <Text style={[styles.tabText, { color: tab === option ? chrome.ink : chrome.muted }, tab === option && styles.bold]} numberOfLines={1}>
                {strings.tabs[option]}
              </Text>
            </Pressable>
          ))}
        </View>
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 48 }]} keyboardShouldPersistTaps="handled">
          {pinTop ? null : fixedTop}
          <Text style={[styles.small, { color: chrome.muted }]}>{help}</Text>
          {bookOverrides > 0 ? (
            <Pressable onPress={() => setTarget("book")} accessibilityRole="button">
              <Text style={[styles.small, { color: chrome.accent }]}>
                {strings.bookOverrides(bookOverrides)} {strings.editBook} ›
              </Text>
            </Pressable>
          ) : null}
          <SettingRows tab={tab} layers={layers} target={target} custom={custom} bookId={bookId} onChange={change} />
        </ScrollView>
        {notice ? (
          <View style={[styles.notice, { bottom: insets.bottom + 16, backgroundColor: chrome.ink }]}>
            <Text style={[styles.noticeText, { color: chrome.panel }]}>{notice.text}</Text>
            {notice.undo ? (
              <Pressable
                onPress={() => {
                  notice.undo?.();
                  setNotice(null);
                }}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={[styles.noticeText, styles.bold, { color: chrome.panel }]}>{strings.undo}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </ChromeProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 6, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 18 },
  headerLink: { fontSize: 16, fontWeight: "600" },
  chips: { flexDirection: "row", gap: 8, alignItems: "center" },
  chip: { minHeight: 36, maxWidth: 220, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, justifyContent: "center" },
  chipText: { fontSize: 14 },
  bold: { fontWeight: "600" },
  small: { fontSize: 13, lineHeight: 18 },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  underline: { textDecorationLine: "underline" },
  swatches: { flexDirection: "row", gap: 10, paddingVertical: 2 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  swatchOn: { borderWidth: 3 },
  swatchText: { fontSize: 14, fontWeight: "600" },
  targetRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  wrap: { flex: 1, flexWrap: "wrap" },
  previewToggle: { minHeight: 32, alignItems: "center", justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  tabs: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText: { fontSize: 13 },
  body: { padding: 16, gap: 10 },
  topInList: { marginHorizontal: -16, marginTop: -16 },
  notice: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 14, borderRadius: 10 },
  noticeText: { fontSize: 15, flexShrink: 1 },
});
