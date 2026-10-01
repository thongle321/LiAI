/** Collapsible model group (Ready to use / Available to download).
 *
 * Pure React Native + Uniwind — deliberately NOT @expo/ui's native
 * `Collapsible`. A disclosure group is pure layout with no native
 * affordance worth the interop, and hosting React Native card children
 * inside a native SwiftUI/Compose body is what caused the right-edge
 * overflow: the native body measured its children at intrinsic
 * (max-content) width, so `flex-1` rows never shrank and the size/file
 * chips were pushed off-screen. A native body also forces the count into
 * the header label string ("Ready to use (0)") because the native header
 * has no slot for a styled badge. A Uniwind header gets both right.
 *
 * @expo/ui stays in the project for the controls that genuinely benefit
 * (Switch, Picker, Slider, BottomSheet) — just not for a disclosure.
 */

import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";

export function ModelAccordion({
  title,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  open: boolean;
  /** Receives the next state, matching the sibling expand/collapse-all. */
  onToggle: (next: boolean) => void;
  children: ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <View className="mb-6">
      <Pressable
        onPress={() => onToggle(!open)}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        className={`min-h-12 flex-row items-center justify-between mb-3 rounded-lg px-3 ${
          pressed ? "bg-surface-3" : ""
        }`}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
      >
        <View className="flex-row items-center gap-2">
          <Text className="font-sans-semibold text-h4 text-primary-text">{title}</Text>
          <View className="rounded bg-surface-2 px-2 py-0.5">
            <Text className="font-sans text-caption text-secondary-text">{count}</Text>
          </View>
        </View>
        {open ? (
          <ChevronUp size={20} color={colors.secondaryText} />
        ) : (
          <ChevronDown size={20} color={colors.secondaryText} />
        )}
      </Pressable>
      {open && children}
    </View>
  );
}
