import { type ComponentRef, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { t } from "@/i18n";
import { rememberColour, removeUserTheme, restoreUserTheme } from "@/library/store";
import { useChrome } from "@/reader/chrome";
import type { Customization } from "@/settings/customization";
import { THEME_IDS } from "@/settings/registry";
import {
  ALPHA_TOKENS,
  BACKGROUND_OF,
  draftTokens,
  duplicateDraft,
  renameDraft,
  resetDraftToken,
  setDraftDark,
  setDraftToken,
  startDraft,
  swatchesFor,
  TOKEN_GROUPS,
  type Draft,
  type TokenKey,
} from "@/settings/theme-editor";
import { contrastFlags, isBuiltInTheme, themeFor, withAlpha, type ContrastFlag, type ThemeId, type ThemeTokens } from "@/settings/themes";
import { MAX_USER_THEMES } from "@/settings/user-themes";
import { confirm } from "@/ui/confirm";
import { ThemedSwitch } from "@/ui/ThemedSwitch";

import { ColorPicker, MIN_SQUARE } from "./ColorPicker";

export type ViewRef = ComponentRef<typeof View>;

type Props = {
  custom: Customization;
  /** The theme in use where Reading Look is saving. */
  current: string;
  draft: Draft | null;
  onDraft: (draft: Draft | null) => void;
  onChoose: (id: string) => void;
  onNotice: (text: string, undo?: () => void) => void;
  /** True while a picker handle is held, so the list stops scrolling. */
  onActive: (active: boolean) => void;
  /** Scroll the list so this view is near its top: the opened picker, the editor's heading. */
  onReveal: (view: ViewRef | null) => void;
  /** The settings list's visible height, so an opened picker's square and hue strip fit in it under the preview. */
  listHeight: number;
};

/** Background tokens: their example is a filled box with their own text on it. */
const FILLS: Partial<Record<TokenKey, TokenKey>> = {
  page: "ink",
  chrome: "chromeInk",
  accent: "accentInk",
  control: "controlInk",
  controlOn: "controlOnInk",
  sheet: "sheetInk",
  appBackground: "appInk",
  pillDefault: "chromeInk",
  scrim: "sheetInk",
};
/** Tokens drawn as lines or bars rather than text. */
const LINES: ReadonlySet<TokenKey> = new Set(["chromeDivider", "rule", "appDivider", "sliderTrack", "sliderFill", "selection"]);

function flagFor(flags: readonly ContrastFlag[], key: TokenKey): ContrastFlag | null {
  return flags.find((f) => f.fg === key) ?? flags.find((f) => f.bg === key) ?? null;
}

/**
 * The Colours tab's theme list and theme editor (docs/customization-roadmap.md, C4).
 * Choosing a theme applies at once; editing works on a draft that only Save keeps.
 */
export function ThemeEditor({ custom, current, draft, onDraft, onChoose, onNotice, onActive, onReveal, listHeight }: Props) {
  const c = useChrome();
  const strings = t().look.themes;
  const names = t().book.themes as Record<string, string>;
  const builtInName = (id: ThemeId) => names[id] ?? id;
  const nameOf = (id: string) => (isBuiltInTheme(id) ? builtInName(id) : (custom.themes.find((u) => u.id === id)?.name ?? id));
  const [open, setOpen] = useState<TokenKey | null>(null);
  const rows = useRef(new Map<string, ViewRef>());
  const top = useRef<ViewRef>(null);
  // After the new layout is drawn (emulator run 27: the picker opened below the screen, the editor began past its name field).
  const reveal = (view: () => ViewRef | null | undefined) => setTimeout(() => onReveal(view() ?? null), 120);
  const picker = useRef<ViewRef>(null);
  // The square, hue strip and (for see-through tokens) opacity strip must fit above the gesture bar.
  // With room, the token's row stays in view above them; in a short list under the preview the
  // picker itself goes to the top, its row just above (emulator runs 28 to 30).
  const strips = (key: TokenKey) => 56 + (ALPHA_TOKENS.has(key) ? 38 : 0);
  const roomy = (key: TokenKey) => listHeight <= 0 || listHeight - 56 - strips(key) >= MIN_SQUARE;
  // Without its row in view, the picker names the colour it edits in one line (about 22 dp; emulator run 31).
  const squareFor = (key: TokenKey) => (listHeight <= 0 ? undefined : listHeight - strips(key) - (roomy(key) ? 56 : 22));
  const pick = (key: TokenKey | null) => {
    setOpen(key);
    if (key) reveal(() => (roomy(key) ? rows.current.get(key) : picker.current));
  };
  const startEditing = (next: Draft) => {
    setOpen(null);
    onDraft(next);
    reveal(() => top.current);
  };

  const edit = (id: string) => {
    const next = startDraft(id, custom.themes, builtInName, strings.copyWord);
    if (next.isNew && custom.themes.length >= MAX_USER_THEMES) {
      onNotice(strings.full);
      return;
    }
    startEditing(next);
    if (next.isNew) onNotice(strings.copyStarted(next.theme.name));
  };

  const duplicate = (id: string) => {
    if (custom.themes.length >= MAX_USER_THEMES) {
      onNotice(strings.full);
      return;
    }
    startEditing(duplicateDraft(id, custom.themes, builtInName, strings.copyWord));
  };

  const remove = (id: string) => {
    const index = custom.themes.findIndex((u) => u.id === id);
    const theme = custom.themes[index];
    if (!theme) return;
    void removeUserTheme(id);
    onNotice(strings.deletedTo(theme.name, builtInName(theme.base)), () => void restoreUserTheme(theme, index));
  };

  const more = (id: string) => {
    const user = !isBuiltInTheme(id);
    confirm({
      title: nameOf(id),
      buttons: [
        { text: strings.duplicate, onPress: () => duplicate(id) },
        ...(user ? [{ text: strings.delete, style: "destructive" as const, onPress: () => remove(id) }] : []),
        { text: strings.cancel, style: "cancel" },
      ],
      chrome: c,
    });
  };

  if (!draft) {
    const ids = [...THEME_IDS, ...custom.themes.map((u) => u.id)];
    return (
      <View style={styles.wrap}>
        <Text style={[styles.section, { color: c.muted }]} accessibilityRole="header">
          {strings.title}
        </Text>
        {ids.map((id) => {
          const tokens = themeFor(id, custom.themes);
          const flags = contrastFlags(tokens);
          const on = id === current;
          const builtIn = isBuiltInTheme(id);
          return (
            <View key={id} style={[styles.themeRow, { borderColor: on ? c.accent : c.line }, on && styles.themeRowOn]}>
              <Pressable
                onPress={() => onChoose(id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${nameOf(id)}, ${builtIn ? strings.builtIn : strings.yours}${flags.length ? `, ${strings.lowContrast}` : ""}`}
                style={styles.themeMain}
              >
                <MiniPage tokens={tokens} />
                <View style={styles.grow}>
                  <Text style={[styles.themeName, { color: c.ink }, on && styles.bold]} numberOfLines={1}>
                    {nameOf(id)}
                  </Text>
                  <Text style={[styles.small, { color: c.muted }]} numberOfLines={1}>
                    {[builtIn ? strings.builtIn : strings.yours, on ? strings.inUse : null].filter(Boolean).join(" · ")}
                    {flags.length ? <Text style={{ color: c.danger }}>{` · ⚠ ${strings.lowContrast}`}</Text> : null}
                  </Text>
                </View>
              </Pressable>
              <Pressable onPress={() => edit(id)} accessibilityRole="button" accessibilityLabel={`${builtIn ? strings.editCopy : strings.edit}: ${nameOf(id)}`} hitSlop={6} style={styles.action}>
                <Text style={[styles.actionText, { color: c.accent }]}>{builtIn ? strings.editCopy : strings.edit}</Text>
              </Pressable>
              <Pressable onPress={() => more(id)} accessibilityRole="button" accessibilityLabel={strings.more(nameOf(id))} hitSlop={6} style={styles.action}>
                <Text style={[styles.actionText, { color: c.ink }]}>⋯</Text>
              </Pressable>
            </View>
          );
        })}
        <Pressable onPress={() => duplicate(current)} accessibilityRole="button" style={[styles.newButton, { borderColor: c.line }]}>
          <Text style={[styles.actionText, { color: c.accent }]}>{strings.new}</Text>
        </Pressable>
      </View>
    );
  }

  const tokens = draftTokens(draft);
  const flags = contrastFlags(tokens);
  const swatches = swatchesFor(tokens, custom.recentColours);

  return (
    <View style={styles.wrap} ref={top}>
      <Text style={[styles.section, { color: c.muted }]} accessibilityRole="header">
        {strings.editing}
      </Text>
      <TextInput
        value={draft.theme.name}
        onChangeText={(text) => onDraft(renameDraft(draft, text))}
        accessibilityLabel={strings.name}
        placeholder={strings.name}
        placeholderTextColor={c.muted}
        maxLength={60}
        returnKeyType="done"
        style={[styles.nameInput, { color: c.ink, borderColor: c.line }]}
      />
      <Text style={[styles.small, { color: c.muted }]}>{strings.basedOn(builtInName(draft.theme.base))}</Text>
      <View style={styles.toggleRow}>
        <Text style={[styles.label, { color: c.ink }]}>{strings.dark}</Text>
        <ThemedSwitch value={tokens.dark} onValueChange={(value) => onDraft(setDraftDark(draft, value))} accessibilityLabel={strings.dark} />
      </View>
      {flags.length ? (
        <Text style={[styles.small, { color: c.danger }]}>
          ⚠ {strings.lowContrastCount(flags.length)} {strings.lowContrastHelp}
        </Text>
      ) : null}
      {TOKEN_GROUPS.map(({ group, tokens: keys }) => (
        <View key={group} style={styles.group}>
          <Text style={[styles.groupTitle, { color: c.ink }]} accessibilityRole="header">
            {strings.groups[group]}
          </Text>
          {keys.map((key) => {
            const name = strings.tokens[key] ?? key;
            const flag = flagFor(flags, key);
            const changed = key in draft.theme.tokens;
            const isOpen = open === key;
            return (
              <View
                key={key}
                ref={(view) => {
                  if (view) rows.current.set(key, view);
                  else rows.current.delete(key);
                }}
                style={[styles.tokenWrap, { borderBottomColor: c.line }]}
              >
                <View style={styles.tokenRow}>
                  <Pressable
                    onPress={() => pick(isOpen ? null : key)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                    accessibilityLabel={strings.pickLabel(name, tokens[key])}
                    style={styles.tokenMain}
                  >
                    <View style={[styles.dot, { backgroundColor: tokens[key], borderColor: c.line }]} />
                    <View style={styles.grow}>
                      <Text style={[styles.label, { color: c.ink }]} numberOfLines={1}>
                        {name}
                        {changed ? <Text style={[styles.small, { color: c.muted }]}>{` · ${strings.changed}`}</Text> : null}
                      </Text>
                      <Text style={[styles.mono, { color: c.muted }]}>{tokens[key]}</Text>
                      {flag ? <Text style={[styles.small, styles.bold, { color: c.danger }]}>{strings.contrastTag(flag.ratio.toFixed(1))}</Text> : null}
                    </View>
                    <Example tokenKey={key} tokens={tokens} />
                  </Pressable>
                  {changed ? (
                    <Pressable onPress={() => onDraft(resetDraftToken(draft, key))} accessibilityRole="button" accessibilityLabel={strings.resetLabel(name)} hitSlop={8} style={styles.action}>
                      <Text style={[styles.small, styles.underline, { color: c.accent }]}>{strings.reset}</Text>
                    </Pressable>
                  ) : null}
                </View>
                {isOpen ? (
                  <View ref={picker}>
                  {roomy(key) ? null : (
                    <Text style={[styles.small, styles.bold, { color: c.ink }]} numberOfLines={1}>
                      {name} · {tokens[key]}
                    </Text>
                  )}
                  <ColorPicker
                    value={tokens[key]}
                    onChange={(hex) => onDraft(setDraftToken(draft, key, hex))}
                    onPicked={(hex) => void rememberColour(hex)}
                    alpha={ALPHA_TOKENS.has(key)}
                    swatches={swatches}
                    label={name}
                    onActive={onActive}
                    squareHeight={squareFor(key)}
                  />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** A theme's look in one small card: page, text, a link line and the bar colour. */
function MiniPage({ tokens }: { tokens: ThemeTokens }) {
  return (
    <View style={[styles.mini, { backgroundColor: tokens.page, borderColor: tokens.chromeDivider }]}>
      <View style={[styles.miniBar, { backgroundColor: tokens.chrome }]} />
      <Text style={[styles.miniText, { color: tokens.ink }]}>Aa</Text>
      <View style={[styles.miniLink, { backgroundColor: tokens.link }]} />
    </View>
  );
}

/** The token as it is drawn: text on its background, a filled box, or a line. */
function Example({ tokenKey, tokens }: { tokenKey: TokenKey; tokens: ThemeTokens }) {
  const sample = t().look.themes.sample;
  const fill = FILLS[tokenKey];
  if (fill) {
    return (
      <View style={[styles.example, { backgroundColor: tokens[tokenKey], borderColor: withAlpha(tokens.ink.slice(0, 7), 0.2) }]}>
        <Text style={[styles.exampleText, { color: tokens[fill] }]}>{sample}</Text>
      </View>
    );
  }
  const bg = tokens[BACKGROUND_OF[tokenKey] ?? "page"];
  if (LINES.has(tokenKey)) {
    return (
      <View style={[styles.example, { backgroundColor: bg }]}>
        <View style={[styles.exampleLine, { backgroundColor: tokens[tokenKey] }]} />
      </View>
    );
  }
  if (tokenKey === "sliderThumb") {
    return (
      <View style={[styles.example, { backgroundColor: bg }]}>
        <View style={[styles.exampleThumb, { backgroundColor: tokens.sliderThumb, borderColor: tokens.accentInk }]} />
      </View>
    );
  }
  return (
    <View style={[styles.example, { backgroundColor: bg }]}>
      <Text style={[styles.exampleText, { color: tokens[tokenKey] }, (tokenKey === "link" || tokenKey === "linkVisited") && styles.underline, tokenKey === "heading" && styles.bold]}>
        {sample}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  section: { fontSize: 13, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 },
  themeRow: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 10, paddingRight: 4 },
  themeRowOn: { borderWidth: 2 },
  themeMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, padding: 8, minHeight: 56 },
  themeName: { fontSize: 16 },
  grow: { flex: 1, minWidth: 0 },
  action: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  actionText: { fontSize: 15, fontWeight: "600" },
  newButton: { minHeight: 44, borderWidth: 1, borderStyle: "dashed", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  mini: { width: 44, height: 44, borderRadius: 6, borderWidth: 1, overflow: "hidden", alignItems: "center" },
  miniBar: { alignSelf: "stretch", height: 7 },
  miniText: { fontSize: 14, fontWeight: "600", marginTop: 2 },
  miniLink: { width: 22, height: 3, borderRadius: 2, marginTop: 3 },
  small: { fontSize: 13, lineHeight: 18 },
  bold: { fontWeight: "600" },
  underline: { textDecorationLine: "underline" },
  label: { fontSize: 15 },
  mono: { fontSize: 12, fontVariant: ["tabular-nums"] },
  nameInput: { fontSize: 16, minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10 },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  group: { gap: 0, marginTop: 6 },
  groupTitle: { fontSize: 15, fontWeight: "600", marginBottom: 2 },
  tokenWrap: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 4 },
  tokenRow: { flexDirection: "row", alignItems: "center" },
  tokenMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 },
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1 },
  example: { width: 76, height: 32, borderRadius: 6, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "transparent" },
  exampleText: { fontSize: 13 },
  exampleLine: { width: 56, height: 4, borderRadius: 2 },
  exampleThumb: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
});
