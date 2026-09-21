/** Bottom tabs (JavaScript tabs per the Expo Router tabs guide).
 *
 * Chat + voice share one router-owned bar — the existing BottomNav
 * design, unchanged. Vision stays a standalone Stack screen with no
 * bar; selecting it pushes the vision route over the tabs.
 */

import { View } from "react-native";
import { router, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomNav, type ChatTab } from "../../components/BottomNav.tsx";
import { colors } from "../../themes/tokens.ts";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={TabBar}>
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
    <View style={{ paddingBottom: insets.bottom, backgroundColor: colors.base }}>
      <BottomNav
        active={active}
        onSelect={(t) => {
          if (t === "vision") router.push("/vision");
          else if (t !== active) router.navigate(`/(tabs)/${t}`);
        }}
      />
    </View>
  );
}
