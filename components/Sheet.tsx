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
 *
 * LAYOUT IS POCKETPAL'S, VERBATIM: Sheet.tsx renders THREE PLAIN CHILDREN
 * in normal flex flow inside the sheet's content view — a header row, the
 * scroller, then the action row. Nothing is absolutely positioned, there
 * is no native footer, and no native header slot. The bar is pinned by
 * the same thing that pins it in the reference: it is the last child of a
 * column whose scroller sits above it.
 *
 *   TrueSheet, one detent: auto
 *     View         header: title + close — never scrolls away
 *     ScrollView   the ONLY scroller
 *     View         actions: pinned below the scroller
 *
 * The reference is pocketpal-ai src/components/Sheet/Sheet.tsx plus its
 * Actions.tsx; this app's Sheet is the same three children. Nothing about it needs native support: TrueSheet's content
 * view is a plain RN column when neither `style` nor `scrollable` is
 * passed (TrueSheet.tsx:569-573), and `contentHeight` — the base of the
 * 'auto' detent — is the measured height of that whole column
 * (TrueSheetDetentCalculator.kt:61: contentHeight + headerHeight +
 * contentBottomInset). Native `header`/`footer` slots and
 * `footerOptions.keyboardOffset` are deliberately unused: with them the
 * bar is absolute (TrueSheet.tsx styles.footer) and needs a measured
 * reserve plus keyboard tuning; in-flow it cannot overlap the body, so it
 * needs neither.
 *
 * Two learnings from the community-sheet era, kept:
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
 *   the real content. The body then carries its own `maxHeight` bound so
 *   content taller than the surface scrolls inside a bounded box instead
 *   of being clipped with no way to scroll to it.
 *
 * - Keyboard avoidance comes from the NATIVE side: MainActivity is
 *   `windowSoftInputMode="adjustResize"`
 *   (android/app/src/main/AndroidManifest.xml:29), so the dialog resizes
 *   above the keyboard and the body must NOT pad or scroll for the
 *   keyboard itself. A KeyboardAwareScrollView did both (device-observed:
 *   short bodies VOIDED their whole content the moment the keyboard
 *   opened, and every keystroke re-measured pad+scroll).
 *
 * THE BODY BOUND IS THE SURFACE BOX MINUS THE TWO SIBLINGS. The header and
 * the actions bar are both measured, because the 'auto' detent is the sum
 * of all three: a body capped at the full surface box would make the
 * sheet's last rows — and the pinned bar — extend past what TrueSheet
 * clamps the surface to. Measured heights are the reserve; both slots
 * report 0 on the first layout, exactly as the old native footer did.
 *
 * `scrollable={false}` is for a body that IS the scroller (a paginated
 * FlatList): a VirtualizedList nested in a ScrollView warns and never
 * paginates. Such a body keeps its own padded, bounded wrapper around
 * `children` — the wrapper wraps the BODY, not the header.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import {
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import { TrueSheet, type TrueSheet as TrueSheetType } from "@lodev09/react-native-true-sheet";
import { X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../themes/tokens.ts";

/** An in-flow slot's measured height.
 *
 *  The header and the actions bar are siblings of the scroller, so their
 *  heights are part of what the sheet measures — and the body's `maxHeight`
 *  has to be the surface box minus both. Both start at 0, as the old
 *  native footer's measured height did. */
function useSlotHeight(): [number, (event: LayoutChangeEvent) => void] {
  const [height, setHeight] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height;
    setHeight((prev) => (prev === next ? prev : next));
  }, []);
  return [height, onLayout];
}

