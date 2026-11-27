import { fontFaces, type FontFace, type UserFont } from "@/settings/fonts";
import { BAND_PX, bandsOf } from "@/settings/layout";
import { readingCss, layoutAttributes } from "@/settings/reading-css";
import type { Resolved } from "@/settings/registry";
import { themeFor } from "@/settings/themes";
import type { UserTheme } from "@/settings/user-themes";

/** What the reader page needs to draw the book in the current look. `fonts` are the faces to declare. */
export type Look = {
  css: string;
  gap: string;
  maxInlineSize: string;
  /** Theme colours for what the page draws itself (the note sheet, its Back to text chip). */
  page: string;
  ink: string;
  muted: string;
  link: string;
  chrome: string;
  chromeInk: string;
  fonts: FontFace[];
  /** Extra page margin for the header and footer line; 0 when both bands are empty. */
  band: number;
  /** Text size against the book's own, measured by the page. 1 when the book's styles are off (the CSS sizes text then). */
  fontScale: number;
  /** Book colours "keep": the page gives text too faint on it the theme's ink (src/reader-page/book-colors.js). */
  faintFix: boolean;
};

export function lookFor(settings: Resolved, userFonts: readonly UserFont[] = [], userThemes: readonly UserTheme[] = []): Look {
  const theme = themeFor(settings["theme.id"], userThemes);
  const bands = bandsOf(settings);
  return {
    css: readingCss(settings, theme, userFonts),
    ...layoutAttributes(settings),
    page: theme.page,
    ink: theme.ink,
    muted: theme.inkMuted,
    link: theme.link,
    chrome: theme.chrome,
    chromeInk: theme.chromeInk,
    fonts: fontFaces(settings["type.fontFamily"], userFonts),
    band: bands.top || bands.bottom ? BAND_PX : 0,
    fontScale: settings["type.publisherStyles"] ? settings["type.fontSize"] / 100 : 1,
    faintFix: settings["theme.bookColors"] === "keep",
  };
}
