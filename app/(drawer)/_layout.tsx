/** Drawer group: the (tabs) screens with a navigator-owned drawer.
 *
 * Per the Expo Router drawer guide, <Drawer> from expo-router/drawer
 * owns the panel, gestures, scrim, and back handling; drawerContent
 * reuses the existing drawer UI verbatim so the look is unchanged.
 * Models/settings/about stay Stack screens pushed over the drawer,
 * exactly as before.
 */

import { Drawer } from "expo-router/drawer";

import { colors, scrim } from "../../themes/tokens.ts";
import { AppDrawerContent } from "../../components/AppDrawer.tsx";

export default function DrawerLayout() {
  return (
    <Drawer
      screenOptions={{
        headerShown: false,
        drawerStyle: { width: 280, backgroundColor: colors.surface1 },
        overlayColor: scrim,
      }}
      drawerContent={(props) => (
        <AppDrawerContent onClose={() => props.navigation.closeDrawer()} />
      )}
    >
      <Drawer.Screen name="(tabs)" />
    </Drawer>
  );
}
