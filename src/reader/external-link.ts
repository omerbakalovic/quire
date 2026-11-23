import { Alert, Linking } from "react-native";

import { classifyExternalLink } from "@/domain/links";
import { t } from "@/i18n";

/**
 * A link that leaves the book. Unsafe schemes are refused with a notice;
 * web and mail links open in the system app only after the reader confirms.
 */
export function confirmExternalLink(href: string, notify: (text: string) => void): void {
  const strings = t().book;
  const link = classifyExternalLink(href);
  if (link.kind === "refuse") {
    notify(strings.externalRefused);
    return;
  }
  Alert.alert(strings.externalTitle, `${strings.externalBody(link.display)}\n\n${link.url}`, [
    { text: strings.cancel, style: "cancel" },
    {
      text: strings.externalOpen,
      onPress: () => {
        Linking.openURL(link.url).catch(() => notify(strings.externalFailed));
      },
    },
  ]);
}
