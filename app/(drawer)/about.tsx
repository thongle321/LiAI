/** About placeholder. Real about content lands here later. */

import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, useColors } from "@/themes/tokens.ts";
import { APP_NAME } from "@/constants/app.ts";
import { ScreenHeader } from "@/components/screen-header.tsx";

export default function AboutScreen() {
  const colors = useColors();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
      <ScreenHeader title="About" />
      <View className="flex-1 items-center justify-center px-8">
        {/* Display size, one per screen, in Ink. The tagline is the
            product's own line (PRODUCT.md), not invented copy. */}
        <Text className="text-center font-sans-semibold text-h1 text-primary-text">
          {APP_NAME}
        </Text>
        <Text className="mt-3 text-center font-sans text-body-md text-secondary-text">
          A calm mind.{"\n"}A smarter everyday.
        </Text>
        <Text className="mt-6 text-center text-quiet">
          Your AI runs on this device. Nothing leaves it unless you ask.
        </Text>
      </View>
    </SafeAreaView>
  );
}
