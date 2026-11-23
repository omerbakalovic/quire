import { readingCss, layoutAttributes } from "@/settings/reading-css";
import type { Resolved } from "@/settings/registry";
import { themeFor } from "@/settings/themes";

/** What the reader page needs to draw the book in the current look. */
export type Look = { css: string; gap: string; maxInlineSize: string; page: string };

export function lookFor(settings: Resolved): Look {
  const theme = themeFor(settings["theme.id"]);
  return { css: readingCss(settings, theme), ...layoutAttributes(settings), page: theme.page };
}
