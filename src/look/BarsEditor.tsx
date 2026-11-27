import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { t } from "@/i18n";
import { useChrome } from "@/reader/chrome";
import {
  addElement,
  available,
  draftFrom,
  moveAcross,
  moveAlong,
  placeOf,
  REGIONS,
  removeElement,
  setArrange,
  type BarDraft,
  type EditResult,
  type Region,
  type RegionId,
} from "@/settings/bar-editor";
import { arrangeKey, type Bar } from "@/settings/bars";
import { LAYOUT_PRESETS, presetOf, presetValues } from "@/settings/layout";
import { ARRANGEMENTS, type Resolved } from "@/settings/registry";

type Props = {
  /** The saved look where Reading Look is saving. */
  settings: Resolved;
  draft: BarDraft | null;
  onDraft: (draft: BarDraft | null) => void;
  onNotice: (text: string) => void;
};

type Selection = { element: string; kind: Region["kind"] } | null;

/**
 * The Bars tab (docs/customization-roadmap.md, C5): the header and footer
 * lines and the three tap bars, each as start, centre and end zones. A tapped
 * item gets ◀ ▶ (along its row, across zones), ▲ ▼ (to the row above or
 * below that takes it) and Remove; the same are accessibility actions on the
 * item. Every change goes into a draft that only Save keeps (roadmap 2.6).
 */
