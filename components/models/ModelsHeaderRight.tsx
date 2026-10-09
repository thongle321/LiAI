/** Models header filter menu: filters + expand/collapse all.
 *
 * The dropdown anchors under the filter icon via measureInWindow, so it
 * sits correctly on every device (a fixed top offset overlapped the
 * header on notched phones).
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Dimensions, Modal, Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import {
  Check,
  Cloud,
  Download,
  Layers,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react-native";

import {
  MENU_DURATION_MS,
  menuEnteringFade,
  menuEnteringZoom,
  menuExiting,
} from "../../lib/motion.ts";
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
  onResetModels,
}: {
  downloadedOnly: boolean;
  hfOnly: boolean;
  grouped: boolean;
  onToggleFilter: (filter: ModelsUiFilter) => void;
  onResetModels?: () => void;
}) {
  const [open, setOpen] = useState(false);
  // RN tears a modal down the instant `visible` flips false, which would
  // swallow the closing fade; `shown` outlives `open` by exactly the exit
  // duration so paper's fade-out actually plays before the menu unmounts.
  const [shown, setShown] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<View>(null);
  // PocketPal parity: the menu always plays, ignoring the OS reduce-motion
  // setting (paper hardcodes its durations the same way). Doubles as the
  // close lag — `shown` outlives `open` by exactly the exit duration so the
  // fade-out finishes before the Modal unmounts.
  const menuMs = MENU_DURATION_MS;

  // The Modal mounts synchronously with `open` (see toggle()), and the menu
  // itself mounts with it: `entering` fires on mount, so the reveal cannot
  // start before the view exists. On close the menu unmounts at once and
  // `exiting` plays while the Modal lingers for the lag above.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => setShown(false), menuMs);
    return () => clearTimeout(t);
  }, [open, menuMs]);

  function close(): void {
    setOpen(false);
  }

  function toggle(): void {
    if (open) {
      close();
      return;
    }
    const fallback = { top: 100, right: 16 };
    // One opening per tap. measureInWindow is async on some hosts, so a
    // 100ms fallback also fires — and it reads the captured `open`, which is
    // always the stale `false`. Without this flag, a menu dismissed inside
    // 100ms of opening got re-opened by its own fallback.
    let opened = false;
    btnRef.current?.measureInWindow((x, y, w, h) => {
      if (opened) return;
      opened = true;
      const screenWidth = Dimensions.get("window").width;
      setAnchor({ top: y + h + 4, right: Math.max(8, screenWidth - (x + w)) });
      setOpen(true);
      setShown(true);
    });
    // measureInWindow is async on some hosts; never leave the menu shut.
    setTimeout(() => {
      if (opened) return;
      opened = true;
      setAnchor((a) => a ?? fallback);
      setOpen(true);
      setShown(true);
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

      <Modal visible={shown} transparent animationType="none" onRequestClose={close}>
        <Pressable className="flex-1" onPress={close}>
          {open && (
          <Animated.View
            entering={menuEnteringFade(menuMs)}
            exiting={menuExiting(menuMs)}
            style={{
              position: "absolute",
              top: anchor?.top ?? 100,
              right: anchor?.right ?? 16,
              width: 264,
            }}
            className="bg-surface-1 border border-border rounded-lg overflow-hidden"
          >
            {/* Scale half of the reveal, pinned to the opening corner. No
                exiting: paper never reverses the scale, only the fade. */}
            <Animated.View
              entering={menuEnteringZoom(menuMs)}
              style={{ transformOrigin: "right top" }}
            >
            <GroupLabel label="Filters" />
            <ToggleRow
              label="Hugging Face Models"
              icon={<Cloud size={16} color={colors.secondaryText} />}
              on={hfOnly}
              onPress={() => run(() => onToggleFilter("hfOnly"))}
            />
            <ToggleRow
              label="Downloaded Models"
              icon={<Download size={16} color={colors.secondaryText} />}
              on={downloadedOnly}
              onPress={() => run(() => onToggleFilter("downloadedOnly"))}
            />
            <GroupLabel label="View" />
            <ToggleRow
              label="Group by Model Type"
              icon={<Layers size={16} color={colors.secondaryText} />}
              on={grouped}
              onPress={() => run(() => onToggleFilter("grouped"))}
            />
            <View className="h-px bg-border mx-4" />
            {onResetModels ? (
              <Pressable
                onPress={() => run(onResetModels)}
                className="menu-row"
                accessibilityRole="button"
                accessibilityLabel="Reset Models List"
              >
                <View className="mr-3 w-7 items-center justify-center">
                  <RotateCcw size={16} color={colors.secondaryText} />
                </View>
                <Text
                  numberOfLines={1}
                  className="mr-2 flex-1 font-sans text-body-md text-primary-text"
                >
                  Reset Models List
                </Text>
              </Pressable>
            ) : null}
            </Animated.View>
          </Animated.View>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}
