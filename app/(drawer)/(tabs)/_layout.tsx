/** Bottom tabs (JavaScript tabs per the Expo Router tabs guide).
 *
 * Chat + voice share one router-owned bar — the existing BottomNav
 * design, unchanged. Vision stays a standalone Stack screen with no
 * bar; selecting it pushes the vision route over the tabs.
 */

import { View } from "react-native";
import { router, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomNav, type ChatTab } from "../../../components/BottomNav.tsx";
import { colors } from "../../../themes/tokens.ts";

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
  const focused = state.routeNames[state.index] ?? "chat";
  const active: ChatTab = focused === "voice" ? "voice" : "chat";

  return (
    <View style={{ paddingBottom: insets.bottom, backgroundColor: colors.surface1 }}>
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
