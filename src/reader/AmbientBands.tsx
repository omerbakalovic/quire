import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { t } from "@/i18n";
import { BAND_PX, bandsOf, slotText, type AmbientInfo } from "@/settings/layout";
import { AMBIENT_SLOTS, type Resolved } from "@/settings/registry";
import type { ThemeTokens } from "@/settings/themes";

import { useBattery } from "./useBattery";

type Insets = { top: number; bottom: number; left: number; right: number };

type Props = {
  settings: Resolved;
  theme: ThemeTokens;
  insets: Insets;
  /** In scroll mode the text runs under the bands, so they get the page colour behind them. */
  scrolled: boolean;
  info: Omit<AmbientInfo, "now" | "battery">;
};

/** The page's top and bottom margin, as the reader page sizes it (src/reader-page/app.js, applyMargin). */
export function pageMargin(insets: Insets, band: number): number {
  return Math.max(48, Math.round(Math.max(insets.top, insets.bottom) + 12 + band));
}

/**
 * The header and footer lines (layout slots): book and chapter titles, page,
 * time left, percent, clock, battery, in the page's margin bands in the theme's muted ink. They
 * take no touches, so taps still reach the page.
 */
export function AmbientBands({ settings, theme, insets, scrolled, info }: Props) {
  const strings = t().book;
  const bands = bandsOf(settings);
  const usesClock = AMBIENT_SLOTS.some((slot) => settings[slot].includes("clock"));
  const now = useMinute(usesClock);
  const battery = useBattery(AMBIENT_SLOTS.some((slot) => settings[slot].includes("battery")));
  if (!bands.top && !bands.bottom) return null;
  const margin = pageMargin(insets, BAND_PX);
  const words = {
    pageOf: strings.pageOf,
    pagesLeft: strings.pagesLeft,
    lastPage: strings.lastPage,
    leftInChapter: strings.leftInChapter,
    leftInBook: strings.leftInBook,
    battery: strings.battery,
  };
  const full = { ...info, now, battery };
  const line = (slots: [string, string, string], key: "top" | "bottom") => {
    const [left, center, right] = slots.map((slot) => slotText(settings[slot as (typeof AMBIENT_SLOTS)[number]], full, words));
    const edge = key === "top" ? insets.top : insets.bottom;
    return (
      <View
        key={key}
        pointerEvents="none"
        style={[
          styles.band,
          key === "top" ? { top: 0, paddingTop: edge } : { bottom: 0, paddingBottom: edge },
          { height: margin, paddingLeft: 16 + insets.left, paddingRight: 16 + insets.right },
          scrolled && { backgroundColor: theme.page },
        ]}
      >
        <Text numberOfLines={1} style={[styles.text, styles.left, { color: theme.inkMuted }]}>
          {left}
        </Text>
        {/* An empty centre gives its width to the sides, so "7 pages left in chapter" fits. */}
        {center ? (
          <Text numberOfLines={1} style={[styles.text, styles.center, { color: theme.inkMuted }]}>
            {center}
          </Text>
        ) : null}
        <Text numberOfLines={1} style={[styles.text, styles.right, { color: theme.inkMuted }]}>
          {right}
        </Text>
      </View>
    );
  };
  return (
    <>
      {bands.top ? line(["layout.header.left", "layout.header.center", "layout.header.right"], "top") : null}
      {bands.bottom ? line(["layout.footer.left", "layout.footer.center", "layout.footer.right"], "bottom") : null}
    </>
  );
}

/** The current time, updated on the minute, only while something shows a clock. */
function useMinute(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    setNow(new Date());
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const date = new Date();
      setNow(date);
      timer = setTimeout(tick, 60_000 - (date.getSeconds() * 1000 + date.getMilliseconds()) + 50);
    };
    timer = setTimeout(tick, 60_000 - (new Date().getSeconds() * 1000) + 50);
    return () => clearTimeout(timer);
  }, [active]);
  return now;
}

const styles = StyleSheet.create({
  band: { position: "absolute", left: 0, right: 0, flexDirection: "row", alignItems: "center", gap: 8 },
  text: { flex: 1, fontSize: 12, letterSpacing: 0.2 },
  left: { textAlign: "left" },
  center: { textAlign: "center" },
  right: { textAlign: "right" },
});
