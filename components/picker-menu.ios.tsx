/** iOS popup for PickerRow: the native SwiftUI Menu.
 *
 * SwiftUI Menu is iOS-only (@expo/ui ships no cross-platform Menu), so it
 * lives here and never loads on Android. The Menu presents and dismisses
 * itself — no open state, no Pressable — and VoiceOver announces the
 * trigger label with its menu actions natively.
 */

import { View } from "react-native";
import { Host } from "@expo/ui";
import { Button, Menu } from "@expo/ui/swift-ui";
import { ChevronDown } from "lucide-react-native";

import { useUniwind } from "uniwind";

import { useColors } from "../themes/tokens.ts";
import type { PickerMenuProps } from "./picker-menu";

export function PickerMenu<T extends string>({
  label,
  options,
  value,
  onChange,
  show,
}: PickerMenuProps<T>) {
  const colors = useColors();
  const scheme = useUniwind().theme === "dark" ? "dark" : "light";
  return (
    <View
      className="min-h-12 flex-row items-center justify-end gap-1"
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${show(value)}`}
      accessibilityHint="Opens a list of choices"
    >
      <Host matchContents ignoreSafeArea="keyboard" colorScheme={scheme} seedColor={colors.primary}>
        <Menu label={show(value)}>
          {options.map((option) => (
            <Button
              key={option}
              label={show(option)}
              onPress={() => onChange(option)}
            />
          ))}
        </Menu>
      </Host>
      <ChevronDown size={16} color={colors.secondaryText} />
    </View>
  );
}
