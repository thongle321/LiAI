import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

export default function GlobalErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-base px-8">
      <Text className="font-sans-semibold text-body-lg text-primary-text">
        Something went wrong
      </Text>
      <Text className="font-sans text-body-md text-secondary-text">
        {error.message}
      </Text>
      <View className="flex-row gap-2">
        <Pressable
          onPress={reset}
          className="btn btn--primary"
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text className="font-sans-semibold text-body-md text-on-primary">
            Try again
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.replace("/chat")}
          className="btn btn--secondary"
          accessibilityRole="button"
          accessibilityLabel="Back to chat"
        >
          <Text className="font-sans text-body-md text-primary">
            Back to chat
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
