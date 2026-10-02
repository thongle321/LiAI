/** Shared bottom sheet, built on @expo/ui/community/bottom-sheet.
 *
 * Native modal presentation on Android (Jetpack Compose) and iOS (SwiftUI),
 * with pan-down-to-close, scrim tap, and back button dismiss handled by
 * the platform. No custom gesture code needed.
 *
 * Geometry: bottom-anchored, content-sized by default. Pass fullHeight
 * for a tall sheet whose top edge lands below the status bar — the height
 * is windowHeight - insets.top - 16, matching PocketPal's Sheet.tsx:100-102.
 * A definite height is required (not maxHeight): the community sheet has
 * no maxHeight / maxDynamicContentSize / topInset, so the child's own
 * height is the only lever on the surface. A maxHeight wrapper is an
 * at-most box, which leaves RNHostView's childSize at zero so the surface
 * goes full-height and covers the status bar.
 */

import type { ReactNode } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import BottomSheet from "@expo/ui/community/bottom-sheet";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { sheetMaxHeight } from "../lib/sheet.ts";
import { colors } from "../themes/tokens.ts";

export function Sheet({
  visible,
  onClose,
  title,
  footer,
  scrollable = true,
  titleEllipsize = false,
  fullHeight = false,
  children,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Pinned below the scrolling body, e.g. a reset action. */
  footer?: ReactNode;
  /** false for a body that IS the scroller (a paginated FlatList): a
   *  VirtualizedList nested in a ScrollView warns and never paginates. */
  scrollable?: boolean;
  /** Middle-ellipsize a long title (an "org/model" repo name keeps its
   *  informative end). Off by default: the other callers wrap. */
  titleEllipsize?: boolean;
  /** Tall sheet whose top edge lands below the status bar. */
  fullHeight?: boolean;
  children: ReactNode;
  testID?: string;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetHeight = fullHeight ? sheetMaxHeight(windowHeight, insets.top) : undefined;
  const contentStyle = sheetHeight ? { height: sheetHeight } : undefined;

  const header = (
    <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
      <Text
        className="flex-1 mr-2 font-sans-semibold text-h3 text-primary-text"
        numberOfLines={titleEllipsize ? 1 : undefined}
        ellipsizeMode={titleEllipsize ? "middle" : undefined}
      >
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
  );

  return (
    <BottomSheet
      index={visible ? 0 : -1}
      enablePanDownToClose
      onChange={(i) => {
        if (i === -1) onClose();
      }}
      onClose={onClose}
      backgroundStyle={{ backgroundColor: colors.surface1 }}
    >
      {scrollable ? (
        <KeyboardAwareScrollView
          testID={testID}
          className="grow"
          contentContainerClassName="px-4 pb-4"
          keyboardShouldPersistTaps="handled"
          style={contentStyle}
        >
          {header}
          {children}
          {footer}
        </KeyboardAwareScrollView>
      ) : (
        <View testID={testID} className="grow px-4" style={contentStyle}>
          {header}
          {children}
          {footer}
        </View>
      )}
    </BottomSheet>
  );
}
