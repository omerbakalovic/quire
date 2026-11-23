/**
 * @font-face rules for the reading font the host chose (src/settings/fonts.ts).
 * The page fetches each file from the loopback server's fonts/ route and
 * hands the book a blob: URL, so the book's own CSP (font-src blob: data:)
 * stays as strict as it is. The values come from the host but end up inside
 * CSS, so they are still checked.
 */
const FILE = /^[a-z0-9-]{1,80}\.(woff2|woff|ttf|otf)$/;
const FAMILY = /^Quire [A-Za-z0-9 -]{1,40}$/;
const RANGE = /^[U+0-9A-Fa-f?,\- ]{1,2000}$/;
const FORMAT = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" };
export const MAX_FACES = 64;
const MAX_BYTES = 8 * 1024 * 1024;

/** The faces worth declaring, cleaned. */
export function cleanFaces(faces) {
  if (!Array.isArray(faces)) return [];
  const out = [];
  for (const face of faces.slice(0, MAX_FACES)) {
    if (!face || typeof face !== "object") continue;
    const match = typeof face.file === "string" ? FILE.exec(face.file) : null;
    if (!match || typeof face.family !== "string" || !FAMILY.test(face.family)) continue;
    out.push({
      file: face.file,
      family: face.family,
      format: FORMAT[match[1]],
      weight: Number.isInteger(face.weight) && face.weight >= 100 && face.weight <= 900 ? face.weight : 400,
      style: face.style === "italic" ? "italic" : "normal",
      range: typeof face.range === "string" && RANGE.test(face.range) ? face.range : null,
    });
  }
  return out;
}

/** `urlFor(file)` gives the URL to load, or null to leave that face out. */
export function fontFaceCss(faces, urlFor) {
  const rules = [];
  for (const face of cleanFaces(faces)) {
    const url = urlFor(face.file);
    if (typeof url !== "string") continue;
    const range = face.range ? `; unicode-range: ${face.range}` : "";
    rules.push(
      `@font-face { font-family: "${face.family}"; src: url("${url}") format("${face.format}"); font-weight: ${face.weight}; font-style: ${face.style}; font-display: block${range}; }`,
    );
  }
  return rules.join("\n");
}

const loaded = new Map();

/**
 * Fetch every face's file once per page and give back the CSS that declares
 * them. A file that fails to load is left out; the font stack falls back.
 */
export async function fontCss(faces, base = location.href, fetchFn = fetch) {
  const clean = cleanFaces(faces);
  await Promise.all(
    clean.map(async (face) => {
      if (loaded.has(face.file)) return;
      const pending = (async () => {
        try {
          const response = await fetchFn(new URL(`fonts/${face.file}`, base).href);
          if (!response.ok) return null;
          const blob = await response.blob();
          if (blob.size === 0 || blob.size > MAX_BYTES) return null;
          return URL.createObjectURL(blob);
        } catch {
          return null;
        }
      })();
      loaded.set(face.file, pending);
      // A failure is not cached, so the next look tries again.
      if ((await pending) === null) loaded.delete(face.file);
    }),
  );
  const urls = new Map();
  for (const face of clean) urls.set(face.file, (await loaded.get(face.file)) ?? null);
  return fontFaceCss(clean, (file) => urls.get(file));
}
