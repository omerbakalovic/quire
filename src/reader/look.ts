import { fontFaces, type FontFace, type UserFont } from "@/settings/fonts";
import { BAND_PX, bandsOf } from "@/settings/layout";
import { readingCss, layoutAttributes } from "@/settings/reading-css";
import type { Resolved } from "@/settings/registry";
import { themeFor } from "@/settings/themes";

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
};

export function lookFor(settings: Resolved, userFonts: readonly UserFont[] = []): Look {
  const theme = themeFor(settings["theme.id"]);
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
  };
}
