import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";

import { MatrixChannel } from "@/debug/MatrixChannel";
import { t } from "@/i18n";
import { useLibrary } from "@/library/store";
import { chromeFor, ChromeProvider } from "@/reader/chrome";
import { appThemeId } from "@/settings/customization";
import { themeFor } from "@/settings/themes";
import { ConfirmHost } from "@/ui/confirm";

/**
 * The app theme (roadmap 2.3, C3) colours every screen outside a book; the
 * reader and Reading Look opened from a book provide the book's theme instead.
 */
export default function RootLayout() {
  const library = useLibrary();
  const themeId = appThemeId(library.custom);
  const themes = library.custom.themes;
  const chrome = useMemo(() => chromeFor(themeFor(themeId, themes)), [themeId, themes]);
  return (
    <ChromeProvider chrome={chrome}>
      <StatusBar style={chrome.statusBar} />
      {__DEV__ ? <MatrixChannel /> : null}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: chrome.panel },
          headerTintColor: chrome.ink,
          contentStyle: { backgroundColor: chrome.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: t().library.title }} />
        <Stack.Screen name="reader/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="checks" options={{ title: t().reader.title }} />
        <Stack.Screen name="settings" options={{ title: t().settings.title }} />
        <Stack.Screen name="customize" options={{ title: t().customize.title }} />
        <Stack.Screen name="look" options={{ title: t().look.title }} />
      </Stack>
      <ConfirmHost />
    </ChromeProvider>
  );
}
