# `@expo/ui/community/bottom-sheet` on Android: can it stop below the status bar AND scroll with RN views?

Investigated: 2026-09-27. Package `@expo/ui@57.0.20`, `react-native@0.86.3`, Android `androidx.compose.material3:1.5.0-alpha17` (resolved from the Gradle cache).
Sources are the shipped source in `node_modules/@expo/ui/**` and the Material3 bytecode. Nothing here was run on a device; section 9 ends with the exact experiment that has to settle the two open questions.

> **Version note (2026-09-29).** `package.json` was bumped to `@expo/ui ~57.0.21` (with `expo ~57.0.26`) partway through the session, by a sub-agent running an install, not by a deliberate decision — it is still uncommitted and unreviewed. Re-reads of `@expo/ui` source after that point, including the `RNHostView` and `HostView.onMeasure` findings quoted here, were made against **57.0.21**. The structural claims (no `maxDynamicContentSize`, no `topInset`, `matchContents` → `fillMaxSize` vs `requiredSize`) are unlikely to have moved in a patch, but they are pinned to source lines rather than to a version guarantee.

---

## 1. Verdict

**Probably yes for (b), conditionally yes for (a) — but only on one code path, and it is not verified.** The community sheet is a genuinely different implementation from the universal `@expo/ui` `BottomSheet`: on Android it renders its children through `RNHostView`, whose inner `TouchDispatchingRootViewGroup` **implements `RootView` and `NestedScrollingChild3`** (`node_modules/@expo/ui/android/src/main/java/expo/modules/ui/RNHostView.kt:256-258`). That is precisely the thing whose absence causes the `RootViewUtil.getRootView` assertion in the universal sheet, so requirement (b) is architecturally supported and the crash should not reproduce. Requirement (a) is achievable **only by omitting `snapPoints`**: with no snap points the sheet runs in `fitToContents` mode, the hosted RN view is measured to its own content height, and the sheet surface wraps that content — so capping the child's height caps the surface, leaving the dimmed app visible above it. With `snapPoints` present, the hosted view is `fillMaxSize()` and the Material sheet has no height constraint of its own, so the surface grows to the full dialog and covers the status bar. **The single most important consequence: there is no `maxHeight` / `topInset` / safe-area prop anywhere in the community sheet, so the child must supply its own inset and its own cap — the same arithmetic `components/Sheet.tsx` already does.** The one thing that could still sink it: whether the content height actually propagates RN → Compose on the `fitToContents` path. See §9 for the one-line test.

---

## 2. How the community sheet hosts children

**Not an RN `<Modal>`. Not the crashing `Children(UIComposableScope())` path either.** It is a Compose `Dialog` window, but the RN subtree is hosted through `RNHostView`:

`node_modules/@expo/ui/src/community/bottom-sheet/BottomSheet.android.tsx:189-211`
```tsx
<Host style={{ position: 'absolute', width }} pointerEvents="none">
  <ModalBottomSheet
    ref={sheetRef}
    onDismissRequest={handleDismiss}
    skipPartiallyExpanded={skipPartially}
    initialFullyExpanded={hasMultipleSnapPoints && pendingIndexRef.current === maxIndex}
    showDragHandle={handleComponent !== null}
    sheetGesturesEnabled={enablePanDownToClose}
    containerColor={containerColor}
    properties={{...}}>
    <RNHostView matchContents={fitToContents}>
      <View style={fitToContents ? { width } : { flexGrow: 1, height: 0 }}>
        <SheetScrollContextReset>{children}</SheetScrollContextReset>
      </View>
    </RNHostView>
  </ModalBottomSheet>
</Host>
```

