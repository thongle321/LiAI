/** Floating action button + its three add-model actions. */

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
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
      <View
      className="px-3 py-2 bg-surface-1 border border-border rounded">
        <Text className="font-sans text-body-sm text-primary-text">{label}</Text>
      </View>
      <View className="h-10 w-10 rounded-full bg-surface-3 items-center justify-center">
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

  function run(action: () => void): void {
    setOpen(false);
    action();
  }

  return (
    <View
      className="items-end"
      // SAFETY: runtime-anchored position. The models route is pushed with no
      // tab bar, so its SafeAreaView already owns the bottom inset — adding
      // insets.bottom here would apply that edge twice (DESIGN.md: insets
      // are applied exactly once, by the component that owns the edge).
      style={{
        position: "absolute",
        right: 20,
        bottom: 20,
      }}
    >
      {open && (
        <>
          <FabAction Icon={Search} label="Add from Hugging Face" onPress={() => run(onAddHFModel)} />
          <FabAction Icon={FolderPlus} label="Add local model" onPress={() => run(onAddLocalModel)} />
          <FabAction Icon={Cloud} label="Add from API" onPress={() => run(onAddRemoteModel)} />
        </>
      )}
      {/* Icon button: fully circular is permitted because this is a thing
          you press. 56px well, 40px visual circle per DESIGN.md; no shadow
          — the hairline ring is the only separation. */}
      <Pressable
        onPress={() => setOpen(!open)}
        className="h-14 w-14 items-center justify-center rounded-full"
        accessibilityRole="button"
        accessibilityLabel={open ? "Close add model menu" : "Add a model"}
      >
        <View
          className={`h-10 w-10 items-center justify-center rounded-full border ${
            open ? "border-primary bg-surface-3" : "border-primary bg-primary"
          }`}
        >
          {open ? (
            <X size={20} color={colors.primary} />
          ) : (
            <Plus size={20} color={colors.onPrimary} />
          )}
        </View>
      </Pressable>
    </View>
  );
}
