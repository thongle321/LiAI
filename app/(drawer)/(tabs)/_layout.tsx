/** Bottom tabs (JavaScript tabs per the Expo Router tabs guide).
 *
 * Chat + voice + vision share one router-owned bar — the existing
 * BottomNav design, unchanged. The bar hides only for the keyboard;
 * vision shows it like every other tab.
 */

import { View } from "react-native";
import { router, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomNav, type ChatTab } from "@/components/bottom-nav.tsx";
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
      <Tabs.Screen name="vision" />
    </Tabs>
  );
}

/** Router-owned bar: shared BottomNav + bottom system inset.
 * Screens skip the bottom inset (edges) so it is applied once, here.
 */
function TabBar({ state }: { state: { index: number; routeNames: string[] } }) {
  const insets = useSafeAreaInsets();
  // Same store as the chat screen (store/keyboard.ts): one writer at the
  // root, so the bar's unmount and the screen's column compensation
  // commit together instead of a frame apart.
  const keyboardVisible = useKeyboardStore((s) => s.isVisible);
  const setTabBarHeight = useKeyboardStore((s) => s.setTabBarHeight);
  // Hidden on the keyboard only: it would sit directly on top of it and
  // steal height from whatever input opened it. Hidden here rather than
  // via screenOptions.tabBarHideOnKeyboard because this app supplies a
  // custom tabBar, and React Navigation only applies that option inside
  // its own BottomTabBar.
  const focusedRoute = state.routeNames[state.index] ?? "chat";
  if (keyboardVisible) return null;
  const active: ChatTab =
    focusedRoute === "voice"
      ? "voice"
      : focusedRoute === "vision"
        ? "vision"
        : "chat";

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
          if (t === "vision") router.navigate("/vision");
          else if (t !== active) router.navigate(t === "voice" ? "/voice" : "/chat");
        }}
      />
    </View>
  );
}