- `Host` is a plain ExpoUI `HostView` rendered inline in the RN tree — no `Modal`, no `presentationController` (`src/jetpack-compose/Host/index.tsx`).
- `ModalBottomSheet` is `requireNativeView('ExpoUI', 'ModalBottomSheetView')` (`src/jetpack-compose/ModalBottomSheet/index.tsx:126-130`) and wraps its children in `<PresentedContent>` (`:151`), which sets `PresentedContentContext = true` — so the inner `RNHostView` computes `layoutRoot = useIsPresentedInOwnWindow() === true` (`src/jetpack-compose/RNHostView/index.tsx:62`) and dispatches its own touches.
- `RNHostView` native side, `android/src/main/java/expo/modules/ui/RNHostView.kt:99-110`, wraps the single RN child in a `TouchDispatchingRootViewGroup`:

```kotlin
val wrapper = TouchDispatchingRootViewGroup(child.context).apply {
  dispatchesTouchesToJS = layoutRoot
  val reactContext = child.context as? ReactContext
  if (reactContext != null) {
    eventDispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, child.id)
  }
  addView(child, FrameLayout.LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
}
```
```kotlin
private class TouchDispatchingRootViewGroup(context: Context) :
  FrameLayout(context), RootView, NestedScrollingChild3 {   // :256-258
```

**Contrast with the universal sheet** (the one that crashes): `src/universal/BottomSheet/index.android.tsx` puts children in a Compose `Column` and `ModalBottomSheetView.kt:165` renders them via `Children(UIComposableScope(), filter = { !isSlotView(it) })` — no `RNHostView`, hence no `RootView` in that window. That is the structural difference that matters for (b).

---

## 3. Requirement (a): surface stops below the status bar

### What the native sheet does with height

The community sheet passes **no `modifiers`** to `ModalBottomSheet` (see the prop list at `BottomSheet.android.tsx:189-201`) — the universal sheet does pass them (`src/universal/BottomSheet/index.android.tsx:97`). So there is no way to cap the `ModalBottomSheet` itself from the community API.

Material3's sheet surface, from the shipped bytecode (`androidx/compose/material3/SheetDefaultsKt.class`, `BottomSheetImpl_l84tTqM`, verified with `javap -c`): the only size modifiers on the sheet `Surface` are

```
1960: SizeKt."widthIn-VpY3zN4$default"   // max 640.dp
1966: SizeKt."fillMaxWidth$default"
```

**No `heightIn`, no `height`, no `requiredHeight`** anywhere in `SheetDefaultsKt`. The content is a plain `Column` (`SheetDefaultsKt:3709 → ColumnKt.columnMeasurePolicy`) — also **no `wrapContentHeight(unbounded = true)`**. Conclusion: **the sheet surface is exactly as tall as its content**, and the content is measured with `minHeight = 0 / maxHeight = dialog window height`.

### Path A — with `snapPoints` (2 or more): surface goes full screen

`BottomSheet.android.tsx:72-73`
```ts
const fitToContents = enableDynamicSizing && (!snapPointsProp || snapPointsProp.length === 0);
const skipPartially = fitToContents || !hasMultipleSnapPoints;
```
`snapPoints.length >= 2` ⇒ `fitToContents = false` ⇒ `<RNHostView matchContents={false}>` ⇒ native side picks

```kotlin
val sizingModifier = if (matchContents) {
  applySizeFromYogaNodeModifier()
} else {
  Modifier.fillMaxSize().then(reportSizeToYogaNodeModifier())   // RNHostView.kt:151-158
}
```

