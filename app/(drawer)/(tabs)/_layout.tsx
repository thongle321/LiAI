/** Bottom tabs (JavaScript tabs per the Expo Router tabs guide).
 *
 * Chat + voice share one router-owned bar — the existing BottomNav
 * design, unchanged. Vision stays a standalone Stack screen with no
 * bar; selecting it pushes the vision route over the tabs.
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
  if (keyboardVisible) return null;
  const focused = state.routeNames[state.index] ?? "chat";
  const active: ChatTab = focused === "voice" ? "voice" : "chat";

  return (
    <View className="bg-surface-1" style={{ paddingBottom: insets.bottom }}>
      <BottomNav
        active={active}
        onSelect={(t) => {
          if (t === "vision") router.push("/vision");
          else if (t !== active) router.navigate(t === "voice" ? "/voice" : "/chat");
        }}
      />
    </View>
  );
}
