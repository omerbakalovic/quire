import { BOOK_SERVER } from "./device-checks.ts";

const ALLOWED_ORIGINS = [BOOK_SERVER, "http://localhost:8765"];

/**
 * Foliate loads each chapter as a blob URL inside an iframe. The WebView
 * whitelist must allow that, and must still refuse every other origin.
 */
export function allowReaderNavigation(url: string): boolean {
  if (url === "about:blank" || url.startsWith("blob:")) return true;
  return ALLOWED_ORIGINS.some((origin) => url.startsWith(`${origin}/`));
}
