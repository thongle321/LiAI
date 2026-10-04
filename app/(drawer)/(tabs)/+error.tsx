import { Pressable, Text, View } from "react-native";

export default function ChatErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-base px-8">
      <Text className="font-sans-semibold text-body-lg text-primary-text">
        This conversation failed to render
      </Text>
      <Text className="font-sans text-body-md text-secondary-text">
        {error.message}
      </Text>
      <Pressable
        onPress={reset}
        className="btn btn--primary"
        accessibilityRole="button"
        accessibilityLabel="Reload conversation"
      >
        <Text className="font-sans-semibold text-body-md text-on-primary">
          Reload conversation
        </Text>
      </Pressable>
    </View>
  );
}
