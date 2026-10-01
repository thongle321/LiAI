/** Date divider row between conversation days (PocketPal row type,
 * LiAI skin — hairline dividers, Caption Slate label). */

import { Text, View } from "react-native";

export function DateHeader({ label }: { label: string }) {
  return (
    <View className="my-2 flex-row items-center gap-3">
      <View className="h-px flex-1 bg-border" />
      <Text className="font-sans text-caption text-secondary-text">{label}</Text>
      <View className="h-px flex-1 bg-border" />
    </View>
  );
}
