export type CheckReport = { engineOpened: boolean } & Record<string, unknown>;

export type ReaderToHost =
  | { type: "pong"; id: string }
  | { type: "encryption"; id: string; xml: string | null }
  | { type: "first"; id: string; report: CheckReport }
  | { type: "result"; id: string; report: CheckReport };

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
  const message = value as { type?: unknown; id?: unknown; xml?: unknown; report?: unknown };
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
  return null;
}
