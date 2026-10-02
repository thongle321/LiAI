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
import { ScopedVariables, Uniwind } from "uniwind";

import { colors } from "../themes/tokens.ts";
import { SnackbarProvider } from "../components/Snackbar.tsx";
import { useEngineOffload } from "../hooks/useEngineOffload.ts";
import { useFluidTextVariables } from "../hooks/useFluidTextScale.ts";

// Light-locked (DESIGN.md): one theme, and it is the light one —
// device dark mode must not invent a second world.
Uniwind.setTheme("light");

export default function RootLayout() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  // Release the loaded model when the app is backgrounded, so a multi-GB
  // GGUF is not held resident (Settings > Model Loading).
  useEngineOffload();
  // Fluid Type (DESIGN.md): --text-* overrides for this device's width.
  // Must be called before any early return (hook order).
  const typeVars = useFluidTextVariables();

  // Gate first paint on the font resolving so nothing flashes in the
  // system typeface (DESIGN.md, Single Family Rule).
  if (!loaded) return null;

  return (
    // One Host for the whole app: it seeds every @expo/ui subtree with
    // Signal Blue and forces the light scheme, so native switches, sheets
    // and pickers land in LiAI's world instead of the platform's default.
    <Host colorScheme="light" seedColor={colors.primary} style={{ flex: 1 }}>
      {/* Fluid Type (DESIGN.md): scoped --text-* overrides so every
          text-* class re-resolves at this device's width (375dp base,
          factor 0.5, clamp [0.9, 1.1]). One wrap, zero call sites. */}
      <ScopedVariables variables={typeVars}>
        <GestureHandlerRootView style={{ flex: 1 }}>
        {/* One keyboard event source for the whole app. No translucent flags:
            the runtime logs "statusBarTranslucent and navigationBarTranslucent
            values are ignored when using react-native-edge-to-edge", and the
            library's docs confirm it sets them itself in that mode. The app
            is edge-to-edge, so they were dead props being passed on every
            launch. (An earlier comment here claimed they were what made the
            keyboard height correct. That was a guess, and it was wrong.) */}
        <KeyboardProvider>
          <SnackbarProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.base },
            }}
          >
            <Stack.Screen name="index" />
            {/* Drawer group owns EVERY destination: (tabs) plus
                models/settings/voice-settings/about. Tab switches never
                animate, so the shared bar stays static. */}
            <Stack.Screen name="(drawer)" options={{ animation: "none" }} />
            <Stack.Screen name="onboarding" />
          </Stack>
          </SnackbarProvider>
        </KeyboardProvider>
        </GestureHandlerRootView>
      </ScopedVariables>
    </Host>
  );
}