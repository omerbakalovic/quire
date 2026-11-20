const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);

/** The port is chosen at launch. The whitelist is the host, not one port. */
export const READER_ORIGIN_WHITELIST = ["http://127.0.0.1:*", "http://localhost:*", "blob:*"];

/**
 * Foliate loads each chapter as a blob URL inside an iframe. The WebView
 * whitelist must allow that, and must still refuse every other host.
 */
export function allowReaderNavigation(url: string): boolean {
  if (url === "about:blank" || url.startsWith("blob:")) return true;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:") return false;
  return LOOPBACK_HOSTS.has(parsed.hostname);
}
