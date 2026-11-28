import { Linking } from "react-native";

import { classifyExternalLink } from "@/domain/links";
import { t } from "@/i18n";
import type { Chrome } from "@/reader/chrome";
import { confirm } from "@/ui/confirm";

type Colours = { chrome?: Chrome };

/**
 * A link that leaves the book. Unsafe schemes are refused with a notice. After
 * the reader confirms, the link goes to the phone's own default app for it: a
 * web page to the default browser, a mail link to the mail app. Quire has no
 * browser of its own and no tie to any one browser, so which browser sees the
 * page, and how private that is, stays the reader's choice (Omer, 2026-11-28).
 */
export function confirmExternalLink(
  href: string,
  notify: (text: string) => void,
  colours: Colours = {},
): void {
  const strings = t().book;
  const link = classifyExternalLink(href);
  if (link.kind === "refuse") {
    notify(strings.externalRefused);
    return;
  }
  const mail = link.scheme === "mailto";
  const body = mail
    ? strings.externalMailBody(link.display)
    : strings.externalBody(link.display);
  const leave = () =>
    Linking.openURL(link.url).catch(() => notify(strings.externalFailed));
  confirm({
    title: strings.externalTitle,
    body: `${body}\n\n${link.url}`,
    chrome: colours.chrome,
    buttons: [
      { text: strings.cancel, style: "cancel" },
      {
        text: strings.externalOpen,
        onPress: () => void leave(),
      },
    ],
  });
}
