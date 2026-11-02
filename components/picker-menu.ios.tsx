/** iOS popup for PickerRow: the native SwiftUI Menu.
 *
 * SwiftUI Menu is iOS-only (@expo/ui ships no cross-platform Menu), so it
 * lives here and never loads on Android. The Menu presents and dismisses
 * itself — no open state, no Pressable — and VoiceOver announces the
 * trigger label with its menu actions natively.
 *
 * Two shapes (variant):
 * - "text" (default): the compact right-side trigger PickerRow uses. The
 *   Host is content-sized (matchContents) so it never stretches the row.
 * - "outlined": PocketPal's Selector trigger — a full-width boxed control,
 *   the same width whether a value is selected or the placeholder shows —
 *   used where the picker stands alone in a column (sheets). The label is
 *   an HStack with a trailing Spacer plus the chevron, so the Menu fills
 *   the Host; chrome (border, ground, radius, padding) stays on the RN
 *   wrapper, and `matchContents={{ vertical: true }}` takes only the
 *   height from SwiftUI so the width comes from this row.
 */

import { View } from "react-native";
import { Host } from "@expo/ui";
import { Button, HStack, Image, Menu, Spacer, Text } from "@expo/ui/swift-ui";
import { font } from "@expo/ui/swift-ui/modifiers";
import { ChevronDown } from "lucide-react-native";

import { useColors, useColorScheme, typeScale } from "@/themes/tokens.ts";
import type { PickerMenuProps } from "./picker-menu";

export function PickerMenu<T extends string>({
  label,
  options,
  value,
  onChange,
  show,
  variant = "text",
}: PickerMenuProps<T>) {
  const colors = useColors();
  const scheme = useColorScheme();
  const outlined = variant === "outlined";

  const menu = (
    <Menu
      label={
        outlined ? (
          <HStack>
            <Text modifiers={[font({ size: typeScale.bodyMd.size })]}>
              {show(value)}
            </Text>
            <Spacer />
            <Image color={colors.secondaryText} systemName="chevron.down" />
          </HStack>
        ) : (
          show(value)
        )
      }
    >
      {options.map((option) => (
        <Button
          key={option}
          label={show(option)}
          onPress={() => onChange(option)}
        />
      ))}
    </Menu>
  );

  if (!outlined) {
    return (
      <View
        className="min-h-12 flex-row items-center justify-end gap-1"
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${show(value)}`}
        accessibilityHint="Opens a list of choices"
      >
        <Host matchContents ignoreSafeArea="keyboard" colorScheme={scheme} seedColor={colors.primary}>
          {menu}
        </Host>
        <ChevronDown size={16} color={colors.secondaryText} />
      </View>
    );
  }

  return (
    <View
      className="min-h-12 w-full flex-row items-center justify-between rounded-lg border border-border bg-surface-1 px-3"
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${show(value)}`}
      accessibilityHint="Opens a list of choices"
    >
      <Host
        matchContents={{ vertical: true }}
        style={{ flex: 1 }}
        ignoreSafeArea="keyboard"
        colorScheme={scheme}
        seedColor={colors.primary}
      >
        {menu}
      </Host>
    </View>
  );
}
