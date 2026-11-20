/** Applied inside book HTML. Publisher CSS stays. Scripts do not. */
export const BOOK_CSP = [
  "default-src 'none'",
  "img-src blob: data:",
  "style-src 'unsafe-inline' blob: data:",
  "font-src blob: data:",
  "media-src blob: data:",
  "script-src 'none'",
].join("; ");

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${BOOK_CSP}"/>`;

export function hasBookCsp(html: string): boolean {
  return /http-equiv\s*=\s*["']Content-Security-Policy["']/i.test(html);
}

/** Insert a CSP meta as the first thing in head, before any script can run. */
export function ensureBookCsp(html: string): string {
  if (hasBookCsp(html)) return html;
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (match) => `${match}${CSP_META}`);
  }
  if (/<html\b[^>]*>/i.test(html)) {
    return html.replace(/<html\b[^>]*>/i, (match) => `${match}<head>${CSP_META}</head>`);
  }
  return `<head>${CSP_META}</head>${html}`;
}
