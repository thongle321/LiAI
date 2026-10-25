/** Companion card for the Companions grid (PocketPal's SquarePalCard shape).
 *
 * No gradient: the project has no expo-linear-gradient and the
 * dependency policy says ask before installing — so the card carries
 * the companion's two colors as a top accent strip instead, which needs no
 * contrast guessing from a user-chosen background.
 */

import { Pressable, Text, View } from "react-native";

import { useColors } from "@/themes/tokens.ts";
import type { Companion } from "@/types/companion.ts";

export function CompanionCard({
  companion,
  onOpen,
  onUse,
}: {
  companion: Companion;
  /** Open the editor. */
  onOpen: () => void;
  /** Activate for chat (bind + model check + navigate). */
  onUse: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onOpen}
      className="overflow-hidden rounded-xl border border-border bg-surface-1 active:bg-surface-3"
      accessibilityRole="button"
      accessibilityLabel={`Edit companion ${companion.name}`}
    >
      <View className="flex-row">
        <View
          className="h-1.5 flex-1"
          style={{ backgroundColor: companion.color?.[0] ?? colors.primary }}
        />
      </View>
      <View className="gap-1 p-3">
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.5}
          className="font-sans-semibold text-body-md text-primary-text"
        >
          {companion.name || "Untitled"}
        </Text>
        {companion.description ? (
          <Text numberOfLines={2} className="text-body-sm text-secondary-text">
            {companion.description}
          </Text>
        ) : null}
        <View className="mt-1 flex-row items-center justify-end">
          <Pressable
            onPress={onUse}
            className="btn btn--primary min-h-9 px-3 active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel={`Use ${companion.name} in chat`}
          >
            <Text className="text-action text-body-sm">Use</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}
