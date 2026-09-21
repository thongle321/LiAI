/** Settings placeholder. Real settings land here later. */

import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "../themes/tokens.ts";
import { ScreenHeader } from "../components/ScreenHeader.tsx";

export default function SettingsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
      <ScreenHeader title="Settings" />
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center font-sans text-body-md text-secondary-text">
          Settings are coming soon.
        </Text>
      </View>
    </SafeAreaView>
  );
}
