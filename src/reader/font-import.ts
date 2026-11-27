import { getDocumentAsync } from "expo-document-picker";

import { t } from "@/i18n";
import { addFont, removeFont } from "@/library/store";
import type { Chrome } from "@/reader/chrome";
import { confirm } from "@/ui/confirm";
import { fontExtension, type UserFont } from "@/settings/fonts";

/**
 * Pick a font file from the phone and add it to the reading fonts. The native
 * side checks the file's signature, so a mislabelled file is refused there;
 * the name check here only skips an obvious mistake early.
 */
export async function pickFont(onAdded: (font: UserFont) => void, chrome?: Chrome): Promise<void> {
  const strings = t().book;
  const failed = (body: string) => confirm({ title: strings.fontFailedTitle, body, chrome, buttons: [{ text: t().library.ok }] });
  const picked = await getDocumentAsync({
    type: ["font/*", "application/x-font-ttf", "application/x-font-otf", "application/octet-stream", "*/*"],
    multiple: false,
    copyToCacheDirectory: false,
  });
  if (picked.canceled || picked.assets.length === 0) return;
  const asset = picked.assets[0];
  if (asset.name && !fontExtension(asset.name)) {
    failed(strings.fontFailed["not-font"]);
    return;
  }
  try {
    const result = await addFont(asset.uri, asset.name ?? null);
    if (result.ok) onAdded(result.font);
    else failed(strings.fontFailed[result.reason] ?? strings.fontFailed.unreadable);
  } catch {
    failed(strings.fontFailed.unreadable);
  }
}

export function confirmRemoveFont(font: UserFont, chrome?: Chrome): void {
  const strings = t().book;
  confirm({
    title: strings.fontRemoveTitle,
    body: strings.fontRemoveBody(font.label),
    chrome,
    buttons: [
      { text: strings.cancel, style: "cancel" },
      { text: strings.fontRemove, style: "destructive", onPress: () => void removeFont(font.id) },
    ],
  });
}
