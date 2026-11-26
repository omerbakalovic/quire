import { parseNavEntries, type NavEntry } from "../domain/navigation.ts";

export type CheckReport = { engineOpened: boolean } & Record<string, unknown>;

/** Gesture actions the page hands to the app; it turns pages itself (src/reader-page/gestures.js). */
export const HOST_ACTIONS = ["bars", "contents", "look", "prevChapter", "nextChapter", "flow", "back"] as const;
export type HostAction = (typeof HOST_ACTIONS)[number];

export type ReaderToHost =
  | { type: "pong"; id: string }
  | { type: "encryption"; id: string; xml: string | null }
  | { type: "first"; id: string; report: CheckReport }
  | { type: "result"; id: string; report: CheckReport }
  | {
      type: "opened";
      id: string;
      title: string | null;
      sections: number;
      toc: NavEntry[];
      openMs: number | null;
      rangeRequests: number | null;
      restored: boolean;
      restoredFrom: "cfi" | "section" | "book" | "start" | null;
      fixedLayout: boolean;
    }
  | {
      type: "relocate";
      id: string;
      cfi: string;
      fraction: number | null;
      tocLabel: string | null;
      tocHref: string | null;
      sectionIndex: number | null;
      sectionFraction: number | null;
      /** Book fraction where the visible page starts; `fraction` is where it ends. */
      startFraction: number | null;
      /** Page in the section, 1-based, and its page count. Null in scroll mode. */
      page: number | null;
      pages: number | null;
      sectionCount: number | null;
      sinceTapMs: number | null;
      canGoBack: boolean;
    }
  | { type: "action"; id: string; action: HostAction }
  /** A page turn is about to happen; the page waits for "turn-go" (or a short timeout). */
  | { type: "turning"; id: string; direction: 1 | -1 }
  | { type: "back-stack"; id: string; depth: number; label: string | null }
  | { type: "refused"; id: string; kind: string }
  | { type: "failed"; id: string; error: string }
  | { type: "external-link"; id: string; href: string }
  | { type: "note"; id: string; open: boolean; href: string | null; error: string | null }
  | { type: "debug"; id: string; reqId: string; result: unknown };

function optString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const RESTORED_FROM = new Set(["cfi", "section", "book", "start"]);

function parseId(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

export function parseReaderMessage(raw: string): ReaderToHost | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown> & { type?: unknown; id?: unknown; xml?: unknown; report?: unknown };
  const id = parseId(message.id);
  if (!id) return null;
  if (message.type === "pong") return { type: "pong", id };
  if (message.type === "encryption") {
    if (message.xml !== null && typeof message.xml !== "string") return null;
    return { type: "encryption", id, xml: message.xml };
  }
  if (message.type === "first" || message.type === "result") {
    const report = message.report;
    if (!report || typeof report !== "object") return null;
    if (typeof (report as { engineOpened?: unknown }).engineOpened !== "boolean") return null;
    return { type: message.type, id, report: report as CheckReport };
  }
  if (message.type === "opened") {
    return {
      type: "opened",
      id,
      title: optString(message.title),
      sections: optNumber(message.sections) ?? 0,
      toc: parseNavEntries(message.toc),
      openMs: optNumber(message.openMs),
      rangeRequests: optNumber(message.rangeRequests),
      restored: message.restored === true,
      restoredFrom: RESTORED_FROM.has(message.restoredFrom as string)
        ? (message.restoredFrom as "cfi" | "section" | "book" | "start")
        : null,
      fixedLayout: message.fixedLayout === true,
    };
  }
  if (message.type === "relocate") {
    const cfi = optString(message.cfi);
    if (!cfi) return null;
    return {
      type: "relocate",
      id,
      cfi,
      fraction: optNumber(message.fraction),
      tocLabel: optString(message.tocLabel),
      tocHref: optString(message.tocHref),
      sectionIndex: optNumber(message.sectionIndex),
      sectionFraction: optNumber(message.sectionFraction),
      startFraction: optNumber(message.startFraction),
      page: optNumber(message.page),
      pages: optNumber(message.pages),
      sectionCount: optNumber(message.sectionCount),
      sinceTapMs: optNumber(message.sinceTapMs),
      canGoBack: message.canGoBack === true,
    };
  }
  if (message.type === "back-stack") {
    const depth = optNumber(message.depth);
    return { type: "back-stack", id, depth: depth === null ? 0 : Math.max(0, Math.floor(depth)), label: optString(message.label) };
  }
  if (message.type === "turning") return { type: "turning", id, direction: message.direction === -1 ? -1 : 1 };
  if (message.type === "action") {
    return (HOST_ACTIONS as readonly unknown[]).includes(message.action) ? { type: "action", id, action: message.action as HostAction } : null;
  }
  if (message.type === "refused") return { type: "refused", id, kind: optString(message.kind) ?? "unknown" };
  if (message.type === "failed") return { type: "failed", id, error: optString(message.error) ?? "unknown error" };
  if (message.type === "note") {
    return { type: "note", id, open: message.open === true, href: optString(message.href), error: optString(message.error) };
  }
  if (message.type === "external-link") return { type: "external-link", id, href: optString(message.href) ?? "" };
  if (message.type === "debug") {
    const reqId = optString(message.reqId);
    return reqId ? { type: "debug", id, reqId, result: message.result ?? null } : null;
  }
  return null;
}
