import type { EncryptionKind } from "../domain/drm.ts";

/** DRM never reaches the engine. Font obfuscation and plain books do. */
export function decideOpen(kind: EncryptionKind): boolean {
  return kind !== "drm";
}
