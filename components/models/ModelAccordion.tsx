/** Collapsible model group (Ready to Use / Available to Download / one per
 * model type when `grouped` is on).
 *
 * PocketParity: ModelAccordion.tsx:38-56 — the header carries the group
 * title and an optional description, and nothing else. The count chip this
 * used to draw is gone: the reference has no count, and a title over its
 * cards says the same thing.
 *
 * Pure React Native + Uniwind — deliberately NOT @expo/ui's native
 * `Collapsible`. A disclosure group is pure layout with no native
 * affordance worth the interop, and hosting React Native card children
 * inside a native SwiftUI/Compose body is what caused the right-edge
 * overflow: the native body measured its children at intrinsic
 * (max-content) width, so `flex-1` rows never shrank and the size/file
 * chips were pushed off-screen. A native body also forces everything into
 * the header label string ("Ready to use (0)") because the native header
 * has no slot for a styled description. A Uniwind header gets both right.
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
  description,
  open,
  onToggle,
  children,
}: {
  title: string;
  /** PocketPal shows this only on the Available-to-Download bucket. */
  description?: string;
  open: boolean;
  /** Receives the next state, matching the header's own toggle. */
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
        className={`min-h-12 flex-row items-center justify-between rounded-lg px-3 ${
          pressed ? "bg-surface-3" : ""
        }`}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ expanded: open }}
      >
        <Text className="flex-1 font-sans-semibold text-title text-primary-text">{title}</Text>
        {open ? (
          <ChevronUp size={20} color={colors.secondaryText} />
        ) : (
          <ChevronDown size={20} color={colors.secondaryText} />
        )}
      </Pressable>
      {description !== undefined ? (
        <Text className="mb-3 mt-1 px-3 font-sans text-caption text-secondary-text">
          {description}
        </Text>
      ) : null}
      {open && children}
    </View>
  );
}
