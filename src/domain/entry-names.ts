/**
 * Import skip rule for a zip entry name, as stored.
 * Do not percent-decode first: a percent-encoded href must still resolve.
 * A `..` segment, an absolute path, or a backslash is skipped.
 * Skipping one entry does not reject the book.
 */
export function entryNameSkipped(name: string): boolean {
  if (name.includes("\\") || name.includes("\0")) return true;
  if (name.startsWith("/") || name.startsWith("//")) return true;
  if (/^[A-Za-z]:/.test(name)) return true;
  return name.split("/").some((part) => part === "..");
}
