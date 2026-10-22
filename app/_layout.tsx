import "../global.css";
import { Stack } from "expo-router";
import { ThemeProvider, DefaultTheme, DarkTheme } from "expo-router/react-navigation";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  useFonts,
} from "@expo-google-fonts/inter";
import { Host } from "@expo/ui";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider, useKeyboardState } from "react-native-keyboard-controller";
import { ScopedVariables, Uniwind } from "uniwind";

import { useEffect, useRef } from "react";
import { useColors, useColorScheme } from "@/themes/tokens.ts";
import { readStoredTheme } from "@/services/storage/theme.ts";
import { SnackbarProvider } from "@/components/snackbar.tsx";
import { useKeyboardStore } from "@/store/keyboard.ts";
import { useEngineOffload } from "@/hooks/useEngineOffload.ts";
import { useOnboardingGate } from "@/hooks/useOnboardingGate.ts";
import { useVoiceOffload } from "@/hooks/useVoiceOffload.ts";
import { useFluidTextVariables } from "@/hooks/useFluidTextScale.ts";

// Seed the persisted appearance (Settings > App Settings > Dark mode)
// before the first paint. Fire-and-forget: the default "system" theme
// renders until the read resolves, then switches if the stored choice
// differs. readStoredTheme owns the storage call AND its failure path
// (returns null rather than throwing), so a storage error can't surface
// as an unhandled rejection here.
void readStoredTheme().then((stored) => {
  Uniwind.setTheme(stored ?? "system");
});

// Keep the native splash visible until the Inter files resolve, so cold
// start never flashes a blank white frame before the font gate below.
// The catch is load-bearing: a rejection (already-hidden splash on a
// remount) must not surface as an unhandled promise.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// expo-router's error-boundary convention is a NAMED export from a layout.
// This used to be `app/+error.tsx`, which is TanStack Router's syntax --
// expo-router's route scanner throws on any route node starting with '+',
// so the app died before rendering anything.
export { RootErrorBoundary as ErrorBoundary } from "@/components/route-error-boundaries.tsx";

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
  // Reactive to the theme so the Host seed, the status bar and the stack's
  // content background follow the App Settings toggle.
  const colors = useColors();
  const scheme = useColorScheme();

  // Keep the native root view background in step with the theme so there is
  // no light flash behind the React tree on a dark app (expo-system-ui was
  // declared but unused). PocketPal does the equivalent via
  // useNavigationBarAppearance.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.base).catch(() => {});
  }, [colors.base]);
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
  // First-run gate, held here so the navigator itself enforces it (D1-1).
  // A deep link to /models or /chat resolves WITHOUT mounting index.tsx,
  // so a Redirect there cannot stop it — only removing the screens from the
  // navigator can. Optimistically true (most launches are returning users);
  // a false flip hides the drawer and the router falls back to index, which
  // redirects to onboarding.
  //
  // The hook owns the gate AND the navigation that follows it; why the
  // navigation waits for the navigator, and not for the button press, is
  // in hooks/useOnboardingGate.ts.
  const { onboarded } = useOnboardingGate();
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
  // Font load failure must still release the splash (otherwise the app
  // hangs on the native splash). On the success path the splash stays up
  // until the first-run gate in app/index.tsx resolves, so cold start has
  // no blank frame between splash and first screen (D4-19).
  const splashHidden = useRef(false);
  if (error && !splashHidden.current) {
    splashHidden.current = true;
    console.error("[LiAI] Inter font load failed", error);
    void SplashScreen.hideAsync().catch(() => {});
  }

  // Gate first paint on the font resolving so nothing flashes in the
  // system typeface (DESIGN.md, Single Family Rule). On a load failure,
  // fall through and render with the system font rather than hanging.
  if (!loaded && !error) return null;

  return (
    // One Host for the whole app: it seeds every @expo/ui subtree with
    // Signal Blue and the app's OWN scheme, so native switches, sheets
    // and pickers land in LiAI's world instead of the platform's default.
    // The scheme must be passed explicitly: leaving it unset makes the
    // Host follow the DEVICE scheme, so a stored "light" on a dark device
    // renders the native subtrees dark against a light JS tree.
    <Host colorScheme={scheme} seedColor={colors.primary} style={{ flex: 1 }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
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
          <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.base },
            }}
          >
            <Stack.Screen name="index" />
            {/* Drawer group owns EVERY destination: (tabs) plus
                models/settings/voice-settings/about. Tab switches never
                animate, so the shared bar stays static.

                Wrapped in Stack.Protected so a deep link cannot reach these
                screens before onboarding completes (D1-1): with guard=false
                the navigator has no drawer to resolve to, so it falls back to
                the initial route (index), which redirects to onboarding. */}
            <Stack.Protected guard={onboarded}>
              <Stack.Screen name="(drawer)" options={{ animation: "none" }} />
            </Stack.Protected>
            <Stack.Screen name="onboarding" />
          </Stack>
          </ThemeProvider>
          </SnackbarProvider>
        </KeyboardProvider>
        </GestureHandlerRootView>
      </ScopedVariables>
    </Host>
  );
}