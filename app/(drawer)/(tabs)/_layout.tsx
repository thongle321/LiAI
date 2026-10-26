/** Bottom tabs (JavaScript tabs per the Expo Router tabs guide).
 *
 * Chat + voice share one router-owned bar — the existing BottomNav
 * design, unchanged. Vision is NOT a destination: it is the voice tab's
 * in-screen mode behind the Eye toggle (components/voice/
 * voice-vision-mode.tsx), so the bar owns no /vision route. The bar
 * stays MOUNTED while the keyboard
 * opens (PocketPal parity: nothing on screen unmounts in response to the
 * keyboard — pocketpal-ai/src/components/ChatView/ChatView.tsx composition
 * notes); edge-to-edge means the keyboard simply covers it, pane by pane,
 * so there is no unmount gap to mask and no column growth to compensate.
 * Every keyboard response left in the app is a Reanimated translateY.
 */

import { View } from "react-native";
import { router, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomNav, type ChatTab } from "@/components/navigation/bottom-nav.tsx";
import { useKeyboardStore } from "@/store/keyboard.ts";

// Same story as the root boundary: this was `app/(drawer)/(tabs)/+error.tsx`.
export { TabsErrorBoundary as ErrorBoundary } from "@/components/route-error-boundaries.tsx";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      // Closure returning an element: the navigator invokes tabBar as a
      // plain function, so passing the bare TabBar reference would run
      // its hooks outside a component (Invalid hook call). TabBar itself
      // stays a real component with hooks.
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="chat" />
      <Tabs.Screen name="voice" />
    </Tabs>
  );
}

/** Router-owned bar: shared BottomNav + bottom system inset.
 * Screens skip the bottom inset (edges) so it is applied once, here.
 */
function TabBar({ state }: { state: { index: number; routeNames: string[] } }) {
  const insets = useSafeAreaInsets();
  const setTabBarHeight = useKeyboardStore((s) => s.setTabBarHeight);
  const focusedRoute = state.routeNames[state.index] ?? "chat";
  // Two destinations only (see bottom-nav.tsx): anything else reads as
  // chat — and the vision mode is part of the voice route, so it never
  // appears here.
  const active: ChatTab = focusedRoute === "voice" ? "voice" : "chat";

  return (
    <View
      className="bg-surface-1"
      style={{ paddingBottom: insets.bottom }}
      // Measure the bar so the keyboard compensation can never drift
      // again: the class-sum constant seeds store/keyboard.ts, this
      // measurement replaces it. The wrapper carries the bottom inset
      // padding, so that much comes back off — the store holds the bar's
      // own height only.
      onLayout={(e) =>
        setTabBarHeight(e.nativeEvent.layout.height - insets.bottom)
      }
    >
      <BottomNav
        active={active}
        onSelect={(t) => {
          if (t !== active) router.navigate(t === "voice" ? "/voice" : "/chat");
        }}
      />
    </View>
  );
}
