import * as WebBrowser from "expo-web-browser";
import { Linking } from "react-native";

import { classifyExternalLink } from "@/domain/links";
import { t } from "@/i18n";
import type { Chrome } from "@/reader/chrome";
import { confirm } from "@/ui/confirm";

type Colours = { toolbar?: string; controls?: string; chrome?: Chrome };

/**
 * A link that leaves the book. Unsafe schemes are refused with a notice. After
 * the reader confirms, a web page opens in a browser tab inside Quire (a
 * Custom Tab in the app's own task), so Back or ✕ returns to the same page;
 * if no browser offers such tabs it falls back to the browser app. Mail links
 * open the mail app.
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
        onPress: () => {
          if (mail) {
            void leave();
            return;
          }
          WebBrowser.openBrowserAsync(link.url, {
            toolbarColor: colours.toolbar,
            controlsColor: colours.controls,
            showTitle: true,
            enableBarCollapsing: true,
            // In Quire's own task: Back closes the tab instead of switching apps.
            createTask: false,
          }).catch(() => void leave());
        },
      },
    ],
  });
}
