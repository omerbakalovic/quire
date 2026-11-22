export type CheckReport = { engineOpened: boolean } & Record<string, unknown>;

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
      toc: TocEntry[];
      openMs: number | null;
      rangeRequests: number | null;
      restored: boolean;
    }
  | {
      type: "relocate";
      id: string;
      cfi: string;
      fraction: number | null;
      tocLabel: string | null;
      sectionIndex: number | null;
      sectionCount: number | null;
      sinceTapMs: number | null;
    }
  | { type: "tap"; id: string; zone: "center" }
  | { type: "refused"; id: string; kind: string }
  | { type: "failed"; id: string; error: string }
  | { type: "external-link"; id: string; href: string }
  | { type: "note"; id: string; open: boolean; href: string | null; error: string | null };

export type TocEntry = { label: string; href: string | null; depth: number };

function optString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseToc(value: unknown): TocEntry[] {
  if (!Array.isArray(value)) return [];
  const out: TocEntry[] = [];
  for (const item of value.slice(0, 2000)) {
    if (!item || typeof item !== "object") continue;
    const raw = item as { label?: unknown; href?: unknown; depth?: unknown };
    out.push({
      label: typeof raw.label === "string" ? raw.label.slice(0, 500) : "",
      href: optString(raw.href),
      depth: Math.max(0, Math.min(10, optNumber(raw.depth) ?? 0)),
    });
  }
  return out;
}

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
      toc: parseToc(message.toc),
      openMs: optNumber(message.openMs),
      rangeRequests: optNumber(message.rangeRequests),
      restored: message.restored === true,
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
      sectionIndex: optNumber(message.sectionIndex),
      sectionCount: optNumber(message.sectionCount),
      sinceTapMs: optNumber(message.sinceTapMs),
    };
  }
  if (message.type === "tap") return message.zone === "center" ? { type: "tap", id, zone: "center" } : null;
  if (message.type === "refused") return { type: "refused", id, kind: optString(message.kind) ?? "unknown" };
  if (message.type === "failed") return { type: "failed", id, error: optString(message.error) ?? "unknown error" };
  if (message.type === "note") {
    return { type: "note", id, open: message.open === true, href: optString(message.href), error: optString(message.error) };
  }
  if (message.type === "external-link") return { type: "external-link", id, href: optString(message.href) ?? "" };
  return null;
}
