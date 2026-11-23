import { createContext, useContext, type ReactNode } from "react";

import { THEMES, type ThemeTokens } from "@/settings/themes";

/**
 * Colours for the reader's own controls (bars, contents, pills, slider),
 * derived from the active theme's chrome tokens so one palette drives the
 * book and everything around it (docs/customization.md, 2.5).
 */
export type Chrome = {
  bar: string;
  panel: string;
  ink: string;
  muted: string;
  accent: string;
  onAccent: string;
  selected: string;
  line: string;
  track: string;
  shade: string;
  dark: boolean;
};

/** #rrggbb with an alpha byte. Anything else comes back unchanged. */
export function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${hex}${byte.toString(16).padStart(2, "0")}`;
}

export function chromeFor(theme: ThemeTokens): Chrome {
  return {
    bar: withAlpha(theme.chrome, 0.95),
    panel: theme.chrome,
    ink: theme.chromeInk,
    muted: withAlpha(theme.chromeInk, 0.65),
    accent: theme.accent,
    onAccent: theme.page,
    selected: withAlpha(theme.accent, 0.22),
    line: withAlpha(theme.chromeInk, 0.35),
    track: withAlpha(theme.chromeInk, 0.25),
    shade: theme.dark ? "#000000aa" : "#00000066",
    dark: theme.dark,
  };
}

const ChromeContext = createContext<Chrome>(chromeFor(THEMES.dark));

export function ChromeProvider({ chrome, children }: { chrome: Chrome; children: ReactNode }) {
  return <ChromeContext.Provider value={chrome}>{children}</ChromeContext.Provider>;
}

export function useChrome(): Chrome {
  return useContext(ChromeContext);
}
