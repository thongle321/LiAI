/** Floating action button + its three add-model actions. */

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LucideIcon } from "lucide-react-native";
import { Cloud, FolderPlus, Plus, Search, X } from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";

function FabAction({
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

export function FABGroup({
  onAddHFModel,
  onAddLocalModel,
  onAddRemoteModel,
}: {
  onAddHFModel: () => void;
  onAddLocalModel: () => void;
  onAddRemoteModel: () => void;
}) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  function run(action: () => void): void {
    setOpen(false);
    action();
  }

  return (
    <View
      className="items-end"
      // SAFETY: runtime-anchored position (safe-area bottom + exact right
      // gutter) — className offsets did not hold right on-device.
      style={{
        position: "absolute",
        right: 16,
        bottom: insets.bottom + 16,
      }}
    >
      {open && (
        <>
          <FabAction Icon={Search} label="Add from Hugging Face" onPress={() => run(onAddHFModel)} />
          <FabAction Icon={FolderPlus} label="Add local model" onPress={() => run(onAddLocalModel)} />
          <FabAction Icon={Cloud} label="Add from API" onPress={() => run(onAddRemoteModel)} />
        </>
      )}
      <Pressable
        onPress={() => setOpen(!open)}
        className="w-14 h-14 rounded-full bg-primary items-center justify-center"
        style={{ elevation: 4 }}
      >
        {open ? <X size={24} color={colors.base} /> : <Plus size={24} color={colors.base} />}
      </Pressable>
    </View>
  );
}
