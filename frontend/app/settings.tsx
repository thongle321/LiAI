/** Settings placeholder. Real settings land here later. */

import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";

export default function SettingsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B0C0C" }}>
      <View className="flex-row items-center border-b border-border bg-base px-4 py-3">
        <Pressable onPress={() => router.back()} className="px-1 py-1">
          <ArrowLeft size={20} color={colors.primary} />
        </Pressable>
        <Text className="ml-2 font-sans-semibold text-h3 text-primary-text">
          Settings
        </Text>
      </View>
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center font-sans text-body-md text-secondary-text">
          Settings are coming soon.
        </Text>
      </View>
    </SafeAreaView>
  );
}