`fillMaxSize` inside a `Column` whose `maxHeight` is the window height **is** the window height (Compose's `fillMaxSize` applies on any bounded axis), and `reportSizeToYogaNodeModifier` then *reports that size back to Yoga* (`RNHostView.kt:203-212`), so the JS child is told it is full screen too. **The sheet covers the status bar. (a) FAILS on this path.**

(README's table "`['25%','50%']` → Partial (~50%) + expanded" is aspirational: the partial anchor is derived from the *content* height, and the content is the full dialog. Not verified on device, but the source chain above is unambiguous.)

### Path B — no `snapPoints` (default `enableDynamicSizing: true`): surface wraps the content — **this is the path that can satisfy (a)**

`fitToContents = true` ⇒ `skipPartially = true` (only the `Expanded` anchor exists, whose offset is `0`, i.e. no translation) and `matchContents = true`:

```kotlin
private fun applySizeFromYogaNodeModifier(): Modifier {          // RNHostView.kt:177-193
  val childSize = childSizeState.value                            // from the RN child's own
  return with(density) {                                         // OnLayoutChangeListener (:89-92)
    if (childSize.width > 0 && childSize.height > 0)
      Modifier.requiredSize(childSize.width.toDp(), childSize.height.toDp())
    else Modifier
  }
}
```

The RN child is measured with the `AT_MOST <window height>` spec, Yoga resolves its content height (e.g. 400), the layout listener publishes it, and Compose resizes the sheet surface to 400. Bottom-anchored ⇒ **top edge at `windowHeight - 400`**, dimmed app above, status bar visible. This matches the already device-verified behaviour of the *universal* sheet with no snap points (prior finding 5) and is the same mechanism: the sheet is content-sized.

So **(a) = yes, if** you omit `snapPoints`, give the child a bounded height, and the content height propagates. The cap that puts the top edge at `insets.top + 16` is the repo's existing arithmetic:

`components/Sheet.tsx` → `sheetMaxHeight(height, insets.top)` from `lib/sheet.ts` — the same expression the current hand-rolled sheet uses.

### The inset itself

`ModalBottomSheet` defaults `contentWindowInsets` to `BottomSheetDefaults.getModalWindowInsets`, which is `WindowInsets.safeDrawing.only(Bottom)` (bytecode: `BottomSheetDefaults.getModalWindowInsets` → `getSafeDrawing` → `only(bottom)`; confirmed via `javap -c` on `BottomSheetDefaults.class`). **No top inset.** The JS child must add `paddingTop: insets.top + 16` itself. There is no `topInset` prop (§5).

---

## 4. Requirement (b): RN scrolling

**Source says yes. The universal sheet's crash cannot fire here.**

- The crash requires the RN scroll view's ancestor chain to contain no `RootView`. In the community sheet the chain ends at `TouchDispatchingRootViewGroup : FrameLayout, RootView, NestedScrollingChild3` (`RNHostView.kt:256-258`), so `RootViewUtil.getRootView` resolves. The class even carries the RN-idiom plumbing: `onChildStartedNativeGesture` / `onChildEndedNativeGesture` / `requestDisallowInterceptTouchEvent` overrides (`:404-470`).
- Nested scrolling is *deliberately* wired, not accidental: `onStartNestedScroll` accepts vertical axes and relays pre-scroll/post-scroll/pre-fling/fling up to the Compose sheet (`:471-520`), plus `settleSheetIfNoFling()` (`:508-515`). That is the behaviour `@gorhom/bottom-sheet` had to reimplement in JS.
- `BottomSheetScrollView` / `BottomSheetFlatList` / `BottomSheetSectionList` / `BottomSheetTextInput` are **bare re-exports**: `const BottomSheetScrollView = ScrollView;` / `const BottomSheetFlatList = FlatList;` (`src/community/bottom-sheet/index.tsx:90,98`). The docs' "Re-export of React Native ScrollView/FlatList" is literally true; there is no nested-scroll injection, no `GestureHandlerRootView`, and the README states the implementation "does not require" it (`src/community/bottom-sheet/README.md`).
- The only JS the sheet adds around your children is `SheetScrollContextReset` (`src/community/bottom-sheet/scrollContextReset.tsx`): it nulls `ScrollView.Context` and `VirtualizedList.contextType` for the sheet's subtree, so a sheet-level `FlatList` is not misdetected as nested inside the list that opened it. That is the piece that makes a bare RN `FlatList` safe here.
- **Unverified on device.** Nothing in the source exercises it; the shared code path with the crashing component is real, so this needs a device check before it ships.

---

## 5. `snapPoints` / sizing semantics

Units and mapping, all from `src/community/bottom-sheet/types.ts` + `BottomSheet.android.tsx`:

| Question | Answer | Source |
|---|---|---|
| Units of a numeric snap point | Purely a **height in JS/RN pixels**, parsed to `{type:'height', value}` | `types.ts` `parseSnapPoint` |
| Percentage strings | `'50%'` → `{type:'fraction', value: 0.5}` | same |
| Do pixels/dp ever reach the native sheet? | **No.** Numbers are only used by `snapToPosition`, which computes the *nearest index by distance* and then calls `partialExpand()`/`expand()` | `BottomSheet.android.tsx:22-45`, `:143-152` |
| Actual Android behaviour | `snapToIndex` maps: `index === maxIndex` → `expand()`, otherwise → `partialExpand()`. The doc comment says it outright: "Native ModalBottomSheet has two states: partial (~50%) and expanded" | `BottomSheet.android.tsx:143-146` |
| 0 or 1 snap point | `hasMultipleSnapPoints` false ⇒ `skipPartiallyExpanded = true` ⇒ sheet opens **expanded** | `:71-73` |
| `enableDynamicSizing` + `snapPoints` | Mutually exclusive. `fitToContents` requires `snapPoints` to be absent; when both are set, **`snapPoints` wins** and `matchContents` is off. Types say so: "This implementation cannot combine dynamic sizing with explicit snap points… `snapPoints` takes precedence" | `:72`, `types.ts` `enableDynamicSizing` |
| Is a numeric height cap passed to the native sheet (a la the universal `{height}` detent)? | **No.** Unlike the universal sheet's `{fraction}` / `{height}`, the community Android path never forwards a height to Material. There is no exact cap. | `BottomSheet.android.tsx:189-201` (no `modifiers`) |

Full props list (`types.ts` `BottomSheetProps`) — everything not listed as effective is a no-op on native: `ref`, `snapPoints`, `index`, `onChange`, `onClose`, `onDismiss`, `enablePanDownToClose`, `enableDynamicSizing`, `handleComponent`, `backgroundStyle`, `style`, `children`, and the accepted-but-ignored `animateOnMount`, `overDragResistanceFactor`, `enableOverDrag`, `enableContentPanningGesture`, `enableHandlePanningGesture`, `keyboardBehavior`, `keyboardBlurBehavior`, `backdropComponent`, `backgroundComponent`, `footerComponent`, `handleStyle`, `handleIndicatorStyle`, `containerStyle`.

**There is no `maxHeight`, no `maxDynamicContentSize`, no `topInset`, no safe-area prop, and no `modifiers` escape hatch.** Only `backgroundStyle.backgroundColor` is honoured on Android (extracted and passed as `containerColor`, `BottomSheet.android.tsx:78`, `:197`).

---

## 6. Safe-area handling

**The community bottom-sheet does nothing with `react-native-safe-area-context`, in JS or in Kotlin.** Grepped `src/community/bottom-sheet/**` and `android/src/main/java/expo/modules/ui/**`: no `useSafeAreaInsets`, no `WindowInsets`, no `safeDrawing` in Expo's own code for the sheet. The only inset logic that exists is Material3's, applied to the *content*, and for a modal sheet it is bottom-only (`safeDrawing.only(Bottom)`, bytecode of `BottomSheetDefaults.getModalWindowInsets`).

So: the JS child must supply the inset itself, exactly as `components/Sheet.tsx` does today — and must read `useSafeAreaInsets()` **outside** the sheet's own dialog window if the value is to be non-zero (the existing comment in `Sheet.tsx` explains the RN `Modal` case; the same caution applies to any native window).

---

## 7. iOS notes

- `BottomSheet.ios.tsx` maps `snapPoints` to `PresentationDetent`s: fraction → `{fraction}`, number → `{height}` (`:33-35`), applied via `presentationDetents`; with no snap points it uses `presentationSizing('fitted')` (`:221-224`). So **iOS does get exact height detents from numeric snap points — Android does not.**
- Native side: `ios/BottomSheetView.swift:87` sets `presentationDetents(childrenSize.height > 0 ? [.height(childrenSize.height)] : [.medium])` in the fit-to-contents case. i.e. the sheet is measured to its content and given a detent of exactly that height.
- No safe-area code in `BottomSheetView.swift`; UIKit applies its own sheet insets, and the child still supplies its own top padding.
- So the Android answer above is Android-only: on iOS you would get true detent sizing and could pass `snapPoints={[cap]}`.

---

## 8. What this would take in this repo

### `components/chat/GenerationSettingsSheet.tsx` (the target)

Today it renders `<Sheet>` (`components/Sheet.tsx`), which already does everything (a) and (b) need: capped `maxHeight` from `sheetMaxHeight(height, insets.top)`, `ScrollView` body, pinned footer, scrim, back-button dismiss. The comment block at `GenerationSettingsSheet.tsx:109-115` records why the native sheet was reverted — and the *specific* reason (no RN `RootView` in the Compose dialog) does **not** apply to the community sheet.

The swap is a container change only; the body is untouched:

```diff
- import { Sheet } from "../Sheet.tsx";
+ import BottomSheet, { BottomSheetScrollView } from "@expo/ui/community/bottom-sheet";

- <Sheet visible={visible} onClose={onClose} title={...} footer={...} testID="...">
-   ...children...
- </Sheet>
+ <BottomSheet
+   index={visible ? 0 : -1}
+   onChange={(i) => { if (i === -1) onClose(); }}
+   onClose={onClose}
+   enablePanDownToClose
+   handleComponent={null}
+   backgroundStyle={{ backgroundColor: colors.surface1 }}
+   testID="generation-settings-sheet"
+ >
+   <View style={{ height: sheetMaxHeight(height, insets.top) }}>
+     <Header …/>
+     <BottomSheetScrollView className="grow" contentContainerClassName="px-4 pb-4">
+       …unchanged children…
+     </BottomSheetScrollView>
+     {footer}
+   </View>
+ </BottomSheet>
```

Note what is **lost** versus `Sheet`: the scrim colour (`backgroundStyle` only carries the container colour on Android; the scrim is Material's), the `animationType="slide"`, the explicit `accessibilityViewIsModal`, and the ability to render a "close X" outside the sheet. Nothing in the diff touches the sampler rows, so the Uniwind-styled RN body survives intact — which is the whole point.

### The three other native sheets

`components/models/ModelSettingsSheet.tsx:59-67`, `components/HfTokenSettings.tsx:27-35`, `components/SearchSettings.tsx:76-84` all render the **universal** `BottomSheet` from `@expo/ui` around a `KeyboardAwareScrollView`. They sit on exactly the crashing code path: `ModalBottomSheetView.kt:165` → `Children(UIComposableScope(), …)` with no `RootView` in the dialog window. `KeyboardAwareScrollView` is **not** an `ScrollView` subclass — it is a `forwardRef` function component that renders `ScrollViewWithBottomPadding` → `Reanimated.ScrollView` (`node_modules/react-native-keyboard-controller/src/components/KeyboardAwareScrollView/index.tsx:96-117, 609-620`), i.e. react-native-reanimated's `createAnimatedComponent(ScrollView)`, which on Android is still RN's `ReactScrollView`. So the same `handleInterceptedTouchEvent` → `notifyNativeGestureStarted` → `RootViewUtil.getRootView` path is live. **Yes, the community sheet's answer applies to all three, and they should be treated as the same latent crash** (a drag inside the body, not a tap, is what fires it — which is presumably why it has not been hit yet in normal use).

`components/models/HFModelSearch.tsx:236` is a fourth universal-sheet user with no scroll view; it cannot hit this crash (nothing calls `notifyNativeGestureStarted`), but it shares the "no window insets" problem.

---

## 9. A worked example (conditional on the two open checks)

**Labelled: this is the closest thing that works if the checks pass. It is not verified.** It satisfies (a) by capping the child's own height, and (b) by using a bare RN `ScrollView` under `RNHostView`.

```tsx
// components/chat/GenerationSettingsSheet.tsx (body unchanged)
import { useEffect, useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BottomSheet, { BottomSheetScrollView } from "@expo/ui/community/bottom-sheet";

import { sheetMaxHeight } from "../../lib/sheet.ts";
import { colors } from "../../themes/tokens.ts";
import { SamplerRows } from "../SamplerRows.tsx";
import { ActionRow, Segmented, SettingsSection } from "../SettingsRows.tsx";

export function GenerationSettingsSheet({ visible, onClose }: {
  visible: boolean;
  onClose: () => void;
}) {
  // Read OUTSIDE the sheet: the sheet is its own native window.
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  /* …unchanged state/handlers… */

  return (
    // No snapPoints: that is what keeps the sheet content-sized instead of
    // letting the hosted view go fillMaxSize and cover the status bar.
    <BottomSheet
      index={visible ? 0 : -1}
      onChange={(i) => { if (i === -1) onClose(); }}
      onClose={onClose}
      enablePanDownToClose
      handleComponent={null}                     // no fake drag handle
      backgroundStyle={{ backgroundColor: colors.surface1 }}
    >
      {/* Runtime-computed: the cap is what keeps the top edge at
          insets.top + 16 with the dimmed app showing above it. */}
      <View style={{ height: sheetMaxHeight(height, insets.top) }} className="rounded-t-xl">
        <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
          <Text className="flex-1 mr-2 font-sans-semibold text-h3 text-primary-text">
            {isSession ? "Chat Generation Settings (Session)" : "Chat Generation Settings (Preset)"}
          </Text>
        </View>

        <BottomSheetScrollView
          className="grow"                       // grow, never flex-1 (see Sheet.tsx)
          contentContainerClassName="px-4 pb-4"
          keyboardShouldPersistTaps="handled"
        >
          {/* unchanged: intro text, Segmented, SamplerRows — all Uniwind + RN */}
        </BottomSheetScrollView>

        {!isSession || overrideCount > 0 ? (
          <SettingsSection>
            <View className="row">
              <ActionRow label="Reset" … />
            </View>
          </SettingsSection>
        ) : null}
      </View>
    </BottomSheet>
  );
}
```

**The two things that must be checked on a device before believing this:**

1. **Does the content height propagate?** On the `fitToContents` path the Compose size is `Modifier.requiredSize(childSize)` and `childSize` starts at `IntSize.Zero`, with the modifier dropped entirely while it is zero (`RNHostView.kt:177-193`). The chain only escapes zero if the `AndroidView` hands the RN child a non-zero `AT_MOST` spec. From the bytecode, Material3's sheet content is a plain `Column` (`columnMeasurePolicy`, no `wrapContentHeight(unbounded = true)`) inside a `fillMaxSize` `Box` (`SheetDefaultsKt`, `ModalBottomSheetKt`), so the spec should be `AT_MOST <window height>` and the child should measure to its content — but the prior "collapses to 0" experiment on the *universal* sheet was real, and this is a different code path that has never been run. **If the sheet renders empty or white, the whole approach is dead and `components/Sheet.tsx` stays.**
2. **Does a drag inside the body survive?** No crash expected (§4), but confirm `RootViewUtil.getRootView` is not hit on a real drag.

Test order: mount the sheet with a fixed `height` and no `ScrollView` first (isolates check 1), then add the `ScrollView` and drag (isolates check 2).

---

## 10. Sources

- `node_modules/@expo/ui/src/community/bottom-sheet/BottomSheet.android.tsx:22-45, 68-76, 143-152, 189-211` — snap parsing, `fitToContents`/`skipPartially`, the 2-state mapping, the render tree.
- `node_modules/@expo/ui/src/community/bottom-sheet/BottomSheet.ios.tsx:33-35, 221-224` — detent mapping, `presentationSizing('fitted')`.
- `node_modules/@expo/ui/src/community/bottom-sheet/index.tsx:90, 98` — `BottomSheetScrollView = ScrollView`, `BottomSheetFlatList = FlatList`.
- `node_modules/@expo/ui/src/community/bottom-sheet/scrollContextReset.tsx` — `ScrollView.Context` / `VirtualizedList.contextType` reset.
- `node_modules/@expo/ui/src/community/bottom-sheet/types.ts` — full `BottomSheetProps` list and `parseSnapPoint`.
- `node_modules/@expo/ui/src/community/bottom-sheet/README.md` — compatibility table ("does not require `GestureHandlerRootView`"; Android 2-state claim).
- `node_modules/@expo/ui/src/jetpack-compose/RNHostView/index.tsx:34-69` — `matchContents` → `expoInternalSizeFromChildren`, `layoutRoot = useIsPresentedInOwnWindow()`.
- `node_modules/@expo/ui/src/jetpack-compose/ModalBottomSheet/index.tsx:126-151` — `requireNativeView('ExpoUI','ModalBottomSheetView')` + `<PresentedContent>`.
- `node_modules/@expo/ui/src/jetpack-compose/Host/index.tsx` — inline `HostView`, no `Modal`.
- `node_modules/@expo/ui/android/src/main/java/expo/modules/ui/RNHostView.kt:89-110, 148-165, 177-193, 203-212, 254-258, 306-310, 404-520` — wrapper construction, `fillMaxSize` vs `requiredSize`, `RootView` + `NestedScrollingChild3`, "Always gets called with EXACTLY mode", nested-scroll relay.
- `node_modules/@expo/ui/android/src/main/java/expo/modules/ui/ModalBottomSheetView.kt:130-165` — `rememberModalBottomSheetState(props.skipPartiallyExpanded)` and `Children(UIComposableScope(), filter = { !isSlotView(it) })` (the universal path, no `RNHostView`).
- `node_modules/@expo/ui/src/universal/BottomSheet/index.android.tsx:60-99` — universal path: children in a Compose `Column`, and `modifiers` passed to `ModalBottomSheet` (the community path does not).
- `node_modules/@expo/ui/ios/BottomSheetView.swift:61-120` — `.sheet`, `presentationDetents([.height(childrenSize.height)])`.
- `node_modules/react-native-keyboard-controller/src/components/KeyboardAwareScrollView/index.tsx:96-117, 598-620` — `forwardRef` → `ScrollViewWithBottomPadding` → `Reanimated.ScrollView` (not an `ScrollView` subclass).
- `node_modules/@expo/ui/package.json` — the `"./community/bottom-sheet"` export map entry.
- Material3 1.5.0-alpha17 bytecode (from the Gradle cache, `javap -c` on `material3.aar!classes.jar`): `androidx/compose/material3/SheetDefaultsKt.class` (sheet `Surface` modifier chain = `widthIn` + `fillMaxWidth` only; content = `columnMeasurePolicy`), `androidx/compose/material3/ModalBottomSheetKt.class` (`Box(Modifier.fillMaxSize().imePadding())`, `contentWindowInsets` default = `BottomSheetDefaults.getModalWindowInsets`), `androidx/compose/material3/BottomSheetDefaults.class` (`getModalWindowInsets` = `safeDrawing.only(Bottom)`; `getWindowInsets` = `safeDrawing.only(Top+Bottom)` — the latter is *not* what a modal sheet uses).
- `components/Sheet.tsx`, `components/chat/GenerationSettingsSheet.tsx`, `components/models/ModelSettingsSheet.tsx:59-67`, `components/HfTokenSettings.tsx:27-35`, `components/SearchSettings.tsx:76-84`, `components/models/HFModelSearch.tsx:236`, `tests/settings-pattern.test.ts` — this repo's current state.
- Docs entry point (not otherwise needed; every claim above is from source): https://docs.expo.dev/versions/latest/sdk/ui/drop-in-replacements/bottomsheet/
