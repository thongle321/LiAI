import { Pressable, Text, View } from "react-native";

export function Unavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center bg-base px-8">
      <Text className="text-center font-sans-semibold text-h3 text-primary-text">
        No model active
      </Text>
      <Text className="mt-1 text-center font-sans text-body-md text-secondary-text">
        Download and activate a model, then retry.
      </Text>
      <Pressable onPress={onRetry} className="btn btn--primary mt-4">
        <Text className="font-sans-semibold text-on-primary">Retry</Text>
      </Pressable>
    </View>
  );
}

export function Connecting() {
  return (
    <View className="flex-1 items-center justify-center bg-base px-8">
      <Text className="font-sans text-body-md text-secondary-text">
        Connecting…
      </Text>
    </View>
  );
}
