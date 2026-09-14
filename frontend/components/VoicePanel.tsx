import { Text, View } from "react-native";

/** Design's VOICE CHAT side card, rendered as tab content. Visual only. */
export function VoicePanel() {
  return (
    <View className="m-4 items-center rounded-card border border-border bg-surface-1 p-6">
      <View className="flex-row items-center">
        <Text className="mr-2 text-body-lg text-primary">🎙</Text>
        <View>
          <Text className="font-sans-semibold text-body-md text-primary-text">
            VOICE CHAT
          </Text>
          <Text className="font-sans text-body-sm text-secondary-text">
            Tap to speak
          </Text>
        </View>
      </View>
      <View className="mt-5 h-24 w-24 items-center justify-center rounded-full border border-primary">
        <Text className="text-h2 text-primary">▂▄▆▄▂</Text>
      </View>
    </View>
  );
}
