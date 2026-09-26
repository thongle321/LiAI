/** About placeholder. Real about content lands here later. */

import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "../themes/tokens.ts";
import { APP_NAME } from "../constants/app.ts";
import { ScreenHeader } from "../components/ScreenHeader.tsx";

export default function AboutScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
      <ScreenHeader title="About" />
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
