/** Header shared by the drawer's screens (DESIGN.md Navigation).
 *
 * 56px on Clean White with a 1px Hairline bottom. Leading and trailing
 * slots are fixed and equal so the wordmark stays optically centred no
 * matter how many trailing controls appear. Chrome is static: no motion.
 *
 * The leading slot opens the DRAWER, not a stack back: models/settings/
 * about/voice are sibling screens of the drawer navigator now, so there
 * is no stack to pop — back here meant a Stack push that popped to
 * whichever tab you happened to come from.
 */

import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useNavigation } from "expo-router";
import { Menu } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";

export function ScreenHeader({ title, right }: { title: string; right?: ReactNode }) {
  const navigation = useNavigation<{ openDrawer: () => void }>();

  return (
    <View
      className="h-14 flex-row items-center border-b border-border bg-surface-1 px-5"
    >
      <View className="w-12 flex-row items-center">
        <Pressable
          onPress={() => navigation.openDrawer()}
          className="h-12 w-12 items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="Open menu"
          hitSlop={4}
        >
          <Menu size={20} color={colors.primaryText} />
        </Pressable>
      </View>
      <Text
        numberOfLines={1}
        // Capped: DESIGN pins the header at 56px. Worst case
        // 24 (h2) × 1.1 (Fluid Type clamp) × 1.5 = 39.6px < 56 —
        // the bar never shifts; prose elsewhere stays uncapped.
        maxFontSizeMultiplier={1.5}
        className="flex-1 text-center font-sans-semibold text-h2 text-primary-text"
      >
        {title}
      </Text>
      <View className="w-12 flex-row items-center justify-end">{right}</View>
    </View>
  );
}
