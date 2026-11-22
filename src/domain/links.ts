/**
 * Links that leave the book. Only web and mail links may open, and only after
 * the reader confirms. Everything else (javascript:, file:, data:, intent:,
 * content:, app schemes) is refused, because a book is untrusted content.
 */
export type ExternalLink =
  | { kind: "confirm"; url: string; scheme: "http" | "https" | "mailto"; display: string }
  | { kind: "refuse"; reason: "empty" | "scheme" | "malformed" };

const MAX_URL = 2048;

export function classifyExternalLink(href: string | null | undefined): ExternalLink {
  const raw = (href ?? "").trim();
  if (!raw) return { kind: "refuse", reason: "empty" };
  if (raw.length > MAX_URL) return { kind: "refuse", reason: "malformed" };
  // Control characters and spaces inside a URL are a spoofing trick; refuse them.
  if (/[\u0000-\u001f\u007f\s]/.test(raw)) return { kind: "refuse", reason: "malformed" };
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw)?.[1]?.toLowerCase();
  if (scheme !== "http" && scheme !== "https" && scheme !== "mailto") return { kind: "refuse", reason: "scheme" };
  if (scheme === "mailto") {
    const address = raw.slice("mailto:".length).split("?")[0];
    if (!address) return { kind: "refuse", reason: "malformed" };
    return { kind: "confirm", url: raw, scheme, display: decodeSafe(address) };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { kind: "refuse", reason: "malformed" };
  }
  if (!url.hostname || url.username || url.password) return { kind: "refuse", reason: "malformed" };
  return { kind: "confirm", url: url.href, scheme, display: url.hostname };
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
