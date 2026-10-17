/** Drawer group: every destination is a screen of THIS navigator.
 *
 * Per the Expo Router drawer guide, <Drawer> from expo-router/drawer
 * owns the panel, gestures, scrim, and back handling; drawerContent
 * reuses the existing drawer UI verbatim so the look is unchanged.
 *
 * Models/settings/about/voice live INSIDE the drawer, not as Stack
 * screens above it, and that placement is load-bearing for motion: the
 * drawer's router closes the panel as part of the SAME state transition
 * as a sibling screen swap
 * (react-navigation DrawerRouter.getStateForAction: on NAVIGATE, if the
 * target index changed it returns closeDrawer(result)). So one press =
 * one navigation = one animation. They used to be Stack screens pushed
 * from the panel, which meant onClose() AND router.push() started two
 * animations in the same frame — the jank this shape exists to remove.
 * PocketPar's Drawer.Navigator is flat for the same reason
 * (pocketpal-ai/App.tsx:120-206, SidebarContent navigates only).
 */

import { View } from "react-native";
import { Drawer } from "expo-router/drawer";

import { colors, scrim } from "@/themes/tokens.ts";
import { AppDrawerContent } from "@/components/app-drawer.tsx";

// Same story as the root boundary: this was `app/(drawer)/+error.tsx`.
export { DrawerErrorBoundary as ErrorBoundary } from "@/components/route-error-boundaries.tsx";

export default function DrawerLayout() {
  return (
    <View className="flex-1">
      <View className="flex-1">
        <Drawer
          screenOptions={{
            headerShown: false,
            drawerStyle: { width: 280, backgroundColor: colors.surface1 },
            overlayColor: scrim,
          }}
          drawerContent={() => <AppDrawerContent />}
        >
          <Drawer.Screen name="(tabs)" />
          <Drawer.Screen name="models" />
          <Drawer.Screen name="settings" />
          <Drawer.Screen name="voice-settings" />
          <Drawer.Screen name="about" />
        </Drawer>
      </View>
    </View>
  );
}
