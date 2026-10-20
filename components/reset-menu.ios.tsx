/** iOS reset menu: the native SwiftUI Menu (PickerMenu.ios pattern). */

import { Text, View } from "react-native";
import { Host } from "@expo/ui";
import { Button, Menu } from "@expo/ui/swift-ui";
import { ChevronDown } from "lucide-react-native";

import { useColors, useColorScheme } from "../themes/tokens.ts";
import type { ResetMenuProps } from "./reset-menu";

export function ResetMenu({ items }: ResetMenuProps) {
  const colors = useColors();
  const scheme = useColorScheme();
  return (
    <Host matchContents ignoreSafeArea="keyboard" colorScheme={scheme} seedColor={colors.primary}>
      <Menu
        label={
          // PocketPal's trigger: paper text button + trailing chevron.
          <View className="flex-row items-center gap-1 py-2">
            <Text className="text-body">Reset</Text>
            <ChevronDown size={16} color={colors.primary} />
          </View>
        }
      >
        {items.map((item) => (
          <Button key={item.label} label={item.label} onPress={item.onPress} />
        ))}
      </Menu>
    </Host>
  );
}
