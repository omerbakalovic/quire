import { normalizeHex } from "./colour.ts";
import { isBuiltInTheme, THEMES, userThemeTokens, type ThemeId, type ThemeTokens } from "./themes.ts";
import { copyName, newThemeId, type UserTheme } from "./user-themes.ts";

/**
 * The theme editor's model (docs/customization-roadmap.md, C4), kept free of
 * React so it can be tested. The editor works on a draft; nothing is saved
 * until Save (roadmap 2.6).
 */
export type TokenKey = Exclude<keyof ThemeTokens, "dark">;

/**
 * The tokens the Colours tab lists, by where they show. Highlight and image
 * frame are left out until something draws them (annotations, figure frames).
 */
export const TOKEN_GROUPS: readonly { group: "page" | "bars" | "controls" | "sheets" | "app"; tokens: readonly TokenKey[] }[] = [
  { group: "page", tokens: ["page", "ink", "inkMuted", "heading", "link", "linkVisited", "selection", "rule", "imageCaption"] },
  { group: "bars", tokens: ["chrome", "chromeInk", "chromeDivider", "accent", "accentInk"] },
  { group: "controls", tokens: ["control", "controlInk", "controlOn", "controlOnInk", "sliderTrack", "sliderFill", "sliderThumb"] },
  { group: "sheets", tokens: ["sheet", "sheetInk", "scrim", "danger"] },
  { group: "app", tokens: ["appBackground", "appInk", "appInkMuted", "appDivider", "pillDefault"] },
];

/** Tokens that are drawn see-through, so the picker offers an opacity strip for them. */
export const ALPHA_TOKENS: ReadonlySet<TokenKey> = new Set(["scrim", "chromeDivider", "sliderTrack", "appDivider", "rule", "selection"]);

/** What a token is drawn on, for its example and its contrast tag. */
export const BACKGROUND_OF: Partial<Record<TokenKey, TokenKey>> = {
  ink: "page",
  inkMuted: "page",
  heading: "page",
  link: "page",
  linkVisited: "page",
  selection: "page",
  rule: "page",
  imageCaption: "page",
  chromeInk: "chrome",
  chromeDivider: "chrome",
  accent: "chrome",
  accentInk: "accent",
  controlInk: "control",
  controlOnInk: "controlOn",
  sliderTrack: "chrome",
  sliderFill: "chrome",
  sliderThumb: "chrome",
  sheetInk: "sheet",
  danger: "sheet",
  appInk: "appBackground",
  appInkMuted: "appBackground",
  appDivider: "appBackground",
  pillDefault: "appBackground",
};

export type Draft = {
  theme: UserTheme;
  /** A copy not saved yet (New, or editing a built-in). */
  isNew: boolean;
  /** The saved theme the draft started from, to tell whether anything changed. */
  saved: UserTheme | null;
};

/**
 * Start editing. A user theme is edited as it is; a built-in is never edited,
 * so it becomes "<Name> (copy)" first. `names` are the names in use; `word` the translated "copy".
 */
export function startDraft(
  id: string,
  themes: readonly UserTheme[],
  builtInName: (id: ThemeId) => string,
  word = "copy",
  random: () => number = Math.random,
): Draft {
  const user = themes.find((t) => t.id === id);
  if (user) return { theme: { ...user, tokens: { ...user.tokens } }, isNew: false, saved: user };
  const base: ThemeId = isBuiltInTheme(id) ? id : "light";
  const names = [...themes.map((t) => t.name)];
  return { theme: { id: newThemeId(themes, random), name: copyName(builtInName(base), names, word), base, tokens: {} }, isNew: true, saved: null };
}

/** Copy any theme, built-in or the reader's, as a new unsaved draft. */
export function duplicateDraft(
  id: string,
  themes: readonly UserTheme[],
  builtInName: (id: ThemeId) => string,
  word = "copy",
  random: () => number = Math.random,
): Draft {
  const user = themes.find((t) => t.id === id);
  if (!user) return startDraft(id, themes, builtInName, word, random);
  const names = themes.map((t) => t.name);
  return { theme: { id: newThemeId(themes, random), name: copyName(user.name, names, word), base: user.base, tokens: { ...user.tokens } }, isNew: true, saved: null };
}

export function draftTokens(draft: Draft): ThemeTokens {
  return userThemeTokens(draft.theme);
}

/**
 * Set one token. A colour equal to what the base gives (stated or derived)
 * is not stored, so the token keeps following the base.
 */
export function setDraftToken(draft: Draft, key: TokenKey, value: string): Draft {
  const hex = normalizeHex(value);
  if (!hex) return draft;
  const tokens = { ...draft.theme.tokens, [key]: hex };
  const without = { ...draft.theme.tokens };
  delete without[key];
  if (userThemeTokens({ base: draft.theme.base, tokens: without })[key] === hex) return resetDraftToken(draft, key);
  return { ...draft, theme: { ...draft.theme, tokens } };
}

export function resetDraftToken(draft: Draft, key: TokenKey | "dark"): Draft {
  if (!(key in draft.theme.tokens)) return draft;
  const tokens = { ...draft.theme.tokens };
  delete tokens[key];
  return { ...draft, theme: { ...draft.theme, tokens } };
}

export function setDraftDark(draft: Draft, dark: boolean): Draft {
  if (THEMES[draft.theme.base].dark === dark) return resetDraftToken(draft, "dark");
  return { ...draft, theme: { ...draft.theme, tokens: { ...draft.theme.tokens, dark } } };
}

export function renameDraft(draft: Draft, name: string): Draft {
  return { ...draft, theme: { ...draft.theme, name: name.slice(0, 60) } };
}

/** Whether Save has something to do: a new copy always does; a saved theme when its name or colours changed. */
export function draftChanged(draft: Draft): boolean {
  if (draft.isNew || !draft.saved) return true;
  const same = (a: object, b: object) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
  return draft.theme.name.trim() !== draft.saved.name || !same(draft.theme.tokens, draft.saved.tokens);
}

/** The themes as the preview should draw them: the draft in place of its saved version, or added. */
export function themesWithDraft(themes: readonly UserTheme[], draft: Draft | null): readonly UserTheme[] {
  if (!draft) return themes;
  const at = themes.findIndex((t) => t.id === draft.theme.id);
  return at < 0 ? [...themes, draft.theme] : themes.map((t, i) => (i === at ? draft.theme : t));
}

/** The swatches beside the picker: the draft's own colours, then the recent ones, without repeats. */
export function swatchesFor(tokens: ThemeTokens, recent: readonly string[]): string[] {
  const out: string[] = [];
  for (const key of ["page", "ink", "inkMuted", "link", "accent", "chrome", "chromeInk", "danger"] as const) {
    if (!out.includes(tokens[key])) out.push(tokens[key]);
  }
  for (const hex of recent) if (!out.includes(hex)) out.push(hex);
  return out;
}

export const MAX_RECENT = 8;

/** A picked colour goes to the front of the recent list, at most eight. */
export function pushRecent(recent: readonly string[], hex: string): string[] {
  const clean = normalizeHex(hex);
  if (!clean) return [...recent];
  return [clean, ...recent.filter((h) => h !== clean)].slice(0, MAX_RECENT);
}
