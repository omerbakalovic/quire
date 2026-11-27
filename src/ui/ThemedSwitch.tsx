import { Switch, type SwitchProps } from "react-native";

import { useChrome, withAlpha } from "@/reader/chrome";

/** A Switch in the current theme's colours rather than the system teal (emulator run 24). */
export function ThemedSwitch(props: SwitchProps & { value: boolean }) {
  const c = useChrome();
  return (
    <Switch
      trackColor={{ false: c.track, true: withAlpha(c.accent.slice(0, 7), 0.5) }}
      thumbColor={props.value ? c.accent : c.panel}
      {...props}
    />
  );
}
