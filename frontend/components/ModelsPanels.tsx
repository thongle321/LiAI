/** Models screen panels: section filter menu + FAB actions.
 *
 * Lives here (not app/) per ARCH: screens compose, components render.
 */

import { Pressable, Text, View } from "react-native";
import { Check, type LucideIcon } from "lucide-react-native";

import { colors } from "../themes/tokens.ts";

export type ModelsSectionId = "ready" | "available" | "hf" | "remote";

const SECTION_LABEL: Record<ModelsSectionId, string> = {
  ready: "Ready to use",
  available: "Available to download",
  hf: "Hugging Face Search",
  remote: "Remote API Providers",
};

export const SECTION_ORDER: ModelsSectionId[] = [
  "ready",
  "available",
  "hf",
  "remote",
];

export function FilterMenu({
  visible,
  onToggle,
}: {
  visible: Record<ModelsSectionId, boolean>;
  onToggle: (id: ModelsSectionId) => void;
}) {
  return (
    <View className="mb-4 bg-surface-1 border border-border rounded-xl overflow-hidden">
      <Text className="px-4 pt-3 font-sans-semibold text-body-sm text-secondary-text">
        Show sections
      </Text>
      {SECTION_ORDER.map((id) => {
        const on = visible[id];
        return (
          <Pressable
            key={id}
            onPress={() => onToggle(id)}
            className="flex-row items-center justify-between px-4 py-2.5"
          >
            <Text className="font-sans text-body-md text-primary-text">
              {SECTION_LABEL[id]}
            </Text>
            <View
              className={`w-5 h-5 rounded-md border items-center justify-center ${
                on ? "bg-primary border-primary" : "border-border"
              }`}
            >
              {on && <Check size={14} color={colors.base} />}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function FabAction({
  Icon,
  label,
  onPress,
}: {
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-2 mb-3">
      <View className="px-3 py-1.5 bg-surface-1 border border-border rounded-lg">
        <Text className="font-sans text-body-sm text-primary-text">{label}</Text>
      </View>
      <View className="w-10 h-10 rounded-full bg-surface-2 border border-border items-center justify-center">
        <Icon size={18} color={colors.primary} />
      </View>
    </Pressable>
  );
}
