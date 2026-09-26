/** Onboarding 3/3 — done: companion-first close, then chat (or models). */

import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

import { colors } from "../../themes/tokens.ts";
import { setOnboarded } from "../../lib/onboarding.ts";

export default function DoneStep() {
  async function finish(to: "/chat" | "/models"): Promise<void> {
    await setOnboarded();
    router.replace(to);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.base }}>
      <View className="flex-1 justify-center px-8">
        <Text className="text-center font-sans-semibold text-h1 text-primary-text">
          You're set
        </Text>
        <Text className="mt-2 text-center font-sans text-body-lg text-secondary-text">
          Ask anything, anytime.{"\n"}LiAI remembers what matters.
        </Text>
        <Pressable
          onPress={() => void finish("/chat")}
          className="btn btn--primary mt-8"
          accessibilityRole="button"
          accessibilityLabel="Start chatting"
        >
          <Text className="text-center font-sans-semibold text-on-primary">
            Start chatting
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void finish("/models")}
          className="btn btn--ghost mt-3"
          accessibilityRole="button"
          accessibilityLabel="Browse all models"
        >
          <Text className="text-center font-sans text-body-md text-primary">
            Browse all models
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
