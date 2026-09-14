import { Pressable, Text, View } from "react-native";

/** Design's VISION side card, rendered as tab content. */
export function VisionPanel({ onOpen }: { onOpen: () => void }) {
  return (
    <View className="m-4 rounded-card border border-border bg-surface-1 p-6">
      <View className="flex-row items-center">
        <Text className="mr-2 text-body-lg text-primary">👁</Text>
        <View>
          <Text className="font-sans-semibold text-body-md text-primary-text">
            VISION
          </Text>
          <Text className="font-sans text-body-sm text-secondary-text">
            Point. Ask. Learn.
          </Text>
        </View>
      </View>
      <View className="mt-4 aspect-video items-center justify-center rounded-card border border-border bg-surface-2">
        <Text className="absolute left-2 top-1 font-sans text-body-lg text-primary">┌</Text>
        <Text className="absolute right-2 top-1 font-sans text-body-lg text-primary">┐</Text>
        <Text className="absolute bottom-1 left-2 font-sans text-body-lg text-primary">└</Text>
        <Text className="absolute bottom-1 right-2 font-sans text-body-lg text-primary">┘</Text>
        <Text className="text-h1 text-secondary-text">▦</Text>
      </View>
      <Pressable
        onPress={onOpen}
        className="btn btn--primary mt-4"
      >
        <Text className="font-sans-semibold text-on-primary">Open camera</Text>
      </Pressable>
    </View>
  );
}
