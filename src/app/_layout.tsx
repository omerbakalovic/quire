import { Stack } from "expo-router";

import { t } from "@/i18n";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: t().library.title }} />
      <Stack.Screen name="reader/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="checks" options={{ title: t().reader.title }} />
    </Stack>
  );
}
