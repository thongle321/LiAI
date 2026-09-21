import "../global.css";
import { Stack } from "expo-router";
import {
  Raleway_400Regular,
  Raleway_500Medium,
  Raleway_600SemiBold,
  useFonts,
} from "@expo-google-fonts/raleway";
import { Uniwind } from "uniwind";

import { colors } from "../themes/tokens.ts";

// Dark-only app (design_system.png): lock theme so device light mode
// can't wash out the dystopian palette.
Uniwind.setTheme("dark");

export default function RootLayout() {
  const [loaded] = useFonts({
    Raleway_400Regular,
    Raleway_500Medium,
    Raleway_600SemiBold,
  });

  // ponytail: no expo-splash-screen dep — gate render so nothing paints
  // in the system font. Add it when the blank-dark flash bothers.
  if (!loaded) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.base },
      }}
    >
      <Stack.Screen name="index" />
      {/* Bottom tabs own chat + voice (app/(tabs)/_layout.tsx): tab
          switches never animate, so the shared bar stays static. */}
      <Stack.Screen name="(tabs)" options={{ animation: "none" }} />
      {/* Standalone vision screen: same instant-switch discipline —
          the camera fades itself in, nothing else moves. */}
      <Stack.Screen name="vision" options={{ animation: "none" }} />
      <Stack.Screen name="settings" />
      <Stack.Screen name="about" />
      <Stack.Screen name="models" />
    </Stack>
  );
}