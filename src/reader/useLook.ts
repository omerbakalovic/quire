import { useCallback, useEffect, useMemo, useRef } from "react";

import type { Library } from "@/domain/library";
import { layersFor, resolvedFor } from "@/settings/customization";
import { needsRelayout } from "@/settings/layers";
import type { Resolved } from "@/settings/registry";
import { themeFor } from "@/settings/themes";

import { lookFor, type Look } from "./look";

function sameLook(a: Look, b: Look): boolean {
  return a.css === b.css && a.gap === b.gap && a.maxInlineSize === b.maxInlineSize && a.page === b.page && a.band === b.band && a.fontScale === b.fontScale && a.ink === b.ink && a.link === b.link && a.chrome === b.chrome && a.fonts.map((f) => f.file).join() === b.fonts.map((f) => f.file).join();
}

/**
 * The reading look for one open book: resolves the layered settings and keeps
 * the page in step with every change. Changes are made in Reading Look
 * (src/app/look.tsx), which sits on top of the reader while the book stays open.
 */
export function useLook(library: Library, bookId: string | null, reading: boolean, post: (message: object) => void) {
  const settings = useMemo(() => resolvedFor(library.custom, bookId), [library.custom, bookId]);
  const fonts = library.custom.fonts;
  const look = useMemo(() => lookFor(settings, fonts), [settings, fonts]);
  const sent = useRef<Resolved | null>(null);

  // Every change reaches the open page; a typography change keeps the place around a relayout.
  useEffect(() => {
    if (!reading || !bookId) return;
    const before = sent.current;
    sent.current = settings;
    if (before === settings) return;
    // The dimmer and warmth are veils over the page; they never restyle the book.
    if (before && sameLook(lookFor(before, fonts), look)) return;
    post({ type: "look", id: bookId, look, relayout: before ? needsRelayout(before, settings) : false });
  }, [reading, bookId, settings, fonts, look, post]);

  // A fresh page (reconnect, new mount) gets the look with the open message; start over.
  const opened = useCallback(() => {
    sent.current = settings;
  }, [settings]);

  return {
    settings,
    look: look as Look,
    chrome: themeFor(settings["theme.id"]),
    theme: themeFor(settings["theme.id"]),
    opened,
    layers: layersFor(library.custom, bookId),
  };
}
