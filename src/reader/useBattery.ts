import { useEffect, useState } from "react";

type Subscription = { remove(): void };
type BatteryModule = {
  getBatteryLevelAsync(): Promise<number>;
  getBatteryStateAsync(): Promise<number>;
  addBatteryLevelListener(listener: (event: { batteryLevel: number }) => void): Subscription;
  addBatteryStateListener(listener: (event: { batteryState: number }) => void): Subscription;
  BatteryState: { CHARGING: number; FULL: number };
};

let cached: BatteryModule | null | undefined;

/** expo-battery, or null on a build without it (an APK from before the module was added). */
function batteryModule(): BatteryModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("expo-battery") as BatteryModule;
  } catch {
    cached = null;
  }
  return cached;
}

export type Battery = { level: number; charging: boolean } | null;

/** The battery level and whether it charges, only while something shows it. Null when unknown. */
export function useBattery(active: boolean): Battery {
  const [battery, setBattery] = useState<Battery>(null);
  useEffect(() => {
    const module = batteryModule();
    if (!module || !active) return;
    let live = true;
    let level = -1;
    let charging = false;
    const publish = () => {
      if (live) setBattery(level >= 0 ? { level, charging } : null);
    };
    const isCharging = (state: number) => state === module.BatteryState.CHARGING || state === module.BatteryState.FULL;
    Promise.all([module.getBatteryLevelAsync(), module.getBatteryStateAsync()])
      .then(([l, s]) => {
        level = l;
        charging = isCharging(s);
        publish();
      })
      .catch((error: unknown) => console.warn("battery", error));
    const levels = module.addBatteryLevelListener(({ batteryLevel }) => {
      level = batteryLevel;
      publish();
    });
    const states = module.addBatteryStateListener(({ batteryState }) => {
      charging = isCharging(batteryState);
      publish();
    });
    return () => {
      live = false;
      levels.remove();
      states.remove();
    };
  }, [active]);
  return active ? battery : null;
}
