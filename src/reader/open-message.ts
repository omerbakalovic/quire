import type { Flow, Settings } from "../domain/library.ts";
import type { GestureMap } from "../settings/gestures.ts";
import type { Look } from "./look.ts";

type Insets = { top: number; bottom: number; left: number; right: number };

/**
 * The message that opens a book in the reader page. The reader and Reading
 * Look's preview both build it here, so the preview opens its sample through
 * exactly the reader's path (docs/customization-roadmap.md, section 4, rule 2).
 */
export function openMessage(args: {
  id: string;
  url: string;
  flow: Flow;
  /** A saved place or the last relocate report; passed to the page as it is. */
  position: { cfi?: string | null } | null;
  look: Look;
  settings: Settings & { gestures?: GestureMap; turns?: boolean };
  insets: Insets;
}) {
  return {
    type: "open" as const,
    id: args.id,
    url: args.url,
    flow: args.flow,
    cfi: args.position?.cfi ?? null,
    position: args.position,
    look: args.look,
    settings: args.settings,
    insets: args.insets,
  };
}

/**
 * The preview turns pages with a side tap or a swipe, like a book, but the
 * middle tap and the other gestures do nothing: there are no bars to show and
 * no screen to leave.
 */
export const PREVIEW_GESTURES: GestureMap = {
  tapLeft: "prevPage",
  tapCenter: "none",
  tapRight: "nextPage",
  swipeUp: "none",
  swipeDown: "none",
  twoFingerTap: "none",
};

/** Opening the sample in the preview: always paginated, from its start, with no page-turn animation. */
export function previewOpenMessage(id: string, url: string, look: Look, insets: Insets) {
  return openMessage({
    id,
    url,
    flow: "paginated",
    position: null,
    look,
    settings: { tapZones: "screen", gestures: PREVIEW_GESTURES, turns: false },
    insets,
  });
}
