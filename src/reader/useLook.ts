import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Library } from "@/domain/library";
import { resetBookGroups, saveSetting, resetGlobalGroups } from "@/library/store";
import { layersFor, resolvedFor } from "@/settings/customization";
import { needsRelayout } from "@/settings/layers";
import type { Resolved, SettingKey } from "@/settings/registry";
import { themeFor } from "@/settings/themes";

import { lookFor, type Look } from "./look";
import type { Scope } from "./QuickPanel";

function sameLook(a: Look, b: Look): boolean {
  return a.css === b.css && a.gap === b.gap && a.maxInlineSize === b.maxInlineSize && a.page === b.page;
}

/**
 * The reading look for one open book: resolves the layered settings, keeps
 * the page in step with every change, and saves changes to the scope the
 * reader picked (all books, or only this one).
 */
export function useLook(library: Library, bookId: string | null, reading: boolean, post: (message: object) => void) {
  const [scope, setScope] = useState<Scope>(() => (bookId && library.custom.books[bookId] ? "book" : "global"));
  const settings = useMemo(() => resolvedFor(library.custom, bookId), [library.custom, bookId]);
  const look = useMemo(() => lookFor(settings), [settings]);
  const sent = useRef<Resolved | null>(null);

  // Every change reaches the open page; a typography change keeps the place around a relayout.
  useEffect(() => {
    if (!reading || !bookId) return;
    const before = sent.current;
    sent.current = settings;
    if (before === settings) return;
    // The dimmer and warmth are veils over the page; they never restyle the book.
    if (before && sameLook(lookFor(before), look)) return;
    post({ type: "look", id: bookId, look, relayout: before ? needsRelayout(before, settings) : false });
  }, [reading, bookId, settings, look, post]);

  // A fresh page (reconnect, new mount) gets the look with the open message; start over.
  const opened = useCallback(() => {
    sent.current = settings;
  }, [settings]);

  const overridden = useMemo(
    () => new Set(Object.keys(bookId ? (library.custom.books[bookId] ?? {}) : {}) as SettingKey[]),
    [library.custom.books, bookId],
  );

  const change = useCallback(
    (key: SettingKey, value: number | string | boolean) => {
      void saveSetting(scope, key, value, bookId);
    },
    [scope, bookId],
  );

  const reset = useCallback(() => {
    if (scope === "book" && bookId) void resetBookGroups(bookId, ["typography", "page", "theme", "light"]);
    else void resetGlobalGroups(["typography", "page", "theme", "light"]);
  }, [scope, bookId]);

  return {
    settings,
    look: look as Look,
    chrome: themeFor(settings["theme.id"]),
    scope,
    setScope,
    overridden,
    change,
    reset,
    opened,
    layers: layersFor(library.custom, bookId),
  };
}
