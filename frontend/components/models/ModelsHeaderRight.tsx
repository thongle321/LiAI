/** Models header filter menu: section toggles + expand/collapse all. */

import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import {
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  SlidersHorizontal,
} from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";

function ToggleRow({
  label,
  on,
  onPress,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center justify-between px-4 py-2.5">
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

export function ModelsHeaderRight({
  readyVisible,
  availableVisible,
  onToggleReady,
  onToggleAvailable,
  onExpandAll,
  onCollapseAll,
}: {
  readyVisible: boolean;
  availableVisible: boolean;
  onToggleReady: () => void;
  onToggleAvailable: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  const [open, setOpen] = useState(false);

  function run(fn: () => void): void {
    fn();
    setOpen(false);
  }

  return (
    <View>
      <Pressable
        onPress={() => setOpen(!open)}
        className={`p-2 rounded-lg border ${
          open ? "border-primary bg-primary/20" : "border-transparent"
        }`}
      >
        <SlidersHorizontal size={18} color={colors.primary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable className="flex-1" onPress={() => setOpen(false)}>
          <View className="absolute right-4 top-16 w-60 bg-surface-1 border border-border rounded-xl overflow-hidden">
            <ToggleRow label="Ready to use" on={readyVisible} onPress={() => run(onToggleReady)} />
            <ToggleRow
              label="Available to download"
              on={availableVisible}
              onPress={() => run(onToggleAvailable)}
            />
            <View className="h-px bg-border mx-4" />
            <Pressable onPress={() => run(onExpandAll)} className="flex-row items-center gap-2 px-4 py-2.5">
              <ChevronsUpDown size={16} color={colors.secondaryText} />
              <Text className="font-sans text-body-md text-primary-text">Expand all</Text>
            </Pressable>
            <Pressable onPress={() => run(onCollapseAll)} className="flex-row items-center gap-2 px-4 py-2.5">
              <ChevronsDownUp size={16} color={colors.secondaryText} />
              <Text className="font-sans text-body-md text-primary-text">Collapse all</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
