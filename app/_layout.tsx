import "../global.css";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Host } from "@expo/ui";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider, useKeyboardState } from "react-native-keyboard-controller";
import { ScopedVariables, Uniwind } from "uniwind";

import { useEffect, useRef } from "react";
import { colors } from "../themes/tokens.ts";
import { SnackbarProvider } from "../components/snackbar.tsx";
import { useKeyboardStore } from "../store/keyboard.ts";
import { useEngineOffload } from "../hooks/useEngineOffload.ts";
import { useVoiceOffload } from "../hooks/useVoiceOffload.ts";
import { useFluidTextVariables } from "../hooks/useFluidTextScale.ts";

// Light-locked (DESIGN.md): one theme, and it is the light one —
// device dark mode must not invent a second world.
Uniwind.setTheme("light");

// Keep the native splash visible until the Inter files resolve, so cold
// start never flashes a blank white frame before the font gate below.
// The catch is load-bearing: a rejection (already-hidden splash on a
// remount) must not surface as an unhandled promise.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// expo-router's error-boundary convention is a NAMED export from a layout.
// This used to be `app/+error.tsx`, which is TanStack Router's syntax --
// expo-router's route scanner throws on any route node starting with '+',
// so the app died before rendering anything.
export { RootErrorBoundary as ErrorBoundary } from "../components/route-error-boundaries.tsx";

/** Bridges react-native-keyboard-controller's events into the store the
 * whole app reads (store/keyboard.ts explains why one writer matters).
 * Renders nothing. */
function KeyboardVisibilitySync() {
  const isVisible = useKeyboardState((s) => s.isVisible);
  const setVisible = useKeyboardStore((s) => s.setVisible);
  useEffect(() => {
    setVisible(isVisible);
  }, [isVisible, setVisible]);
  return null;
}

export default function RootLayout() {
  const [loaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  // Release the loaded model when the app is backgrounded, so a multi-GB
  // GGUF is not held resident (Settings > Model Loading).
  useEngineOffload();
  // Stop TTS playback on backgrounding (ticket 05 / spec Q14).
  useVoiceOffload();
  // Fluid Type (DESIGN.md): --text-* overrides for this device's width.
  // Must be called before any early return (hook order).
  const typeVars = useFluidTextVariables();

  // Dismiss the native splash once Inter is ready: hideAsync in an
  // effect would flash one font-less frame, so it runs on the same
  // render that first returns UI. The ref fires it exactly once — repeat
  // renders must not re-hide (unawaited native call per render).
  const splashHidden = useRef(false);
  if (loaded && !splashHidden.current) {
    splashHidden.current = true;
    void SplashScreen.hideAsync().catch(() => {});
  }

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
          {/* The app's ONE keyboard-state subscriber: everything else
              reads store/keyboard.ts. One writer means the tab bar's
              unmount and the chat screen's column compensation commit in
              the same React pass — two independent subscriptions could
              land a frame apart, which shifted the column-anchored
              overlays for a frame or two (the card that still moved). */}
          <KeyboardVisibilitySync />
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