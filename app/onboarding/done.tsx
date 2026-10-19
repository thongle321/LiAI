/** Onboarding 3/3 — done: companion-first close, then chat (or models). */

import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@/themes/tokens.ts";
import { useOnboardingStore } from "@/store/onboarding.ts";

export default function DoneStep() {
  // The gate is a live store, and the navigator is the only thing that can
  // put the drawer back — so the button records WHERE to go and the root
  // layout (hooks/useOnboardingGate.ts) does the navigating, once the
  // navigator has re-admitted the drawer. A replace fired from here would
  // be aimed at a route the navigator does not have yet, and dropped.
  const complete = useOnboardingStore((s) => s.complete);

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
          onPress={() => void complete("/chat")}
          className="btn btn--primary active:opacity-80 mt-8"
          accessibilityRole="button"
          accessibilityLabel="Start chatting"
        >
          <Text className="text-center font-sans-semibold text-on-primary">
            Start chatting
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void complete("/models")}
          className="btn btn--ghost active:opacity-80 mt-3"
          accessibilityRole="button"
          accessibilityLabel="Browse all models"
        >
          <Text className="text-center text-body">
            Browse all models
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
