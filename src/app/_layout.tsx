import { Stack } from "expo-router";

import { MatrixChannel } from "@/debug/MatrixChannel";
import { t } from "@/i18n";

export default function RootLayout() {
  return (
    <>
      {__DEV__ ? <MatrixChannel /> : null}
      <Stack>
        <Stack.Screen name="index" options={{ title: t().library.title }} />
        <Stack.Screen name="reader/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="checks" options={{ title: t().reader.title }} />
        <Stack.Screen name="settings" options={{ title: t().settings.title }} />
        <Stack.Screen name="customize" options={{ title: t().customize.title }} />
      </Stack>
    </>
  );
}
