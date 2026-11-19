export type HostToReader = {
  type: "ping";
  id: string;
};

export type ReaderToHost = {
  type: "pong";
  id: string;
};

export function parseReaderMessage(raw: string): ReaderToHost | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const message = value as { type?: unknown; id?: unknown };
  if (message.type !== "pong") return null;
  if (typeof message.id !== "string" || message.id.length === 0) return null;
  return { type: "pong", id: message.id };
}
