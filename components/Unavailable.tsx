import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Loader } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";

/** Empty state: a Title naming the situation, one Body Small Slate line
 * naming the next move, and one primary button. Always a way forward. */
export function Unavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center bg-base px-8">
      <Text className="text-center font-sans-semibold text-h3 text-primary-text">
        No model active
      </Text>
      <Text className="mt-2 text-center font-sans text-body-sm text-secondary-text">
        Download a model to start chatting with LiAI.
      </Text>
      <Pressable
        onPress={() => router.push("/models")}
        className="btn btn--primary mt-6"
        accessibilityRole="button"
        accessibilityLabel="Go to models"
      >
        <Text className="font-sans-semibold text-body-md text-on-primary">Go to Models</Text>
      </Pressable>
      <Pressable
        onPress={onRetry}
        className="btn btn--ghost mt-2"
        accessibilityRole="button"
        accessibilityLabel="Retry"
      >
        <Text className="font-sans text-body-md text-primary">Retry</Text>
      </Pressable>
    </View>
  );
}

/** Loading: a spinner with the word "Loading" in Body Small Slate. */
export function Connecting() {
  return (
    <View className="flex-1 items-center justify-center bg-base px-8">
      <View className="mb-3 h-10 w-10 items-center justify-center rounded-full bg-surface-2">
        <Loader size={20} color={colors.primary} />
      </View>
      <Text className="font-sans text-body-sm text-secondary-text">Loading</Text>
    </View>
  );
}
