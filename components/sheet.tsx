/** Shared bottom sheet, built on TrueSheet (`@lodev09/react-native-true-sheet` v4).

 *  Layout follows TrueSheet v4's canonical pattern (see the
 *  `@truesheet-usage` skill): the header and footer are passed as native
 *  slots, the body is a single scroller plugged in through `scrollableRef`,
 *  and the sheet sizes itself to its content (`detents={["auto"]}`) with the
 *  viewport bounded natively. Consequences for every caller:
 *
 *    - Header and footer are sticky native chrome - they never scroll away.
 *    - The body scrolls in place; `scrollingExpandsSheet: false` means a
 *      scroll gesture belongs to the CONTENT, and only the grabber moves
 *      (resizes / dismisses) the sheet.
 *    - Safe-area insets are handled natively (footer absorbs the bottom
 *      inset), so no manual `insets.bottom` padding anywhere.
 *
 *  `scrollable` (the shared prop) picks the body element:
 *    - true  -> the shared Sheet renders the ScrollView and plugs it in.
 *    - false -> the caller's body IS the scroller (e.g. a FlatList); pass
 *               it through `scrollableRef` so TrueSheet can coordinate.
 *
 *  `lazy={false}` mounts content up front so the `'auto'` detent measures
 *  settled content instead of the first-present frame.
 */

import {
  useEffect,
  useRef,
  type ReactNode,
  type Ref,
} from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { TrueSheet, type TrueSheet as TrueSheetType, type TrueSheetProps } from "@lodev09/react-native-true-sheet";
import { X } from "lucide-react-native";

import { useColors } from "@/themes/tokens.ts";

export function Sheet({
  visible,
  onClose,
  title,
  actions,
  scrollable = true,
  scrollableOptions,
  titleEllipsize = false,
  children,
  testID,
  scrollableRef: providedScrollableRef,
  ref,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions?: ReactNode;
  scrollable?: boolean;
  scrollableOptions?: { scrollingExpandsSheet?: boolean; contentInsetAdjustment?: "automatic" | "never" | "safe-area" | "footer" };
  titleEllipsize?: boolean;
  children: ReactNode;
  testID?: string;
  /** Plug an externally-owned scroller (e.g. a FlatList) into TrueSheet so
   *  it can bound the viewport and coordinate gestures. Ignored when
   *  `scrollable` is true (the shared ScrollView is plugged instead). */
  scrollableRef?: TrueSheetProps["scrollableRef"];
  ref?: Ref<TrueSheetType>;
}) {
  const colors = useColors();
  const innerRef = useRef<TrueSheetType | null>(null);
  const internalScrollRef = useRef<ScrollView | null>(null);
  const presentedRef = useRef(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      dismissedRef.current = false;
      presentedRef.current = true;
      void innerRef.current?.present().catch(() => {});
    } else if (presentedRef.current && !dismissedRef.current) {
      void innerRef.current?.dismiss().catch(() => {});
    }
  }, [visible]);

  const resolvedScrollRef = scrollable ? internalScrollRef : (providedScrollableRef ?? null);

  const header = (
    <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
      {title ? (
        <Text
          className="flex-1 mr-2 font-sans-semibold text-body-lg text-primary-text"
          numberOfLines={titleEllipsize ? 1 : undefined}
          ellipsizeMode={titleEllipsize ? "middle" : undefined}
        >
          {title}
        </Text>
      ) : (
        <View className="flex-1" />
      )}
      <Pressable
        onPress={onClose}
        className="icon-btn"
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={title ? `Close ${title}` : "Close sheet"}
      >
        <X size={20} color={colors.secondaryText} />
      </Pressable>
    </View>
  );

  const actionsBar = actions ? (
    <View className="px-4 pt-2.5 gap-2.5" style={{ paddingBottom: 10 }}>
      {actions}
    </View>
  ) : null;

  const body = scrollable ? (
    <ScrollView
      ref={internalScrollRef}
      testID={testID}
      contentContainerClassName="px-4 pb-4"
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View testID={testID} className="px-4">
      {children}
    </View>
  );

  return (
    <TrueSheet
      ref={(instance) => {
        innerRef.current = instance;
        if (typeof ref === "function") ref(instance);
        else if (ref) ref.current = instance;
      }}
      detents={["auto"]}
      dismissible
      grabber
      lazy={false}
      backgroundColor={colors.surface1}
      cornerRadius={12}
      style={{
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 32,
        elevation: 8,
      }}
      header={header}
      footer={actionsBar ?? undefined}
      scrollableRef={resolvedScrollRef ?? undefined}
      scrollableOptions={scrollableOptions ?? { scrollingExpandsSheet: false }}
      onDidDismiss={() => {
        presentedRef.current = false;
        if (dismissedRef.current) return;
        dismissedRef.current = true;
        onClose();
      }}
    >
      {body}
    </TrueSheet>
  );
}
