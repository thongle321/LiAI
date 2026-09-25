/** Shared settings rows: toggle + stepper. One implementation, reused. */

import { Pressable, Text, View } from "react-native";
import { Check, Minus, Plus } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";

export function ToggleRow({
  label,
  on,
  onPress,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center justify-between py-2.5">
      <Text className="font-sans text-body-md text-primary-text">{label}</Text>
      <View
        className={`w-5 h-5 rounded-md border items-center justify-center ${
          on ? "bg-primary border-primary" : "border-border"
        }`}
      >
        {on && <Check size={14} color={colors.base} />}
      </View>
    </Pressable>
  );
}

export function StepperRow({
  label,
  display,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
}: {
  label: string;
  display: string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between py-2.5">
      <Text className="font-sans text-body-md text-primary-text">{label}</Text>
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={onMinus}
          disabled={minusDisabled}
          className="p-2 rounded-lg border border-border"
        >
          <Minus size={16} color={colors.primary} />
        </Pressable>
        <Text className="font-sans text-body-md text-primary-text w-12 text-center">
          {display}
        </Text>
        <Pressable
          onPress={onPlus}
          disabled={plusDisabled}
          className="p-2 rounded-lg border border-border"
        >
          <Plus size={16} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}
