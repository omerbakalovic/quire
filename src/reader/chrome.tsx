import { createContext, useContext, type ReactNode } from "react";

import { luminance, THEMES, withAlpha, type ThemeTokens } from "@/settings/themes";

export { withAlpha };

/**
 * Colours for everything drawn around a book or in the app's own screens,
 * derived from one theme's tokens (docs/customization-roadmap.md, 2.3 and C3).
 * Inside a book it comes from the book's theme; elsewhere from the app theme,
 * which the root layout provides.
 */
export type Chrome = {
  // Reader chrome (bars, Contents, pills, slider)
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
  // Controls
  control: string;
  controlInk: string;
  controlOn: string;
  controlOnInk: string;
  // Sheets and dialogs
  sheet: string;
  sheetInk: string;
  sheetMuted: string;
  danger: string;
  // App screens
  background: string;
  appInk: string;
  appMuted: string;
  divider: string;
  pillDefault: string;
  dark: boolean;
  /** Status bar icons: light on a dark bar colour, dark on a light one (from the bar colour, not the theme's flag). */
  statusBar: "light" | "dark";
};

export function chromeFor(theme: ThemeTokens): Chrome {
  return {
    // Opaque: the page showing faintly through the bars looked noisy (emulator run 24).
    bar: theme.chrome,
    panel: theme.chrome,
    ink: theme.chromeInk,
    muted: withAlpha(theme.chromeInk, 0.65),
    accent: theme.accent,
    onAccent: theme.accentInk,
    selected: withAlpha(theme.accent, 0.22),
    line: theme.chromeDivider,
    track: theme.sliderTrack,
    shade: theme.scrim,
    control: theme.control,
    controlInk: theme.controlInk,
    controlOn: theme.controlOn,
    controlOnInk: theme.controlOnInk,
    sheet: theme.sheet,
    sheetInk: theme.sheetInk,
    sheetMuted: withAlpha(theme.sheetInk, 0.65),
    danger: theme.danger,
    background: theme.appBackground,
    appInk: theme.appInk,
    appMuted: theme.appInkMuted,
    divider: theme.appDivider,
    pillDefault: theme.pillDefault,
    dark: theme.dark,
    statusBar: (luminance(theme.chrome.slice(0, 7)) ?? 1) < 0.4 ? "light" : "dark",
  };
}

const ChromeContext = createContext<Chrome>(chromeFor(THEMES.light));

export function ChromeProvider({ chrome, children }: { chrome: Chrome; children: ReactNode }) {
  return <ChromeContext.Provider value={chrome}>{children}</ChromeContext.Provider>;
}

export function useChrome(): Chrome {
  return useContext(ChromeContext);
}
