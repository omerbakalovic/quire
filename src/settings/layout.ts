import { AMBIENT_SLOTS, sameValue, type Resolved } from "./registry.ts";
import type { Values } from "./layers.ts";

/**
 * The reader's header and footer bands (docs/customization.md, 3.2 and 3.3):
 * presets, whether a band is in use, and the text each element shows.
 * Kept free of React so it can be tested.
 */
export type AmbientSlot = (typeof AMBIENT_SLOTS)[number];
export type AmbientElement = "title" | "author" | "chapter" | "page" | "pagesLeft" | "percent" | "clock";

export const LAYOUT_PRESETS = ["bare", "classic", "informative"] as const;
export type LayoutPreset = (typeof LAYOUT_PRESETS)[number];

const EMPTY: Record<AmbientSlot, readonly string[]> = {
  "layout.header.left": [],
  "layout.header.center": [],
  "layout.header.right": [],
  "layout.footer.left": [],
  "layout.footer.center": [],
  "layout.footer.right": [],
};

/** Bare is the default: text only. Classic is a printed book's running head and folio. */
export const PRESET_SLOTS: Record<LayoutPreset, Record<AmbientSlot, readonly string[]>> = {
  bare: EMPTY,
  classic: { ...EMPTY, "layout.header.left": ["title"], "layout.header.right": ["chapter"], "layout.footer.center": ["page"] },
  informative: {
    ...EMPTY,
    "layout.header.left": ["chapter"],
    "layout.header.right": ["clock"],
    "layout.footer.left": ["pagesLeft"],
    "layout.footer.right": ["percent"],
  },
};

/** The values that apply a preset: every slot, so a preset replaces the whole layout. */
export function presetValues(preset: LayoutPreset): Values {
  return { ...PRESET_SLOTS[preset] };
}

/** The preset the resolved layout matches, or null for a custom one. */
export function presetOf(settings: Resolved): LayoutPreset | null {
  for (const preset of LAYOUT_PRESETS) {
    if (AMBIENT_SLOTS.every((slot) => sameValue(settings[slot], PRESET_SLOTS[preset][slot]))) return preset;
  }
  return null;
}

/** Which bands hold anything. The page grows its margin only for a band in use. */
export function bandsOf(settings: Resolved): { top: boolean; bottom: boolean } {
  const any = (slots: AmbientSlot[]) => slots.some((slot) => settings[slot].length > 0);
  return {
    top: any(["layout.header.left", "layout.header.center", "layout.header.right"]),
    bottom: any(["layout.footer.left", "layout.footer.center", "layout.footer.right"]),
  };
}

/** Extra margin, in CSS px, a band in use needs for one line of small text. */
export const BAND_PX = 22;

export type AmbientInfo = {
  title: string | null;
  author: string | null;
  chapter: string | null;
  /** Page in the current chapter, 1-based, and the chapter's page count. Null in scroll mode. */
  page: number | null;
  pages: number | null;
  fraction: number | null;
  now: Date;
};

export type AmbientWords = {
  pageOf: (page: number, pages: number) => string;
  pagesLeft: (count: number) => string;
  lastPage: string;
};

/** The text one element shows, or null when there is nothing to show (no chapter, scroll mode). */
export function ambientText(element: string, info: AmbientInfo, words: AmbientWords): string | null {
  switch (element) {
    case "title":
      return info.title || null;
    case "author":
      return info.author || null;
    case "chapter":
      return info.chapter || null;
    case "page":
      return info.page !== null && info.pages !== null && info.pages > 0 ? words.pageOf(info.page, info.pages) : null;
    case "pagesLeft": {
      if (info.page === null || info.pages === null || info.pages <= 0) return null;
      const left = info.pages - info.page;
      return left > 0 ? words.pagesLeft(left) : words.lastPage;
    }
    case "percent":
      return info.fraction === null ? null : `${Math.round(info.fraction * 100)}%`;
    case "clock":
      return `${String(info.now.getHours()).padStart(2, "0")}:${String(info.now.getMinutes()).padStart(2, "0")}`;
    default:
      return null;
  }
}

/** One slot's line: its elements' texts joined, skipping the empty ones. */
export function slotText(elements: readonly string[], info: AmbientInfo, words: AmbientWords): string {
  return elements
    .map((element) => ambientText(element, info, words))
    .filter((text): text is string => Boolean(text))
    .join(" · ");
}
