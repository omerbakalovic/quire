/** Dev-only loopback. adb reverse forwards this port to the computer. */
export const BOOK_SERVER = "http://127.0.0.1:8765";

export const DEVICE_CHECKS = [
  { id: "scripted", file: "fixtures/scripted.epub", mode: "script" },
  { id: "drm", file: "fixtures/drm.epub", mode: "drm" },
  { id: "font", file: "fixtures/font-obfuscation.epub", mode: "font" },
  { id: "chapter", file: "fixtures/noteref.epub", mode: "chapter" },
  { id: "table", file: "fixtures/noteref.epub", mode: "table" },
  { id: "large", file: "downloaded/pg1184-images.epub", mode: "large" },
] as const;

export type DeviceCheck = (typeof DEVICE_CHECKS)[number];
export type CheckMode = DeviceCheck["mode"];
