import { getDocumentAsync } from "expo-document-picker";
import { Alert } from "react-native";

import { t } from "@/i18n";
import { addFont, removeFont } from "@/library/store";
import { fontExtension, type UserFont } from "@/settings/fonts";

/**
 * Pick a font file from the phone and add it to the reading fonts. The native
 * side checks the file's signature, so a mislabelled file is refused there;
 * the name check here only skips an obvious mistake early.
 */
export async function pickFont(onAdded: (font: UserFont) => void): Promise<void> {
  const strings = t().book;
  const picked = await getDocumentAsync({
    type: ["font/*", "application/x-font-ttf", "application/x-font-otf", "application/octet-stream", "*/*"],
    multiple: false,
    copyToCacheDirectory: false,
  });
  if (picked.canceled || picked.assets.length === 0) return;
  const asset = picked.assets[0];
  if (asset.name && !fontExtension(asset.name)) {
    Alert.alert(strings.fontFailedTitle, strings.fontFailed["not-font"]);
    return;
  }
  try {
    const result = await addFont(asset.uri, asset.name ?? null);
    if (result.ok) onAdded(result.font);
    else Alert.alert(strings.fontFailedTitle, strings.fontFailed[result.reason] ?? strings.fontFailed.unreadable);
  } catch {
    Alert.alert(strings.fontFailedTitle, strings.fontFailed.unreadable);
  }
}

export function confirmRemoveFont(font: UserFont): void {
  const strings = t().book;
  Alert.alert(strings.fontRemoveTitle, strings.fontRemoveBody(font.label), [
    { text: strings.cancel, style: "cancel" },
    { text: strings.fontRemove, style: "destructive", onPress: () => void removeFont(font.id) },
  ]);
}
