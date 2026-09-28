/** Shared bottom sheet, built on the Modal + card pattern this repo already
 * owns twice (ChatMenu.tsx, ModelsHeaderRight.tsx).
 *
 * Why this is not @expo/ui's native BottomSheet, which it replaces for the
 * two long sheets. Three reasons, all user-visible:
 *
 *   1. It applies no window insets. ModalBottomSheetView.kt is a stock
 *      Material3 ModalBottomSheet with no WindowInsets reference anywhere,
 *      so the JS child must supply every inset itself — which is why the
 *      generation sheet drew behind the status bar.
 *   2. On Android it can only rest at 'half' or 'full'; its own types say a
 *      {fraction} or {height} "snaps to the nearest of 'half' / 'full'". A
 *      sheet whose top edge sits just below the status bar is neither.
 *   3. Its pan gesture consumes vertical drags, so a nested scroll view
 *      fought it and the body would not scroll.
 *
 * Geometry matches PocketPal (Sheet.tsx:100-102): bottom-anchored and
 * capped at windowHeight - insets.top - SHEET_TOP_GAP, so a full sheet's top
 * edge lands below the status bar with the scrim showing above it. That
 * arithmetic lives in lib/sheet.ts, and tests/sheet.test.ts pins it.
 *
 * Dismiss is the close button, the scrim, and the hardware back button.
 * There is deliberately NO drag handle: a handle that does not drag is a
 * promise the sheet does not keep. Swipe-to-dismiss is the remaining gap
 * against PocketPal and is the follow-up.
 */

import type { ReactNode } from "react";
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

import { sheetMaxHeight } from "../lib/sheet.ts";
import { colors, scrim } from "../themes/tokens.ts";

export function Sheet({
  visible,
  onClose,
  title,
  footer,
  children,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Pinned below the scrolling body, e.g. a reset action. */
  footer?: ReactNode;
  children: ReactNode;
  testID?: string;
}) {
  // Read OUTSIDE the Modal on purpose. On Android a Modal is its own
  // window that already excludes the status bar, so insets.top measured
  // inside it would be 0; taking the parent's value is what compensates,
  // and the resulting top edge was confirmed on device.
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID={testID}
      // RN's Modal does not do this for us: without it the content behind
      // the sheet stays in the accessibility tree.
      accessibilityViewIsModal
    >
      <Pressable
        className="flex-1"
        onPress={onClose}
        // A dismiss affordance only. The labelled X in the header is the
        // accessible way out, so announcing a screen-sized button here
        // would be a lie to a screen reader.
        importantForAccessibility="no"
        // The scrim, which the native sheet took as a prop. A plain Modal
        // has to paint it, or a tall sheet is a card on an undimmed screen.
        style={{ backgroundColor: scrim }}
      />
      <View
        className="absolute left-0 right-0 bottom-0 rounded-t-xl bg-surface-1"
        // Runtime-computed: the cap is what keeps the top edge below the
        // status bar, and it depends on the window and the inset.
        style={{ maxHeight: sheetMaxHeight(height, insets.top) }}
      >
        <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
          {/* No numberOfLines: the card is full-bleed now, so the title
              wraps, and a cap here would truncate a long one. */}
          <Text className="flex-1 mr-2 font-sans-semibold text-h3 text-primary-text">
            {title}
          </Text>
          <Pressable
            onPress={onClose}
            className="h-12 w-12 items-center justify-center"
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`Close ${title}`}
          >
            <X size={20} color={colors.secondaryText} />
          </Pressable>
        </View>

        {/*
          flexGrow, deliberately NOT flex-1. Uniwind compiles flex-1 to
          native `flex: 1`, which Yoga resolves as flexBasis 0% — and a
          zero basis inside a maxHeight container is what collapsed this
          sheet to a white screen last time. flexGrow keeps the content as
          the base size, so a short sheet stays short and a tall one
          shrinks into a scroll.
        */}
        <ScrollView
          className="grow"
          contentContainerClassName="px-4 pb-4"
          style={footer ? undefined : { paddingBottom: 16 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>

        {footer ? (
          <View
            className="px-4 pt-2"
            // The home indicator, the way PocketPal's actions bar does it
            // (Actions.tsx:21: paddingBottom 10 + insets.bottom).
            style={{ paddingBottom: 10 + insets.bottom }}
          >
            {footer}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
