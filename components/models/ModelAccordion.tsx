/** Collapsible model group (Ready to use / Available to download). */

import type { ReactNode } from "react";
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
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <View className="mb-6">
      <Pressable
        onPress={onToggle}
        className="flex-row items-center justify-between mb-3"
      >
        <View className="flex-row items-center gap-2">
          <Text className="font-sans-semibold text-h4 text-primary-text">{title}</Text>
          <View className="px-1.5 py-0.5 bg-surface-2 border border-border rounded">
            <Text className="font-sans text-xs text-secondary-text">{count}</Text>
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
