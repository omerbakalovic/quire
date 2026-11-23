import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Library } from "@/domain/library";
import { resetBookGroups, resetGlobalGroups, resetProfileGroups, saveSetting, saveSettingsIn } from "@/library/store";
import { layersFor, resolvedFor } from "@/settings/customization";
import { needsRelayout } from "@/settings/layers";
import { presetValues, type LayoutPreset } from "@/settings/layout";
import type { Resolved, SettingKey } from "@/settings/registry";
import { themeFor } from "@/settings/themes";

import { lookFor, type Look } from "./look";
import type { Scope } from "./QuickPanel";

function sameLook(a: Look, b: Look): boolean {
  return a.css === b.css && a.gap === b.gap && a.maxInlineSize === b.maxInlineSize && a.page === b.page && a.band === b.band && a.fontScale === b.fontScale && a.ink === b.ink && a.link === b.link && a.chrome === b.chrome && a.fonts.map((f) => f.file).join() === b.fonts.map((f) => f.file).join();
}

/**
 * The reading look for one open book: resolves the layered settings, keeps
 * the page in step with every change, and saves changes to the scope the
 * reader picked (all books, or only this one). While a reading profile is
 * active, "all books" edits that profile: it sits above the global values,
 * so a global edit would not show.
 */
export function useLook(library: Library, bookId: string | null, reading: boolean, post: (message: object) => void) {
  const [scope, setScope] = useState<Scope>(() => (bookId && library.custom.books[bookId] ? "book" : "global"));
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

  const profile = library.custom.profiles.find((p) => p.id === library.custom.activeProfile) ?? null;
  const layer = scope === "book" && bookId ? "book" : profile ? "profile" : "global";

  const overridden = useMemo(
    () => new Set(Object.keys(bookId ? (library.custom.books[bookId] ?? {}) : {}) as SettingKey[]),
    [library.custom.books, bookId],
  );

  const change = useCallback(
    (key: SettingKey, value: number | string | boolean) => {
      void saveSetting(layer, key, value, bookId);
    },
    [layer, bookId],
  );

  const layout = useCallback(
    (preset: LayoutPreset) => {
      void saveSettingsIn(layer, presetValues(preset), bookId);
    },
    [layer, bookId],
  );

  const reset = useCallback(() => {
    const groups = ["typography", "page", "theme", "light", "layout"];
    if (layer === "book" && bookId) void resetBookGroups(bookId, groups);
    else if (layer === "profile") void resetProfileGroups(groups);
    else void resetGlobalGroups(groups);
  }, [layer, bookId]);

  return {
    settings,
    look: look as Look,
    chrome: themeFor(settings["theme.id"]),
    theme: themeFor(settings["theme.id"]),
    scope,
    setScope,
    /** The active reading profile's name, which "all books" edits while it is on. */
    profileName: profile?.name ?? null,
    overridden,
    change,
    layout,
    reset,
    opened,
    layers: layersFor(library.custom, bookId),
  };
}
