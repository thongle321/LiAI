/** Inline actions under a completed assistant bubble: copy + regenerate. */

import { Pressable, Text, View } from "react-native";
import { Check, Copy, RotateCcw } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import { useCopy } from "../../hooks/useCopy.ts";

export function MessageActions({
  text,
  onRegenerate,
}: {
  text: string;
  onRegenerate: () => void;
}) {
  const { copied, copy } = useCopy();

  return (
    <View className="mt-1 flex-row items-center gap-3">
      <Pressable
        onPress={() => copy(text)}
        className="flex-row items-center gap-1 py-1"
      >
        {copied ? (
          <Check size={13} color={colors.success} />
        ) : (
          <Copy size={13} color={colors.secondaryText} />
        )}
        <Text className="font-sans text-caption text-secondary-text">
          {copied ? "Copied" : "Copy"}
        </Text>
      </Pressable>
      <Pressable onPress={onRegenerate} className="flex-row items-center gap-1 py-1">
        <RotateCcw size={13} color={colors.secondaryText} />
        <Text className="font-sans text-caption text-secondary-text">Regenerate</Text>
      </Pressable>
    </View>
  );
}
