export type ReadMode = "range" | "blob";
export type CheckMode = "script" | "drm" | "font" | "read" | "large";

export type DeviceCheck = {
  id: string;
  bookId: string;
  fileName: string;
  mode: CheckMode;
  read: ReadMode;
};

/** One launch runs one of these. The host selects it with quireCheck. */
export const DEVICE_CHECKS: readonly DeviceCheck[] = [
  { id: "frankenstein-range", bookId: "frankenstein", fileName: "se-frankenstein.epub", mode: "read", read: "range" },
  { id: "frankenstein-blob", bookId: "frankenstein", fileName: "se-frankenstein.epub", mode: "read", read: "blob" },
  { id: "large-range", bookId: "large", fileName: "pg1184-images.epub", mode: "large", read: "range" },
  { id: "large-blob", bookId: "large", fileName: "pg1184-images.epub", mode: "large", read: "blob" },
  { id: "scripted", bookId: "scripted", fileName: "scripted.epub", mode: "script", read: "range" },
  { id: "drm", bookId: "drm", fileName: "drm.epub", mode: "drm", read: "range" },
  { id: "font", bookId: "font", fileName: "font-obfuscation.epub", mode: "font", read: "range" },
];

export function checkForLaunch(name: string | null | undefined): DeviceCheck | null {
  if (!name) return null;
  return DEVICE_CHECKS.find((check) => check.id === name) ?? null;
}
