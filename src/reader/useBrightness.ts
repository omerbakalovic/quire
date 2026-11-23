import { useEffect } from "react";
import { AppState } from "react-native";

type BrightnessModule = {
  setBrightnessAsync(value: number): Promise<void>;
  restoreSystemBrightnessAsync(): Promise<void>;
};

let cached: BrightnessModule | null | undefined;

/** expo-brightness, or null on a build without it (an APK from before the module was added). */
function brightness(): BrightnessModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("expo-brightness") as BrightnessModule;
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * The reader's brightness (spec 4E). It sets the reader window's brightness
 * only, never the system setting, and hands control back to the system when
 * the reader closes or the app goes to the background. 0 means "follow the system".
 */
export function useBrightness(level: number, active: boolean) {
  useEffect(() => {
    const module = brightness();
    if (!module || !active) return;
    const apply = () => {
      const run = level > 0 ? module.setBrightnessAsync(Math.min(1, level)) : module.restoreSystemBrightnessAsync();
      run.catch((error: unknown) => console.warn("brightness", error));
    };
    const restore = () => {
      module.restoreSystemBrightnessAsync().catch((error: unknown) => console.warn("brightness restore", error));
    };
    apply();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") apply();
      else restore();
    });
    return () => {
      subscription.remove();
      restore();
    };
  }, [level, active]);
}
