/** About placeholder. Real about content lands here later. */

import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";
import { APP_NAME } from "../constants/app.ts";

export default function AboutScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0B0C0C" }}>
      <View className="flex-row items-center border-b border-border bg-base px-4 py-3">
        <Pressable onPress={() => router.back()} className="px-1 py-1">
          <ArrowLeft size={20} color={colors.primary} />
        </Pressable>
        <Text className="ml-2 font-sans-semibold text-h3 text-primary-text">
          About
        </Text>
      </View>
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center font-sans-semibold text-h2 text-primary">
          {APP_NAME}
        </Text>
        <Text className="mt-2 text-center font-sans text-body-md text-secondary-text">
          Your AI companion. More about this app is coming soon.
        </Text>
      </View>
    </SafeAreaView>
  );
}
