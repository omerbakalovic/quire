import type { Resolved } from "./registry.ts";

/**
 * The library shelf's look (docs/customization-roadmap.md, C6), worked out
 * from the resolved `library.*` settings. Kept free of React so it can be
 * tested; the library screen and the Library tab's preview both draw from it.
 * The defaults give the shelf Quire drew before.
 */
export type Shelf = {
  pills: boolean;
  showCovers: boolean;
  showAuthor: boolean;
  showProgress: boolean;
  /** Where a pill without a chosen colour gets one. */
  colour: "cover" | "theme";
  ink: "auto" | "light" | "dark";
  padding: { horizontal: number; vertical: number };
  gap: number;
  radius: number;
  cover: { width: number; height: number; side: "start" | "end" };
  title: { size: number; weight: "400" | "500" | "600"; lines: number };
  detailSize: number;
};

const COVERS = { small: { width: 28, height: 42 }, medium: { width: 40, height: 60 }, large: { width: 56, height: 84 } } as const;
const WEIGHTS = { regular: "400", medium: "500", bold: "600" } as const;

export function shelfOf(settings: Resolved): Shelf {
  const vertical = settings["library.pillPadding"];
  return {
    pills: settings["library.style"] === "pills",
    showCovers: settings["library.showCovers"],
    showAuthor: settings["library.showAuthor"],
    showProgress: settings["library.showProgress"],
    colour: settings["library.pillColour"] === "theme" ? "theme" : "cover",
    ink: settings["library.pillInk"] === "light" ? "light" : settings["library.pillInk"] === "dark" ? "dark" : "auto",
    // Sideways a little more than up and down, as before (18 and 14).
    padding: { horizontal: vertical + 4, vertical },
    gap: settings["library.pillGap"],
    radius: settings["library.pillRadius"],
    cover: {
      ...(COVERS[settings["library.coverSize"] as keyof typeof COVERS] ?? COVERS.medium),
      side: settings["library.coverSide"] === "end" ? "end" : "start",
    },
    title: {
      size: settings["library.titleSize"],
      weight: WEIGHTS[settings["library.titleWeight"] as keyof typeof WEIGHTS] ?? WEIGHTS.bold,
      lines: settings["library.titleLines"],
    },
    detailSize: settings["library.detailSize"],
  };
}

/**
 * A pill's background: the reader's pick for the book wins; then, by the
 * shelf's choice, the cover's average or the theme's pill colour.
 */
export function shelfPillColour(shelf: Shelf, chosen: string | undefined, cover: string | undefined, themePill: string): string {
  if (chosen) return chosen;
  if (shelf.colour === "cover" && cover) return cover;
  return themePill;
}

/** Text on a pill: auto picks black or white by contrast (`auto` is that pick). */
export function shelfInk(shelf: Shelf, auto: string): string {
  if (shelf.ink === "light") return "#FFFFFF"; // colour-ok: fixed light text on a pill
  if (shelf.ink === "dark") return "#000000"; // colour-ok: fixed dark text on a pill
  return auto;
}