export function Sheet({
  visible,
  onClose,
  title,
  actions,
  scrollable = true,
  titleEllipsize = false,
  children,
  testID,
  ref,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Pinned below the scrolling body, e.g. a reset action. PocketPal's
   *  `Sheet.Actions`: a plain in-flow row, the last child of the sheet's
   *  column. Sheets without commit actions pass none. */
  actions?: ReactNode;
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
  const [headerHeight, onHeaderLayout] = useSlotHeight();
  const [actionsHeight, onActionsLayout] = useSlotHeight();

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

  // One bound for both body branches: the surface box minus the two
  // in-flow siblings. Both report 0 before their first layout, so a body
  // that laid out first still starts with the full box. Clamped at zero:
  // on a very short window with a tall bar the subtraction can go negative,
  // and a negative maxHeight is meaningless to Yoga.
  const bodyBound = Math.max(0, bodyMaxHeight - headerHeight - actionsHeight);

  /** The fixed header. PocketPal's Sheet.tsx header row: title, close,
   *  one row. It is the FIRST of the three children — a sibling of the
   *  scroller, not a row inside it — so it never scrolls away. */
  const header = (
    <View
      onLayout={onHeaderLayout}
      className="flex-row items-center justify-between px-4 pb-2 pt-4"
    >
      <Text
        className="flex-1 mr-2 font-sans-semibold text-body-lg text-primary-text"
        numberOfLines={titleEllipsize ? 1 : undefined}
        ellipsizeMode={titleEllipsize ? "middle" : undefined}
      >
        {title}
      </Text>
      <Pressable
        onPress={onClose}
        className="icon-btn"
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={`Close ${title}`}
      >
        <X size={20} color={colors.secondaryText} />
      </Pressable>
    </View>
  );

  /** The pinned action row — PocketPal's Sheet.Actions, in flow, last
   *  child. Its own `10 + insets.bottom` is the nav-bar clearance, so the
   *  body above it pads nothing: one owner per inset, never two.` */
  const actionsBar = actions ? (
    <View
      onLayout={onActionsLayout}
      className="px-4 pt-2.5 gap-2.5"
      style={{ paddingBottom: 10 + insets.bottom }}
    >
      {actions}
    </View>
  ) : null;

  /** The scroller, or — for a body that is itself a virtualized list —
   *  the padded, bounded wrapper the app has always used around
   *  `children`. The wrapper wraps the BODY; the header and the bar are
   *  its siblings, never inside it. */
  const body = scrollable ? (
    <ScrollView
      testID={testID}
      className="grow"
      contentContainerClassName="px-4 pb-4"
      keyboardShouldPersistTaps="handled"
      style={{
        maxHeight: Math.max(0, bodyBound),
        // No keyboard pad: the window resizes above the keyboard natively.
        // And no nav-bar pad when a bar is present — the bar itself clears
        // the nav bar, so a body pad under it would only be dead space.
        paddingBottom: actions ? 0 : insets.bottom,
      }}
    >
      {children}
    </ScrollView>
  ) : (
    <View
      testID={testID}
      className="grow px-4"
      style={{ maxHeight: Math.max(0, bodyBound), paddingBottom: actions ? 0 : insets.bottom }}
    >
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
      //
      // `scrollingExpandsSheet: false` (device-observed): its DEFAULT is
      // true, and true means a scroll gesture belongs to the SHEET, not
      // the content. Android's TrueSheetBottomSheetBehavior.kt consumes
      // the nested scroll (onNestedPreScroll) to grow the sheet, and
      // swallows the fling (onNestedFling returns true) so the list never
      // coasts; iOS maps it to prefersScrollingExpandsWhenScrolledToEdge
      // (TrueSheetViewController.mm). With `detents={["auto"]}` there is
      // no taller detent to grow into, so the gesture just MOVED the
      // sheet — "scrolling scrolls the sheet, not the content".
      //
      // This prop is independent of `scrollable`: the JS passes it to the
      // native view unconditionally (TrueSheet.js), and Android applies
      // it to the behavior in both the setter and sheet creation. So the
      // auto-detent measurement above stays intact.
      scrollableOptions={{ scrollingExpandsSheet: false }}
      onDidDismiss={() => {
        presentedRef.current = false;
        if (dismissedRef.current) return;
        dismissedRef.current = true;
        onClose();
      }}
    >
      {header}
      {body}
      {actionsBar}
    </TrueSheet>
  );
}
