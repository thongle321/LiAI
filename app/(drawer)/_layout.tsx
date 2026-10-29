import { View } from "react-native";
import { Drawer } from "expo-router/drawer";

import { useColors } from "@/themes/tokens.ts";
import { AppDrawerContent } from "@/components/drawer/app-drawer.tsx";

export { DrawerErrorBoundary as ErrorBoundary } from "@/components/route-error-boundaries.tsx";

export default function DrawerLayout() {
  const colors = useColors();
  return (
      <View className="flex-1">
        <Drawer
          screenOptions={{
            headerShown: false,
            drawerStyle: { width: 280, backgroundColor: colors.surface1 },
            overlayColor: colors.scrim,
          }}
          drawerContent={() => <AppDrawerContent />}
        >
          <Drawer.Screen name="(tabs)" />
          <Drawer.Screen name="models" />
          <Drawer.Screen name="companions" />
          <Drawer.Screen name="settings" />
          <Drawer.Screen name="voice-settings" />
          <Drawer.Screen name="about" />
        </Drawer>
      </View>
  );
}
