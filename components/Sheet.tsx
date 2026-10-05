/** Shared bottom sheet, built on TrueSheet (`@lodev09/react-native-true-sheet`).
 *
 * Why TrueSheet and not the previous `@expo/ui/community/bottom-sheet`:
 * every tall sheet (HF search, HF details, generation settings) rendered
 * fullscreen behind the status bar on device despite an arithmetically
 * correct cap — the community sheet's Material3 surface has only
 * half/full resting states and no top inset, so tall content has nowhere
 * to stop. TrueSheet instead clamps every detent to
 * `realScreenHeight - topInset` (topInset = the status-bar height when
 * edge-to-edge, which this app always is at targetSdk 36), so tall sheets
 * stop below the status bar by construction — no hand-rolled height math.
 * TrueSheet owns insets, keyboard avoidance and gestures natively.
 *
 * Two learnings from the community-sheet era, kept or adapted:
 *
 * - Scrollable bodies keep `grow`, never `flex-1`: Uniwind compiles
 *   flex-1 to native `flex: 1`, which Yoga resolves as flexBasis 0% — and
 *   a zero basis inside a capped container measured the scroll view to
 *   zero, rendering a WHITE sheet (device-observed).
 * - TrueSheet's OWN `scrollable` prop is deliberately NOT passed (the
 *   local `scrollable` prop below only picks the body element). In v3 it
 *   puts `flex: 1` on the content view inside an absolute-fill container
 *   (TrueSheet.tsx:576,584 scrollableContent = {flex:1}), so
 *   contentHeight — which IS the 'auto' detent — reports the screen, and
 *   auto collapses to fullscreen (device-observed: every sheet opened
 *   near-full). With it off the content view wraps, and `auto` measures
 *   the real content; each body then carries its own `maxHeight` bound so
 *   content taller than the surface scrolls inside a bounded box instead
 *   of being clipped.
 * - v3's auto detent does NOT include the absolute footer (only `peek`
 *   does: TrueSheetDetentCalculator.kt:51), so a body with a footer must
 *   reserve the footer's measured height as bottom padding.
 * - Keyboard avoidance comes from the NATIVE side: the dialog resizes
 *   above the keyboard (adjustResize), so the body must NOT pad or
 *   scroll for the keyboard itself. A KeyboardAwareScrollView did both:
 *   it added keyboard-height padding to the content, auto sized the sheet
 *   to content+pad, and its scroll-to-focus landed inside that padding —
 *   short bodies VOIDED (title, blurb, input all gone) the moment the
 *   keyboard opened, and every keystroke re-measured pad+scroll (stutter
 *   and flicker, device-observed). Tall bodies only scrolled within
 *   range, which is exactly why the HF sheet "worked" and the API-key
 *   sheet did not.
 *
 * - Actions live in the SCROLL BODY, never TrueSheet's native `footer`
 *   (grill Q1/Q2): the native footer lifts above the keyboard without
 *   shrinking the body (TrueSheetViewController.positionFooter), so a
 *   footer floats over scrolled content — and no JS channel hears the
 *   dialog keyboard, so no bound can hold. In-body buttons are
 *   pixel-identical when the keyboard is closed.
 *
 * The shared `footer` prop stays wired to TrueSheet's native footer (the
 * wrapper keeps its safe-area pad inside) for sheets without text
 * inputs; every sheet that hosts an input keeps its actions in-body
 * instead, and footer-less bodies reserve the safe-area bottom so those
 * in-body actions always clear the nav bar.
 */

import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { Pressable, ScrollView, StatusBar, Text, View, useWindowDimensions } from "react-native";
import { TrueSheet, type TrueSheet as TrueSheetType } from "@lodev09/react-native-true-sheet";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../themes/tokens.ts";

// [DEBUG-a4f2] Temporary runtime probe for the nav-bar overlap question.
// Flip to false (or delete the whole block) once the numbers are read.
const DEBUG_INSETS = true;

