/** Back header shared by stub screens. Deep links fall back to /(tabs)/chat. */

import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";

export function ScreenHeader({ title, right }: { title: string; right?: ReactNode }) {
  function back(): void {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/chat");
  }

  return (
    <View className="flex-row items-center border-b border-border bg-base px-4 py-3">
      <Pressable onPress={back} className="px-1 py-1">
        <ArrowLeft size={20} color={colors.primary} />
      </Pressable>
      <Text className="ml-2 flex-1 font-sans-semibold text-h3 text-primary-text">
        {title}
      </Text>
      {right}
    </View>
  );
}
