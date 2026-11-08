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
 *  PocketPal parity: use `<Sheet.Actions>` as a child component, rendered
 *  BELOW the ScrollView content with proper bottom padding. This ensures
 *  the content scrolls to its natural end before the actions, and users
 *  can reach the bottom of long forms. The actions are in a sticky footer.
 *
 *  `scrollable` (the shared prop) picks the body element:
 *    - true  -> the shared Sheet renders the ScrollView and plugs it in.
 *    - false -> the caller's body IS the scroller (e.g. a FlatList); pass
 *               it through `scrollableRef` so TrueSheet can coordinate.
 *
 *  `fill` is the third axis, for `scrollable={false}` only: the body takes
 *  the sheet's whole height instead of sizing to its content. Leave it off
 *  unless the body is itself a scroller - the `'auto'` detent measures a
 *  `flex-1` body against nothing and the content collapses.
 *
 *  `lazy={false}` mounts content up front so the `'auto'` detent measures
 *  settled content instead of the first-present frame.
 */

import {
  Children,
  useEffect,
  useRef,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type ScrollViewInstance,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { TrueSheet, type TrueSheet as TrueSheetType, type TrueSheetProps } from "@lodev09/react-native-true-sheet";
import { X } from "lucide-react-native";

import { useColors } from "@/themes/tokens.ts";
import { cn } from "@/utils/cn.ts";

/** Actions component rendered as a child of Sheet (PocketPal pattern).
 *  This is rendered BELOW the scrollable content, allowing the content
 *  to scroll to its natural end before the sticky actions footer. */
export function SheetActions({ children }: { children: ReactNode }) {
  return (
    <View className="px-4 pt-2.5 gap-2.5" style={{ paddingBottom: 10 }}>
      {children}
    </View>
  );
}

/** Check if a React node is a Sheet.Actions element */
function isSheetActionsElement(node: ReactNode): node is ReactElement<{ children: ReactNode }> {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as ReactElement).type === SheetActions
  );
}

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
  fill = false,
  ref,
  style,
  detents = ["auto"],
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** @deprecated Use <Sheet.Actions> as a child instead. */
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
  /** Non-scrollable body only: let the body take the sheet's full height
   *  instead of sizing to its content. Only callers whose body is itself a
   *  scroller (a FlatList) want this — they need a bounded height to scroll
   *  in place, and the bound comes from the sheet's own `style` (see
   *  HFModelSearch's details sheet). Everything else must stay content-
   *  sized, or the `'auto'` detent measures a collapse. */
  fill?: boolean;
  /** TrueSheet detents. Default: ["auto"] for content-sized sheets.
   *  Use fixed fractions (e.g., [0.7]) for PocketPal-style fixed-height sheets. */
  detents?: TrueSheetProps["detents"];
  ref?: Ref<TrueSheetType>;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const innerRef = useRef<TrueSheetType | null>(null);
  const internalScrollRef = useRef<ScrollViewInstance | null>(null);
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

  const resolvedScrollRef: TrueSheetProps["scrollableRef"] | null = scrollable ? internalScrollRef : (providedScrollableRef ?? null);

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

  // PocketPal parity: extract Sheet.Actions from children as a child component pattern
  // When children include <Sheet.Actions>, render its content in the footer slot
  const childrenArray = Children.toArray(children);
  const actionsFromChild = childrenArray.find(isSheetActionsElement);
  const bodyChildren = Children.toArray(children).filter((child) => !isSheetActionsElement(child));

  // Prefer <Sheet.Actions> child over deprecated `actions` prop
  const actionsContent = actionsFromChild
    ? (actionsFromChild as ReactElement<{ children: ReactNode }>).props.children
    : actions;

  const actionsBar = actionsContent ? (
    <View className="px-4 pt-2.5 gap-2.5" style={{ paddingBottom: 10 }}>
      {actionsContent}
    </View>
  ) : null;

  const body = scrollable ? (
    <ScrollView
      ref={internalScrollRef}
      testID={testID}
      contentContainerClassName="px-4 pb-4"
      keyboardShouldPersistTaps="handled"
    >
      {bodyChildren}
    </ScrollView>
  ) : (
    <View testID={testID} className={cn("px-4", fill && "flex-1")}>
      {bodyChildren}
    </View>
  );

  return (
    <TrueSheet
      ref={(instance) => {
        innerRef.current = instance;
        if (typeof ref === "function") ref(instance);
        else if (ref) ref.current = instance;
      }}
      detents={detents}
      dismissible
      grabber
      lazy={false}
      backgroundColor={colors.surface1}
      cornerRadius={12}
      style={[
        {
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 32,
          elevation: 8,
        },
        style,
      ]}
      header={header}
      footer={actionsBar ?? undefined}
      footerOptions={{ position: "absolute" }}
      footerStyle={{ backgroundColor: colors.surface1 }}
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

// Attach Actions as a subcomponent for PocketPal parity
Sheet.Actions = SheetActions;
