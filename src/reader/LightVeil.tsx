import { StyleSheet, View } from "react-native";

/**
 * The software dimmer and warm filter: two veils over the page that never take
 * touches. They sit above the book and below the reader's controls, so the
 * controls stay readable at full dim.
 */
export function LightVeil({ dimmer, warmth }: { dimmer: number; warmth: number }) {
  if (dimmer <= 0 && warmth <= 0) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {warmth > 0 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: "#ff8a00", opacity: warmth * 0.5 }]} /> : null}
      {dimmer > 0 ? <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000000", opacity: dimmer }]} /> : null}
    </View>
  );
}
