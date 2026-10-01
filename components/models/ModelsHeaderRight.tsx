/** Models header filter menu: filters + expand/collapse all.
 *
 * The dropdown anchors under the filter icon via measureInWindow, so it
 * sits correctly on every device (a fixed top offset overlapped the
 * header on notched phones).
 */

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Dimensions, Modal, Pressable, Text, View } from "react-native";
import {
  Check,
  ChevronsDownUp,
  ChevronsUpDown,
  Cloud,
  Download,
  Layers,
  SlidersHorizontal,
} from "lucide-react-native";

import { colors } from "../../themes/tokens.ts";
import type { ModelsUiFilter } from "../../store/modelsUi.ts";

function GroupLabel({ label }: { label: string }) {
  return (
    <Text
      numberOfLines={1}
      className="px-5 pt-3 pb-1 font-sans-medium text-caption text-secondary-text"
    >
      {label}
    </Text>
  );
}

function ToggleRow({
  label,
  on,
  onPress,
  icon,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  icon?: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="menu-row"
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
    >
      {/* Fixed icon slot + explicit menu width (PocketPal Menu.Item geometry).
          The width stays an inline style: the w-60 class failed to resolve
          on device, collapsing the menu into vertical text. Rows use
          classes; only the proven width fix keeps a style. */}
      <View className="mr-3 w-7 items-center justify-center">{icon}</View>
      <Text
        numberOfLines={1}
        className="mr-2 flex-1 font-sans text-body-md text-primary-text"
      >
        {label}
      </Text>
      <View
        className={`h-5 w-5 items-center justify-center rounded-sm border ${
          on ? "bg-primary border-primary" : "border-border"
        }`}
      >
        {on && <Check size={14} color={colors.base} />}
      </View>
    </Pressable>
  );
}

export function ModelsHeaderRight({
  downloadedOnly,
  hfOnly,
  grouped,
  onToggleFilter,
  onExpandAll,
  onCollapseAll,
}: {
  downloadedOnly: boolean;
  hfOnly: boolean;
  grouped: boolean;
  onToggleFilter: (filter: ModelsUiFilter) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<View>(null);

  function close(): void {
    setOpen(false);
  }

  function toggle(): void {
    if (open) {
      close();
      return;
    }
    const fallback = { top: 100, right: 16 };
    btnRef.current?.measureInWindow((x, y, w, h) => {
      const screenWidth = Dimensions.get("window").width;
      setAnchor({ top: y + h + 4, right: Math.max(8, screenWidth - (x + w)) });
      setOpen(true);
    });
    // measureInWindow is async on some hosts; never leave the menu shut.
    setTimeout(() => {
      if (!open) {
        setAnchor((a) => a ?? fallback);
        setOpen(true);
      }
    }, 100);
  }

  function run(fn: () => void): void {
    fn();
    close();
  }

  return (
    <View ref={btnRef}>
      <Pressable
        onPress={toggle}
        className={`h-12 w-12 items-center justify-center rounded-lg border ${
          open ? "border-primary bg-surface-3" : "border-transparent"
        }`}
        accessibilityRole="button"
        accessibilityLabel="Filter models"
        accessibilityState={{ expanded: open }}
      >
        <SlidersHorizontal size={18} color={colors.primary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <Pressable className="flex-1" onPress={close}>
          <View
            style={{
              position: "absolute",
              top: anchor?.top ?? 100,
              right: anchor?.right ?? 16,
              width: 264,
            }}
            className="bg-surface-1 border border-border rounded-lg overflow-hidden"
          >
            <GroupLabel label="Filters" />
            <ToggleRow
              label="Downloaded only"
              icon={<Download size={16} color={colors.secondaryText} />}
              on={downloadedOnly}
              onPress={() => run(() => onToggleFilter("downloadedOnly"))}
            />
            <ToggleRow
              label="Hugging Face only"
              icon={<Cloud size={16} color={colors.secondaryText} />}
              on={hfOnly}
              onPress={() => run(() => onToggleFilter("hfOnly"))}
            />
            <GroupLabel label="View" />
            <ToggleRow
              label="Group by device tier"
              icon={<Layers size={16} color={colors.secondaryText} />}
              on={grouped}
              onPress={() => run(() => onToggleFilter("grouped"))}
            />
            <View className="h-px bg-border mx-4" />
            <Pressable
              onPress={() => run(onExpandAll)}
              className="menu-row"
              accessibilityRole="button"
              accessibilityLabel="Expand all sections"
            >
              <Text
                numberOfLines={1}
                className="flex-1 font-sans text-body-md text-primary-text mr-2"
              >
                Expand all
              </Text>
              <View className="w-7 items-center">
                <ChevronsUpDown size={16} color={colors.secondaryText} />
              </View>
            </Pressable>
            <Pressable
              onPress={() => run(onCollapseAll)}
              className="menu-row"
              accessibilityRole="button"
              accessibilityLabel="Collapse all sections"
            >
              <Text
                numberOfLines={1}
                className="flex-1 font-sans text-body-md text-primary-text mr-2"
              >
                Collapse all
              </Text>
              <View className="w-7 items-center">
                <ChevronsDownUp size={16} color={colors.secondaryText} />
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}
