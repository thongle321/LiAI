import { Pressable, Text, View } from "react-native";
import { Eye, Focus, Image } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";

/** Design's VISION side card, rendered as tab content. */
export function VisionPanel({ onOpen }: { onOpen: () => void }) {
  return (
    <View className="m-4 rounded-card border border-border bg-surface-1 p-6">
      <View className="flex-row items-center">
        <Eye size={20} color={colors.primary} />
        <View className="ml-2">
          <Text className="font-sans-semibold text-body-md text-primary-text">
            VISION
          </Text>
          <Text className="font-sans text-body-sm text-secondary-text">
            Point. Ask. Learn.
          </Text>
        </View>
      </View>
      <View className="mt-4 aspect-video items-center justify-center rounded-card border border-border bg-surface-2">
        <Image size={40} color={colors.secondaryText} />
        <View className="absolute bottom-2 right-2">
          <Focus size={22} color={colors.primary} />
        </View>
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
