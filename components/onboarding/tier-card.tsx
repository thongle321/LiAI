/** One device-tier row in the onboarding model step. */

import { Pressable, Text, View } from "react-native";
import { CheckCircle2, Circle } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import type { DeviceTier } from "../../services/models/device-tiers.ts";

export function formatRamFloor(minRamMb: number): string {
  if (minRamMb <= 0) return "Any phone";
  const gb = minRamMb / 1024;
  return gb >= 1 ? `${gb}GB RAM or more` : `${minRamMb}MB RAM or more`;
}

export function TierCard({
  tier,
  selected,
  recommended,
  onSelect,
}: {
  tier: DeviceTier;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable
      onPress={onSelect}
      className={`mb-3 rounded-lg border p-5 ${
        selected ? "border-primary bg-surface-3" : "border-border bg-surface-1"
      }`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={tier.label}
    >
      <View className="flex-row items-center gap-2">
        {selected ? (
          <CheckCircle2 size={18} color={colors.primary} />
        ) : (
          <Circle size={18} color={colors.secondaryText} />
        )}
        <Text className="flex-1 font-sans-semibold text-body-md text-primary-text">
          {tier.label}
        </Text>
        {recommended && (
          <View className="rounded bg-surface-1 px-2 py-0.5">
            <Text className="font-sans text-caption text-primary-text">For this phone</Text>
          </View>
        )}
      </View>
      <Text className="mt-1 text-quiet">
        {tier.blurb}
      </Text>
      <Text className="mt-1 text-quiet">
        {formatRamFloor(tier.minRamMb)} · {tier.presetIds.length} model
        {tier.presetIds.length === 1 ? "" : "s"}
      </Text>
    </Pressable>
  );
}
