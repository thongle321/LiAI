/** Models screen FAB actions.
 *
 * Lives here (not app/) per ARCH: screens compose, components render.
 * (Filter menu moved into the header bar: see ModelsHeaderMenu.)
 */

import { Pressable, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";

export function FabAction({
  Icon,
  label,
  onPress,
}: {
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-2 mb-3">
      <View className="px-3 py-1.5 bg-surface-1 border border-border rounded-lg">
        <Text className="font-sans text-body-sm text-primary-text">{label}</Text>
      </View>
      <View className="w-10 h-10 rounded-full bg-surface-2 border border-border items-center justify-center">
        <Icon size={18} color={colors.primary} />
      </View>
    </Pressable>
  );
}
