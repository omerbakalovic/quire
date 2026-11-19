/** Font obfuscation is allowed. Any other encryption algorithm is DRM. */
const FONT_OBFUSCATION_ALGORITHMS = [
  "http://www.idpf.org/2008/embedding",
  "http://ns.adobe.com/pdf/enc#RC",
] as const;

export type EncryptionKind = "none" | "font-obfuscation" | "drm";

export function findEncryptionAlgorithms(xml: string): string[] {
  const found: string[] = [];
  const pattern = /Algorithm\s*=\s*["']([^"']+)["']/g;
  for (const match of xml.matchAll(pattern)) {
    found.push(match[1]);
  }
  return found;
}

export function classifyEncryption(xml: string | null | undefined): EncryptionKind {
  if (!xml || xml.trim().length === 0) return "none";
  const algorithms = findEncryptionAlgorithms(xml);
  if (algorithms.length === 0) return "none";
  const fontOnly = algorithms.every((algorithm) =>
    FONT_OBFUSCATION_ALGORITHMS.some((known) => algorithm === known),
  );
  return fontOnly ? "font-obfuscation" : "drm";
}
