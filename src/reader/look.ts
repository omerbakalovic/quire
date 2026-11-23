import { fontFaces, type FontFace, type UserFont } from "@/settings/fonts";
import { readingCss, layoutAttributes } from "@/settings/reading-css";
import type { Resolved } from "@/settings/registry";
import { themeFor } from "@/settings/themes";

/** What the reader page needs to draw the book in the current look. `fonts` are the faces to declare. */
export type Look = { css: string; gap: string; maxInlineSize: string; page: string; fonts: FontFace[] };

export function lookFor(settings: Resolved, userFonts: readonly UserFont[] = []): Look {
  const theme = themeFor(settings["theme.id"]);
  return {
    css: readingCss(settings, theme, userFonts),
    ...layoutAttributes(settings),
    page: theme.page,
    fonts: fontFaces(settings["type.fontFamily"], userFonts),
  };
}
