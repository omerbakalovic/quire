/**
 * Android hands "Open with Quire" to the app as a content:// (or file://) URL,
 * which is not a screen. The library screen imports the book through
 * takeIncomingBooks(), so the router just shows the library.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (/^(content|file):/i.test(path)) return "/";
  return path;
}