export function BarsEditor({ settings, draft, onDraft, onNotice }: Props) {
  const c = useChrome();
  const strings = t().look.bars;
  const names = t().customize;
  const current = draft ?? draftFrom(settings);
  const [selected, setSelected] = useState<Selection>(null);
  const [adding, setAdding] = useState<{ region: RegionId; zone: number } | null>(null);

  const nameOf = (element: string, kind: Region["kind"]) => (kind === "lines" ? names.elements[element] : names.controls[element]) ?? element;
  const zoneNames = (region: Region) => (region.kind === "lines" ? strings.lineZones : strings.zones);

  const apply = (result: EditResult) => {
    if (result.refused === "full") onNotice(strings.full);
    else if (result.refused === "edge") onNotice(strings.edge);
    if (result.draft !== current) onDraft(result.draft);
  };

  const act = (element: string, kind: Region["kind"], action: "earlier" | "later" | "up" | "down" | "remove") => {
    if (action === "remove") {
      onDraft(removeElement(current, element, kind));
      setSelected(null);
    } else if (action === "earlier" || action === "later") apply(moveAlong(current, element, kind, action === "earlier" ? -1 : 1));
    else apply(moveAcross(current, element, kind, action === "up" ? -1 : 1));
  };

  const chip = (key: string, text: string, on: boolean, onPress: () => void, extra?: object) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.chip, { borderColor: c.line }, on && { backgroundColor: c.accent, borderColor: c.accent }]}
      {...extra}
    >
      <Text style={[styles.chipText, { color: on ? c.onAccent : c.ink }, on && styles.bold]} numberOfLines={1}>
        {text}
      </Text>
    </Pressable>
  );

  const preset = presetOf({ ...settings, ...current } as Resolved);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.help, { color: c.muted }]}>{strings.help}</Text>
      <View style={styles.chips}>
        {LAYOUT_PRESETS.map((option) =>
          chip(option, names.layoutPresets[option] ?? option, preset === option, () => onDraft({ ...current, ...(presetValues(option) as BarDraft) })),
        )}
        {preset === null ? chip("custom", names.layoutCustom, true, () => undefined) : null}
      </View>
      {REGIONS.map((region) => {
        const regionName = strings.regions[region.id];
        const zones = zoneNames(region);
        const mine = selected && selected.kind === region.kind ? placeOf(current, selected.element, region.kind) : null;
        const here = mine?.region === region.id ? selected : null;
        return (
          <View key={region.id} style={[styles.region, { borderColor: c.line }]}>
            <View style={styles.regionHead}>
              <Text style={[styles.regionTitle, { color: c.ink }]} accessibilityRole="header">
                {regionName}
              </Text>
              {region.kind === "controls" ? (
                <View style={styles.chips}>
                  {ARRANGEMENTS.map((option) =>
                    chip(option, strings.arrange[option], current[arrangeKey(region.id as Bar)] === option, () => onDraft(setArrange(current, region.id as Bar, option))),
                  )}
                </View>
              ) : null}
            </View>
            <View style={styles.zones}>
              {region.keys.map((key, zone) => {
                const items = (current[key] as readonly string[] | undefined) ?? [];
                return (
                  <View key={key} style={[styles.zone, { borderColor: c.line }]}>
                    <Text style={[styles.zoneTitle, { color: c.muted }]}>{zones[zone]}</Text>
                    {items.length === 0 ? <Text style={[styles.empty, { color: c.muted }]}>{strings.empty}</Text> : null}
                    {items.map((element) => {
                      const name = nameOf(element, region.kind);
                      const on = here?.element === element;
                      return chip(element, name, on, () => setSelected(on ? null : { element, kind: region.kind }), {
                        accessibilityLabel: on ? strings.selected(name) : strings.itemLabel(name, zones[zone], regionName),
                        accessibilityActions: [
                          { name: "earlier", label: strings.earlier },
                          { name: "later", label: strings.later },
                          { name: "up", label: strings.up },
                          { name: "down", label: strings.down },
                          { name: "remove", label: strings.remove },
                        ],
                        onAccessibilityAction: (event: { nativeEvent: { actionName: string } }) =>
                          act(element, region.kind, event.nativeEvent.actionName as "earlier" | "later" | "up" | "down" | "remove"),
                      });
                    })}
                    {chip(`add-${key}`, strings.add, adding?.region === region.id && adding.zone === zone, () =>
                      setAdding(adding?.region === region.id && adding.zone === zone ? null : { region: region.id, zone }), { accessibilityLabel: strings.addLabel(zones[zone], regionName) })}
                  </View>
                );
              })}
            </View>
            {here ? (
              <View style={styles.toolbar}>
                {(
                  [
                    ["earlier", "◀"],
                    ["later", "▶"],
                    ["up", "▲"],
                    ["down", "▼"],
                  ] as const
                ).map(([action, glyph]) => (
                  <Pressable key={action} onPress={() => act(here.element, here.kind, action)} accessibilityRole="button" accessibilityLabel={strings[action]} style={[styles.tool, { borderColor: c.line }]}>
                    <Text style={[styles.toolText, { color: c.ink }]}>{glyph}</Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => act(here.element, here.kind, "remove")} accessibilityRole="button" style={[styles.tool, styles.toolWide, { borderColor: c.line }]}>
                  <Text style={[styles.toolLabel, { color: c.danger }]}>{strings.remove}</Text>
                </Pressable>
              </View>
            ) : null}
            {adding?.region === region.id ? (
              <View style={styles.addBox}>
                <Text style={[styles.small, { color: c.muted }]}>{strings.addTitle(zones[adding.zone])}</Text>
                <View style={styles.chips}>
                  {available(current, region.id).map((element) =>
                    chip(`pick-${element}`, nameOf(element, region.kind), false, () => {
                      apply(addElement(current, region.id, adding.zone, element));
                      setAdding(null);
                    }),
                  )}
                  {available(current, region.id).length === 0 ? <Text style={[styles.small, { color: c.muted }]}>{strings.nothingToAdd}</Text> : null}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  help: { fontSize: 14, lineHeight: 20 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  chip: { minHeight: 36, paddingHorizontal: 10, borderRadius: 18, borderWidth: 1, justifyContent: "center", maxWidth: "100%" },
  chipText: { fontSize: 13 },
  bold: { fontWeight: "600" },
  region: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, padding: 8, gap: 8 },
  regionHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 6 },
  regionTitle: { fontSize: 15, fontWeight: "600" },
  zones: { flexDirection: "row", gap: 6 },
  zone: { flex: 1, minWidth: 0, gap: 4, borderWidth: 1, borderStyle: "dashed", borderRadius: 8, padding: 4, alignItems: "stretch" },
  zoneTitle: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  empty: { fontSize: 12, fontStyle: "italic" },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tool: { minWidth: 44, minHeight: 44, borderWidth: 1, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  toolWide: { paddingHorizontal: 12 },
  toolText: { fontSize: 18 },
  toolLabel: { fontSize: 15, fontWeight: "600" },
  addBox: { gap: 6 },
  small: { fontSize: 13, lineHeight: 18 },
});