export function Sheet({
  visible,
  onClose,
  title,
  footer,
  scrollable = true,
  titleEllipsize = false,
  children,
  testID,
  ref,
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
  children: ReactNode;
  testID?: string;
  ref?: Ref<TrueSheetType>;
}) {
  // TrueSheet is ref-driven (present/dismiss); this adapter keeps the
  // declarative visible/onClose API so no caller changes. The internal ref
  // merges with the forwarded one: both must drive the same instance.
  const innerRef = useRef<TrueSheetType | null>(null);
  // REGRESSION. Every hidden sheet called dismiss() on mount — including
  // the sort/author sheets nested inside the HF search sheet — before its
  // native view existed, logging "already dismissed" warnings and
  // throwing "TrueSheetView with tag not found". Dismiss may only fire
  // for a sheet this adapter actually presented.
  const presentedRef = useRef(false);
  const dismissedRef = useRef(false);

  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Floor the safe-area top with StatusBar.currentHeight (Android): a
  // zero inset would grow bodies behind the status bar.
  const topInset = Math.max(insets.top, StatusBar.currentHeight ?? 0);
  // TrueSheet clamps the SURFACE to realScreenHeight - topInset natively;
  // this clamps the CONTENT to the same box (window <= screen in
  // edge-to-edge, plus the 16px gap), so wrap-content bodies stay at-or-
  // below the surface instead of being clipped at the top with no way to
  // scroll to it. At-most: short content still wraps to its own height.
  const bodyMaxHeight = windowHeight - topInset - 16;
  // v3's auto detent ignores the absolute footer, so the body reserves its
  // measured height; measured at runtime rather than guessed.
  const [footerHeight, setFooterHeight] = useState(0);

  // [DEBUG-a4f2] Probe state. `sheetPosition` is TrueSheet's own reported
  // sheet height; `bodyHeight` is what the React content actually measured.
  // The DIFFERENCE is the bottom inset TrueSheet applied natively -- the one
  // value `useSafeAreaInsets()` is suspected of dropping.
  const [sheetPosition, setSheetPosition] = useState(0);
  const [bodyHeight, setBodyHeight] = useState(0);
  // THE BOTTOM INSET, measured from TrueSheet itself.
  //
  // `useSafeAreaInsets().bottom` is 0 on this device (react-native-safe-area-
  // context #546: the bottom inset is not reported on Android 15), so it
  // cannot be trusted -- device probe confirmed insets.bottom=0 on all four
  // sheets. TrueSheet DOES know the real value natively
  // (TrueSheetViewController.contentBottomInset, read via ScreenUtils) and
  // reports its own sheet height through onPositionChange, so the inset is
  // whatever the sheet is taller than its content.
  //
  // FROZEN on the first settled measurement, and only once. Recomputing it
  // from an already-padded body feeds the padding back into the auto detent,
  // which grows the sheet a frame at a time.
  const [nativeBottom, setNativeBottom] = useState<number | null>(null);
  const recordPosition = (sheet: number) => {
    setSheetPosition(sheet);
    setNativeBottom((prev) => {
      if (prev !== null) return prev;
      if (bodyHeight <= 0 || sheet <= 0) return prev;
      return Math.max(0, sheet - bodyHeight - (footer ? footerHeight : 0));
    });
  };
  const bottomPad = nativeBottom ?? 0;
  const nativeInset = nativeBottom;
  const debugLines = DEBUG_INSETS
    ? [
        `insets.bottom=${insets.bottom}`,
        `bodyMaxHeight=${bodyMaxHeight}`,
        `window=${windowHeight}`,
        `body=${bodyHeight}`,
        `sheet=${sheetPosition}`,
        `nativeBottom=${nativeInset ?? "?"}`,
        `pad=${bottomPad}`,
      ]
    : [];

  useEffect(() => {
    if (visible) {
      dismissedRef.current = false;
      presentedRef.current = true;
      // The native view lazy-mounts on first present; a race with
      // unmount rejects, which is benign — an uncaught rejection is not.
      void innerRef.current?.present().catch(() => {});
    } else if (presentedRef.current && !dismissedRef.current) {
      // Programmatic close (X button, submit). A native swipe already
      // dismissed and set the flag in onDidDismiss — dismissing again
      // would race the finished animation.
      void innerRef.current?.dismiss().catch(() => {});
    }
  }, [visible]);

  const header = (
    <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
      <Text
        className="flex-1 mr-2 font-sans-semibold text-body-lg text-primary-text"
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
    <TrueSheet
      ref={(instance) => {
        innerRef.current = instance;
        if (typeof ref === "function") ref(instance);
        else if (ref) ref.current = instance;
      }}
      // ONE detent for every sheet: content-sized, clamped below the status
      // bar natively (TrueSheetDetentCalculator's realScreenHeight -
      // topInset). A fixed 0.9 made short sheets read as fullscreen — the
      // exact defect this replaced.
      detents={["auto"]}
      dismissible
      grabber
      backgroundColor={colors.surface1}
      cornerRadius={12}
      // NO `scrollable` prop on TrueSheet — v3's flag makes auto measure
      // the screen (see header). Bodies bound themselves below.
      footer={
        footer ? (
          <View
            className="px-4 pt-2"
            // The pinned action must clear the navigation bar. It cannot use
            // `insets.bottom` (0 here -- see nativeBottom above), so it takes
            // the inset TrueSheet reserved for the sheet.
            style={{ paddingBottom: bottomPad }}
            onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
          >
            {footer}
          </View>
        ) : undefined
      }
      onPositionChange={(e) => recordPosition(e.nativeEvent.position)}
      onDidDismiss={() => {
        presentedRef.current = false;
        if (dismissedRef.current) return;
        dismissedRef.current = true;
        onClose();
      }}
    >
      {scrollable ? (
        <ScrollView
          testID={testID}
          className="grow"
          onLayout={(e) => setBodyHeight(e.nativeEvent.layout.height)}
          contentContainerClassName="px-4 pb-4"
          keyboardShouldPersistTaps="handled"
          style={{
            maxHeight: bodyMaxHeight,
            // With a footer, the footer owns the nav-bar clearance (see its
            // paddingBottom) and the body only reserves the footer's measured
            // height. Without one, the body is the bottom-most element and
            // carries the clearance itself. `insets.bottom` used to fill that
            // role and is a hard 0 on Android 15, so it cleared nothing.
            paddingBottom: footer ? footerHeight : bottomPad,
          }}
        >
          {header}
          {children}
        </ScrollView>
      ) : (
        <View
          testID={testID}
          className="grow px-4"
          style={{
            maxHeight: bodyMaxHeight,
            // Was `undefined` with no footer, which dropped the inset
            // entirely for every scrollable={false} sheet (hf search, hf
            // details) -- the inconsistency that left them overlapping.
            paddingBottom: footer ? footerHeight : bottomPad,
          }}
        >
          {header}
          {children}
        </View>
      )}
      {/* [DEBUG-a4f2] Probe overlay. Tap-through, and the LAST child so it
          paints above the body. Removed in the cleanup pass. */}
      {DEBUG_INSETS && (
        <View
          pointerEvents="none"
          className="absolute left-0 right-0 top-0 z-50 rounded-b bg-black/85 px-2 py-1"
        >
          {debugLines.map((line) => (
            <Text key={line} className="text-[10px] text-white">
              {line}
            </Text>
          ))}
        </View>
      )}
    </TrueSheet>
  );
}
