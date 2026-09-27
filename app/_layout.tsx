import "../global.css";
import { Stack } from "expo-router";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Host } from "@expo/ui";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { Uniwind } from "uniwind";

import { colors } from "../themes/tokens.ts";

// Light-locked (DESIGN.md): one theme, and it is the light one —
// device dark mode must not invent a second world.
Uniwind.setTheme("light");

export default function RootLayout() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  // Gate first paint on the font resolving so nothing flashes in the
  // system typeface (DESIGN.md, Single Family Rule).
  if (!loaded) return null;

  return (
    // One Host for the whole app: it seeds every @expo/ui subtree with
    // Signal Blue and forces the light scheme, so native switches, sheets
    // and pickers land in LiAI's world instead of the platform's default.
    <Host colorScheme="light" seedColor={colors.primary} style={{ flex: 1 }}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* One keyboard event source for the whole app. No translucent flags:
            the runtime logs "statusBarTranslucent and navigationBarTranslucent
            values are ignored when using react-native-edge-to-edge", and the
            library's docs confirm it sets them itself in that mode. The app
            is edge-to-edge, so they were dead props being passed on every
            launch. (An earlier comment here claimed they were what made the
            keyboard height correct. That was a guess, and it was wrong.) */}
        <KeyboardProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.base },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="onboarding" />
            {/* Drawer group owns (tabs) + the navigator drawer (app/(drawer)/).
                Tab switches never animate, so the shared bar stays static. */}
            <Stack.Screen name="(drawer)" options={{ animation: "none" }} />
            {/* Standalone vision screen: same instant-switch discipline —
                the camera fades itself in, nothing else moves. */}
            <Stack.Screen name="vision" options={{ animation: "none" }} />
            <Stack.Screen name="settings" />
            <Stack.Screen name="about" />
            <Stack.Screen name="models" />
          </Stack>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </Host>
  );
}