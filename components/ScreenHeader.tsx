/** Header shared by pushed routes (DESIGN.md Navigation).
 *
 * 56px on Clean White with a 1px Hairline bottom. Leading and trailing
 * slots are fixed and equal so the wordmark stays optically centred no
 * matter how many trailing controls appear. Chrome is static: no motion.
 */

import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";

export function ScreenHeader({ title, right }: { title: string; right?: ReactNode }) {
  function back(): void {
    if (router.canGoBack()) router.back();
    else router.replace("/chat");
  }

  return (
    <View
      className="h-14 flex-row items-center border-b border-border bg-surface-1 px-5"
    >
      <View className="w-12 flex-row items-center">
        <Pressable
          onPress={back}
          className="h-11 w-11 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={4}
        >
          <ArrowLeft size={20} color={colors.primaryText} />
        </Pressable>
      </View>
      <Text
        numberOfLines={1}
        className="flex-1 text-center font-sans-semibold text-h2 text-primary-text"
      >
        {title}
      </Text>
      <View className="w-12 flex-row items-center justify-end">{right}</View>
    </View>
  );
}
