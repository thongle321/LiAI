import { Pressable, Text, View } from "react-native";

export function Unavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-lg text-gray-900 text-center">
        Backend unreachable
      </Text>
      <Text className="text-sm text-gray-500 text-center mt-1">
        Start the backend, then retry.
      </Text>
      <Pressable
        onPress={onRetry}
        className="mt-4 rounded-full bg-blue-500 px-6 py-2"
      >
        <Text className="text-white font-semibold">Retry</Text>
      </Pressable>
    </View>
  );
}

export function Connecting() {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <Text className="text-sm text-gray-500">Connecting…</Text>
    </View>
  );
}
