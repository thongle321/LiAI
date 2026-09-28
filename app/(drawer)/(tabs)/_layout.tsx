/** Bottom tabs (JavaScript tabs per the Expo Router tabs guide).
 *
 * Chat + voice + vision share one router-owned bar — the existing
 * BottomNav design, unchanged. The bar hides ITSELF while the vision
 * route is focused (the camera wants the full screen), so vision reads
 * as a tab everywhere except its own screen.
 */

import { View } from "react-native";
import { router, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardState } from "react-native-keyboard-controller";

import { BottomNav, type ChatTab } from "../../../components/BottomNav.tsx";

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
  // The bar is chrome, not input: while the keyboard is up it would sit
  // directly on top of it and steal height from the composer. Hidden here
  // rather than via screenOptions.tabBarHideOnKeyboard because this app
  // supplies a custom tabBar, and React Navigation only applies that
  // option inside its own BottomTabBar.
  const keyboardVisible = useKeyboardState((s) => s.isVisible);
  // Hidden on the keyboard (it would sit on top of it) and on vision (the
  // camera wants the full screen; its own X button is the way out). Hidden
  // here rather than via screenOptions.tabBarHideOnKeyboard because this
  // app supplies a custom tabBar, and React Navigation only applies that
  // option inside its own BottomTabBar.
  const focusedRoute = state.routeNames[state.index] ?? "chat";
  if (keyboardVisible || focusedRoute === "vision") return null;
  const active: ChatTab = focusedRoute === "voice" ? "voice" : "chat";

  return (
    <View className="bg-surface-1" style={{ paddingBottom: insets.bottom }}>
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
