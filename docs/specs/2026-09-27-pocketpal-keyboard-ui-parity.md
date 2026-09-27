# Spec: PocketPal keyboard + surrounding-UI parity (react-native-keyboard-controller)

Date: 2026-09-27
Status: Draft — awaiting sign-off
Scope: how `pocketpal-ai` drives the keyboard on the chat screen and elsewhere, and what
LiAI must copy. READ-ONLY research pass; no app code was modified.

**Version frames used throughout this document**

| Frame | Version | Where verified |
|---|---|---|
| PocketPal's own pin | `react-native-keyboard-controller@1.19.6` | `pocketpal-ai/package.json:73` |
| LiAI's pin | `react-native-keyboard-controller@1.21.9` | `D:\aivision\package.json:38`, confirmed against `node_modules/react-native-keyboard-controller/package.json` |
| Upstream docs read for prose | `main` (1.22+) | `raw.githubusercontent.com/kirillzyusko/react-native-keyboard-controller/main/docs/docs/api/components/keyboard-chat-scroll-view.mdx` |

**Exports present in the installed 1.21.9 `.d.ts`** (verified by reading
`node_modules/react-native-keyboard-controller/lib/typescript/index.d.ts` and the
`components/index.d.ts` / `views/index.d.ts` barrels):

`KeyboardProvider`, `KeyboardChatScrollView`, `KeyboardAvoidingView`,
`KeyboardStickyView`, `KeyboardAwareScrollView`, `KeyboardToolbar`,
`OverKeyboardView`, `KeyboardExtender`, `useKeyboardAnimation`,
`useReanimatedKeyboardAnimation`, `useKeyboardHandler`,
`useGenericKeyboardHandler`, `useKeyboardState`, `useWindowDimensions`,
`useReanimatedFocusedInput`, `useFocusedInputHandler`, `useKeyboardController`,
`useResizeMode`.

**NOT exported in 1.21.9 (main only):** `KeyboardGestureArea`. The native spec file
`lib/typescript/specs/KeyboardGestureAreaNativeComponent.d.ts` exists, but there is no
`components/KeyboardGestureArea/` directory, no `export … KeyboardGestureArea` in
`lib/typescript/index.d.ts` or `lib/typescript/components/index.d.ts`, and 0 grep hits
for the identifier across all installed `.d.ts` files. **The JS component is unavailable
at 1.21.9.**

`KeyboardChatScrollViewRef` is likewise **not** exported as a type in 1.21.9 (0 hits);
the component's ref is typed as `Reanimated.ScrollView`
(`components/KeyboardChatScrollView/index.d.ts`), which does expose `scrollToEnd`.
`extraKeyboardSpace` exists in 1.21.9 **only** on `KeyboardAwareScrollView`
(`components/KeyboardAwareScrollView/types.d.ts`), **not** on `KeyboardChatScrollView`
(0 hits in `components/KeyboardChatScrollView/types.d.ts`).

---

## 1. Summary

- **One provider, at the app root, wrapping everything** — `KeyboardProvider` with
  `statusBarTranslucent navigationBarTranslucent`, mounted inside `SafeAreaProvider`
  and *above* the navigator (`pocketpal-ai/App.tsx:95`).
- **One reconciled occlusion value, derived once, consumed by three consumers.** The
  expression is `Math.max(0, Math.abs(keyboard.height.value) - insets.bottom)`
  (`pocketpal-ai/src/components/ChatView/ChatView.tsx:424-426`), and its comment is the
  single most valuable artifact in the file: it explains the negative height, the inset
  subtraction, and why there is deliberately no platform version fork.
- **The library reports `keyboard.height` as NEGATIVE while the keyboard is up**; every
  consumer `abs()`es it (`ChatView.tsx:415-417`, `425`).
- **PocketPal does NOT use `KeyboardChatScrollView`.** It uses a plain
  `Reanimated.FlatList` with `inverted`, an `onScroll` handler, and a hand-rolled
  bottom spacer as `ListHeaderComponent` (`ChatView.tsx:962-979`, `985-1029`). LiAI is on
  `KeyboardChatScrollView`; that is a deliberate divergence, not a gap.
- **Everything above the composer is absolutely positioned at `bottom: 0` with
  `zIndex: 10`** and translated, not laid out in flow
  (`ChatView/styles.ts:67-84`, `ChatView.tsx:1136-1143`).
- **Composer height is measured on the whole input container** via `onLayout`, not on
  the text field and not via `onContentSizeChange` — the growth signal includes banners
  and any attached-image chrome (`ChatView.tsx:351-352`, `1139`).
- **Scroll-to-bottom is a manual Reanimated scroll tracker** (`underflow` / `atLatest`,
  `STICK = 24`, `LEAVE = 40`, `EPS = 1`), deliberately hysteresis-based so the button
  cannot flicker (`ChatView.tsx:448-495`).
- **A `KeyboardStickyView` wraps only the scroll-to-bottom button**, with
  `offset={{closed: 0, opened: insets.bottom}}` (`ChatView.tsx:1045`) — that `opened`
  value reads as a double-count and is flagged in §6, not copied.
- **The empty / no-model state is a `ListEmptyComponent` with a hard-coded
  `marginBottom: bottomComponentHeight + 100`**, not a centred flex child
  (`ChatEmptyPlaceholder.tsx:85-88`). **This one is not copyable as-is**: it only
  works because PocketPal's list adds no keyboard inset. `KeyboardChatScrollView`
  adds the keyboard height to the scroll viewport as a `contentInset`, so the same
  centred child re-centres in the shrunken box and visibly moves. See §12.
- **Dialogs and sheets escape the keyboard by opting in per site**:
  `KeyboardAwareScrollView bottomOffset={10}` in dialogs
  (`Dialog/Dialog.tsx:11`, `62-70`), and `KeyboardAwareScrollView` wrapped with
  `Reanimated.createAnimatedComponent` inside gorhom's `createBottomSheetScrollableComponent`
  (`Sheet/BottomSheetAwareScrollview.tsx:1-34`).

---

## 2. The provider setup

`pocketpal-ai/App.tsx:95`:

```tsx
<KeyboardProvider statusBarTranslucent navigationBarTranslucent>
```

- Nesting order: `GestureHandlerRootView` → `SafeAreaProvider` → **`KeyboardProvider`** →
  `PaperProvider` → `L10nContext` → `MarkdownProvider` → `NavigationContainer` →
  `BottomSheetModalProvider` → drawer (`App.tsx:92-107`).
- The two flags are **Android-only** and exist because the app is translucent there; the
  prop docs say so explicitly (`lib/typescript/types/provider.d.ts:4-27`: "Set the value to
  `true`, if you use translucent status bar / navigation bar on Android"). 1.21.9 also
  offers `preserveEdgeToEdge`, `enabled`, and iOS-only `preload`
  (`types/provider.d.ts:28-56`) — **all available in 1.21.9**; PocketPal passes none of them.
- The Chat screen is additionally wrapped in `gestureHandlerRootHOC`
  (`App.tsx:130-134`).

**LiAI comparison:** `app/_layout.tsx:38` mounts a bare `<KeyboardProvider>` with no
props, and the comment at `app/_layout.tsx:39-46` explains why — the app is edge-to-edge
and the runtime logs *"statusBarTranslucent and navigationBarTranslucent values are
ignored when using react-native-edge-to-edge"*. That reasoning is LiAI-specific and, as
far as this pass could verify, sound: no native log capture was available here, so the
"unverified" caveat in §11 applies to the runtime message itself.

---

## 3. The occlusion derivation

`pocketpal-ai/src/components/ChatView/ChatView.tsx:411-426`, quoted in full because the
comment is the point:

```tsx
// ============ KEYBOARD ANIMATION SETUP ============
// Get real-time keyboard height from the keyboard controller
const keyboard = useReanimatedKeyboardAnimation();

// One reconciled "keyboard occlusion above the input" value. The library
// reports a negative `keyboard.height` while the keyboard is up; the IME
// inset already spans the navigation bar (KeyboardProvider is configured
// navigationBarTranslucent), so the space the keyboard actually steals from
// the chat surface is the IME inset minus the safe-area bottom inset. One
// expression, correct on every API level — there is no version fork (the
// API ≤ 29 under-reservation is handled by the clamp, not a branch). The
// input translate, the suggested-prompts overlay, and the inverted-list
// bottom spacer all derive from THIS value so they never disagree.
const keyboardOcclusion = useDerivedValue(() =>
  Math.max(0, Math.abs(keyboard.height.value) - insets.bottom),
);
```

Sign convention: **negative while up**, hence `Math.abs`. 1.21.9's type only says
`height: SharedValue<number>` (`lib/typescript/context.d.ts:21`) and does not document
the sign — the sign claim comes from PocketPal's code comment
(`ChatView.tsx:415-416`) and is corroborated independently by LiAI's own
`lib/keyboard.ts:11-18`, which records that a bare `-height.value` made the vision panel
*sink*. Two independent codebases, same observation; still not a doc-backed guarantee.

The `Math.max(0, …)` clamp is load-bearing, not defensive noise: it is what makes the
Android API ≤ 29 under-reservation a no-op instead of a platform branch
(`ChatView.tsx:420-421`).

---

## 4. What shares the transform vs what does not

Three consumers, all reading `keyboardOcclusion`:

| Consumer | Style | What it applies | Citation |
|---|---|---|---|
| Input container | `translateY: -occlusion` **+** `paddingBottom` | full input chrome | `ChatView.tsx:433-436` |
| Suggested-prompts overlay | `translateY: -occlusion` **only** | chips row | `ChatView.tsx:442-444` |
| Inverted-list bottom spacer | `height: occlusion` | `ListHeaderComponent` | `ChatView.tsx:962-964` |

The comments state the failure modes verbatim:

**Why one value, not several** (`ChatView.tsx:422-423`):
> "The input translate, the suggested-prompts overlay, and the inverted-list bottom
> spacer all derive from THIS value so they never disagree."

**Why the prompts overlay must not inherit `paddingBottom`** (`ChatView.tsx:438-441`):
> "Suggested-prompts overlay shares the input's keyboard translation but must NOT inherit
> paddingBottom (which the input uses to clear the home indicator). Applying it here
> would create a large empty gap between the chips and the input when the keyboard is
> closed."

**Why the list spacer must not use an "in-flight" gate** (`ChatView.tsx:955-961`):
> "Reads the SAME reconciled occlusion value as the input translate, so the two can never
> disagree, and holds while the keyboard is settled-open (it returns to 0 only when the
> keyboard closes, not while it merely stops moving — the previous in-flight gate dropped
> it too early on API ≤ 29)."

**What does NOT share the transform:** the message list itself, the header, and the
scroll-to-bottom button's *position* (the button's opacity is a separate
`withTiming` animation, `ChatView.tsx:487-490`).

**Honest finding — a dead branch in PocketPal.** `isKeyboardVisible` is a shared value
initialised `false` (`ChatView.tsx:429`) and read in the input style
(`ChatView.tsx:435`), but is **never written to `true` anywhere in the file** (grep for
`isKeyboardVisible` returns only lines 429 and 435). So `paddingBottom: insets.bottom` is
unconditionally applied, and the "only when keyboard is NOT visible" comment at
`ChatView.tsx:432` describes intended behaviour that does not occur. LiAI should not
reproduce this; LiAI's approach (§8) is cleaner.

---

## 5. The input / composer container structure

```
<View style={styles.container}>                 // flex:1                styles.ts:6-8
  <View style={styles.headerWrapper}>           // zIndex:100            styles.ts:85-87
    <ChatHeader />
  <Reanimated.View style={styles.chatContainer}>// flex:1, position:relative, zIndex:0  styles.ts:74-80
    <Reanimated.FlatList style={{marginBottom: bottomComponentHeight}} />  ChatView.tsx:1003
    <Reanimated.View style={[styles.inputContainer, inputContainerAnimatedStyle, …]}
       onLayout={onLayoutChatInput}>            // ← measures composer height  ChatView.tsx:1136-1143
      <BannerRow …/>
      <ChatInput chatInputHeight={chatInputHeight} … />
    </Reanimated.View>
    <Reanimated.View style={[styles.suggestedPromptsOverlay,
                             suggestedPromptsAnimatedStyle,
                             {bottom: chatInputHeight.height}]} />      ChatView.tsx:1180-1198
    {isPickerVisible && <ChatPalModelPickerSheet … />}                  ChatView.tsx:1206-1210
```

- **Positioning:** `position: absolute; bottom: 0; left: 0; right: 0; zIndex: 10` with
  rounded top corners and an upward shadow (`styles.ts:67-84`). Because the input is
  *out of flow*, the list must reserve its height — done with
  `style={{marginBottom: bottomComponentHeight}}` (`ChatView.tsx:1003`), **not** with a
  scroll inset.
- **Growing multiline input:** there is no `onContentSizeChange` anywhere. The input is
  just `multiline` (`src/components/ChatInput/ChatInput.tsx:472`); growth is picked up
  implicitly because the *container* re-lays-out and `useComponentSize`
  (`src/components/KeyboardAccessoryView/hooks/useComponentSize.tsx:10-21`) turns
  `onLayout` into `{height, width}` React state. Two `useComponentSize` instances exist:
  one for the whole `ChatView` (bubble width, `ChatView.tsx:350`) and one for the input
  (`ChatView.tsx:351-352`).
- **Safe-area inset:** applied as `paddingBottom` on the input container
  (`ChatView.tsx:435`), i.e. always, per the dead-branch caveat in §4. The same measured
  `chatInputHeight.height` is then reused for (a) the list's `marginBottom`
  (`ChatView.tsx:1003`), (b) the scroll-to-bottom button's `bottom`
  (`ChatView.tsx:1038-1041`), (c) the suggested-prompts overlay's `bottom`
  (`ChatView.tsx:1194`), and (d) the picker sheet's `contentContainerStyle.paddingBottom`
  (`src/components/ChatPalModelPickerSheet/ChatPalModelPickerSheet.tsx:331-332`,
  `paddingBottom: chatInputHeight + 66`). One measurement, four consumers — that
  fan-out is the pattern worth copying.

---

## 6. The message list

**Inverted, conditionally:** `inverted={chatMessages.length > 0}` (`ChatView.tsx:1004`).
When the list is empty it is *not* inverted, and the content container switches to
`justifyContent: 'center'` (`ChatView.tsx:993-996`) with `flexGrow: 1`
(`styles.ts:17-19`).

**Plain `Reanimated.FlatList`** — no `KeyboardChatScrollView`, no
`renderScrollComponent` (`ChatView.tsx:985-1029`).

| Prop | Value | Citation |
|---|---|---|
| `automaticallyAdjustContentInsets` | `false` | `ChatView.tsx:988` |
| `style` | `[{styles.flatList /* height:'100%' */}, {marginBottom: bottomComponentHeight}]` | `ChatView.tsx:1003`, `styles.ts:11-16` |
| `inverted` | `chatMessages.length > 0` | `ChatView.tsx:1004` |
| `keyboardDismissMode` | `Platform.OS === 'ios' ? 'interactive' : 'none'` | `ChatView.tsx:1014-1016` |
| `maintainVisibleContentPosition` | `{autoscrollToTopThreshold: 20, minIndexForVisible: 1}` while `isStreaming`, else `undefined` | `ChatView.tsx:1022-1028` |
| `onEndReachedThreshold` | `0.75` | `ChatView.tsx:1000` |
| `showsVerticalScrollIndicator` | `false` | `ChatView.tsx:1005` |

**Props PocketPal does NOT use**, all of which LiAI *does* use on
`KeyboardChatScrollView` (`MessageList.tsx:57-77`): `keyboardLiftBehavior`,
`extraContentPadding`, `blankSpace`, `freeze`, `onContentInsetChange`, `onEndVisible`,
`offset`. They do not exist in 1.19.6's `KeyboardChatScrollView` in this form — this is
the single largest structural divergence between the two apps, and it is a *LiAI
upgrade*, not a debt.

**Scroll-tracking shared values** (`ChatView.tsx:448-495`):

```tsx
const underflow = useSharedValue(true);
const atLatest = useSharedValue(true);

const STICK = 24;
const LEAVE = 40;
const EPS = 1;

const handleScroll = useAnimatedScrollHandler({
  onScroll: e => {
    const y = e.contentOffset.y;
    const Hc = e.contentSize?.height ?? 0;   // content height
    const Hv = e.layoutMeasurement?.height ?? 0; // viewport height
    const maxY = Math.max(0, Hc - Hv);

    // underflow: content can't actually scroll (flexGrow:1 makes Hc≈Hv)
    underflow.value = Hc <= Hv + EPS;

    // clamp to kill rubber-band noise
    const clampedY = Math.min(Math.max(y, 0), maxY);

    if (underflow.value) { atLatest.value = true; return; }
    if (atLatest.value)  { if (clampedY > LEAVE) atLatest.value = false; }
    else                 { if (clampedY < STICK) atLatest.value = true; }
  },
});

const hasHiddenContent = useDerivedValue(
  () => (!underflow.value && !atLatest.value ? 1 : 0));
const scrollToBottomAnimatedStyle = useAnimatedStyle(() => ({
  opacity: withTiming(hasHiddenContent.value, {duration: 160}),
  transform: [{translateY: withTiming(hasHiddenContent.value ? 0 : 8)}],
}));
```

Semantics:

| Value | Meaning |
|---|---|
| `underflow` | `true` when content is shorter than the viewport (`Hc <= Hv + 1`, courtesy of `flexGrow: 1` on the content container). While `true`, "at the end" is vacuously true. |
| `atLatest` | Whether the reader is parked on the newest turn. |
| `STICK = 24` | Hysteresis **return** threshold — you must scroll back within 24 px of the end to re-arm. |
| `LEAVE = 40` | Hysteresis **exit** threshold — you must scroll 40 px away before the button appears. |
| `EPS = 1` | Sub-pixel guard on the underflow test. |
| `hasHiddenContent` | `1` only when there *is* overflow **and** the reader is away from the end. |
| `translateY: 0 → 8` | 8 px slide used as a second, non-opacity channel so the button "arrives". |
| `opacity` duration | 160 ms. |

The asymmetry (`LEAVE 40` > `STICK 24`) is deliberate hysteresis: a single threshold makes
the button flicker during a slow drag. On an inverted list, the newest turn sits at
`contentOffset.y === 0`, so "jump to bottom" is
`scrollToOffset({animated: true, offset: 0})` (`ChatView.tsx:490-495`) — **not**
`scrollToEnd`.

---

## 7. Scroll-to-bottom affordance

`ChatView.tsx:1030-1055`:

```tsx
<Reanimated.View style={[scrollToBottomAnimatedStyle, { right: 8,
    bottom: bottomComponentHeight + 40 /* button height */ + 20 /* padding */ }]}>
  <KeyboardStickyView offset={{closed: 0, opened: insets.bottom}}>
    <TouchableOpacity style={styles.scrollToBottomButton} onPress={scrollToBottom}>
      <Icon name="chevron-down" size={20} color={theme.colors.onPrimary} />
    </TouchableOpacity>
  </KeyboardStickyView>
</Reanimated.View>
```

- It **is** inside a `KeyboardStickyView` — the only one in the codebase. It is *not*
  in a `KeyboardAvoidingView`.
- The button itself is `position: absolute; right: 16; width/height: 35; borderRadius: 20`
  with elevation 5 (`styles.ts:27-45`); note the parent's `right: 8` and the child's
  `right: 16` do not cancel — the effective right offset is 24.
- **Warning, do not copy verbatim:** `opened: insets.bottom`
  (`ChatView.tsx:1045`) adds a *positive* `translateY` when the keyboard is open, while
  `keyboardOcclusion` has already had `insets.bottom` subtracted (`ChatView.tsx:425`).
  As written this double-counts the inset and pushes the button toward the keyboard. It
  may be deliberate (`KeyboardStickyView` moves by the *full* keyboard height, and the
  parent already clears the composer, so `+insets.bottom` may be re-adding the home
  indicator the parent did not) — but the two accounting conventions are mixed in one
  expression and I could not determine the intent from the code. **Unverified.** LiAI
  should not adopt it; LiAI's jump-to-latest is an in-flow row, not an overlay (§9).

---

## 8. Empty / no-model state and suggested prompts

**Empty state** is the list's `ListEmptyComponent` (`ChatView.tsx:990`), rendered only
when `chatMessages.length === 0`, i.e. **inside the list**, and centred by the content
container's `justifyContent: 'center'` (`ChatView.tsx:993-996`).

`src/components/ChatEmptyPlaceholder/ChatEmptyPlaceholder.tsx`:

- Three states, chosen in order: (a) a pal's default model is downloading →
  "getting ready" copy, **no button** (lines 41-53); (b) `modelStore.availableModels.length === 0`
  → `noModelsTitle/Description/Button`, button navigates to the Models screen
  (lines 55-67); (c) otherwise → `activateModelTitle`, button calls `onSelectModel`,
  i.e. opens the in-chat picker sheet (lines 69-76).
- **Returns an empty `<View />` whenever a model is already active** (lines 78-80) —
  the placeholder is a *no-model* state, not an *empty-thread* state.
- **Positioning** (lines 85-88):
  ```tsx
  <View style={[styles.container, {marginBottom: bottomComponentHeight + 100}]}>
  ```
  A hard-coded lift of the composer's height plus 100 px. Not a flex box, not centred by
  the keyboard, no occlusion involvement at all — it simply sits high enough to clear the
  input. (Note the surrounding `justifyContent: 'center'` is on the list's content
  container, so `marginBottom` is a manual re-centre.)

**Suggested prompts** are a **sibling of the input container, absolutely positioned**,
not a list child (`ChatView.tsx:1180-1198`):

```tsx
{messages.length === 0 && !isStreaming &&
 modelStore.activeModelId !== undefined &&
 activePal?.greeting?.suggestedPrompts && activePal.greeting.suggestedPrompts.length > 0 ? (
  <Reanimated.View pointerEvents="box-none"
    style={[styles.suggestedPromptsOverlay, suggestedPromptsAnimatedStyle,
            {bottom: chatInputHeight.height}]}>
```

Render conditions, all four required: empty thread, not streaming, **a model is
active**, and the pal has prompts. `suggestedPromptsOverlay` is
`position: absolute; left/right: 0; zIndex: 9; backgroundColor: transparent`
(`styles.ts:54-60`) — the comment at `ChatView.tsx:1180-1182` explains it is a sibling
specifically so it does not share the input's background and rounded top.

---

## 9. Safe-area / bottom-inset ownership

- **PocketPal's chat screen applies `insets.bottom` in exactly one place**: the input
  container's `paddingBottom` (`ChatView.tsx:435`). `useSafeAreaInsets()` is called once
  at `ChatView.tsx:245`.
- `src/screens/ChatScreen/ChatScreen.tsx` (the route) contains **no** `SafeAreaView`,
  no `useSafeAreaInsets`, and no keyboard-controller code at all — verified by grep; the
  screen is a thin pass-through to `<ChatView>`.
- The other `useSafeAreaInsets` consumer is the shared sheet
  (`src/components/Sheet/Sheet.tsx:52`), and it uses `insets.top` only
  (`Sheet.tsx:79`, `88`) for `snapPoints`.
- **No double-application found in the chat path.** The dialog path uses
  `KeyboardAwareScrollView bottomOffset={10}` and Paper's own `ScrollArea`
  (`Dialog/Dialog.tsx:62-70`) — the inset bookkeeping there is Paper's.

---

## 10. Dialogs, sheets and other inputs

Two files, and they are the entire non-chat strategy:

**Dialogs** (`src/components/Dialog/Dialog.tsx`):
- `KeyboardAwareScrollView` imported at line 11.
- Opt-in per dialog via an `avoidKeyboard` prop (line 39), default `false`.
- Scrollable + `avoidKeyboard`: `KeyboardAwareScrollView bottomOffset={10} … keyboardShouldPersistTaps="handled"`
  (lines 63-70). Not scrollable + `avoidKeyboard`: a bare `<KeyboardAwareScrollView>`
  (lines 89-91).
- Without `avoidKeyboard`, the non-scrollable branch still wraps content in
  `TouchableWithoutFeedback onPress={Keyboard.dismiss}` (lines 84-91) — RN's
  `Keyboard.dismiss`, not the library's.
- Several props are commented out: `//keyboardDismissMode="on-drag"`, `//bounces={false}`
  (lines 68, 69) — deliberate restraint, not an oversight.

**Bottom sheets** (`src/components/Sheet/BottomSheetAwareScrollview.tsx:1-34`): the whole
file exists to compose two libraries —

```tsx
const AnimatedScrollView =
  Reanimated.createAnimatedComponent<KeyboardAwareScrollViewProps>(KeyboardAwareScrollView);
const BottomSheetScrollViewComponent = createBottomSheetScrollableComponent<…>(
  SCROLLABLE_TYPE.SCROLLVIEW, AnimatedScrollView);
```

…then `memo`'d and re-exported as `Sheet.ScrollView` (`Sheet.tsx:33`, `127`). The
`Reanimated.createAnimatedComponent` wrapper is the load-bearing bit: gorhom's
`createBottomSheetScrollableComponent` needs an animated scroll view to drive
`scrollTo`, and the library's plain `KeyboardAwareScrollView` is not one.

**Chat-scoped sheet workaround** (`ChatView.tsx:1206-1210`):
> "Conditionally render the sheet to avoid keyboard issues. It makes the disappearing
> sudden, but it's better than the keyboard issue."

The model/pal picker is mounted only while `isPickerVisible` — not merely hidden.

---

## 11. Documented pitfalls and workarounds

From PocketPal's own comments:

| Pitfall | Workaround | Citation |
|---|---|---|
| Android API ≤ 29 under-reserves the IME inset | `Math.max(0, …)` clamp, deliberately **no** platform version branch | `ChatView.tsx:418-421` |
| An "in-flight" gate on the list spacer dropped it too early on API ≤ 29 | Drive the spacer from the settled `keyboardOcclusion`, not from a transient flag | `ChatView.tsx:957-961` |
| `paddingBottom` inherited by the prompts overlay created a large empty gap when closed | Split the two animated styles; translate-only for the overlay | `ChatView.tsx:438-441` |
| `keyboardDismissMode="interactive"` on Android makes a drag forcibly close the keyboard, so the user can never scroll to reveal hidden content | `"interactive"` on iOS, `"none"` on Android; tap-to-dismiss preserved via `Keyboard.dismiss()` on send | `ChatView.tsx:1008-1016`, `523` |
| A MobX observer re-rendering per token made the `renderListHeaderComponent` useCallback change identity every ~50 ms, unmounting and remounting the header and killing `Animated.loop` + `setInterval` | Extract a tiny `observer` subtree (`PendingIndicatorView`) so only it re-renders | `ChatView.tsx:181-199` |
| Bottom sheet + keyboard fight | Unmount the sheet instead of animating it out | `ChatView.tsx:1206-1207` |

From the upstream docs (`main`, 1.22+ prose) — these are *not* verified against 1.21.9
runtime, only against the installed `.d.ts` for the APIs they mention:

| Pitfall (docs `main`) | Fix | API status in 1.21.9 |
|---|---|---|
| De-synchronised keyboard animation on Android/Fabric | Reanimated `staticFeatureFlags.USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS`; **on by default on Reanimated ≥ 4.3.0** | N/A (a Reanimated flag; LiAI is on `react-native-reanimated@4.5.1` per `package.json:40`, so already covered) |
| Missing iOS animations (new arch) when React state updates land right before a keyboard event | Reanimated `DISABLE_COMMIT_PAUSING_MECHANISM` flag | N/A (Reanimated flag) |
| `FlatList.scrollToEnd()` stops short of the real end while the keyboard is open, because RN computes it from `visibleLength` without keyboard-adjusted layout | Call `scrollToEnd` on the underlying `KeyboardChatScrollView` via a second, forwarded ref | `KeyboardChatScrollView` ref **is** `Reanimated.ScrollView` in 1.21.9 (`components/KeyboardChatScrollView/index.d.ts`) — implementable; the *type alias* `KeyboardChatScrollViewRef` is **not** exported in 1.21.9 |
| iOS RN 0.81+ `contentInset` hit-test bug makes the `blankSpace` area unscrollable | `applyWorkaroundForContentInsetHitTestBug` (method swizzling, "inherently fragile") or an RN patch | **available in 1.21.9** (`components/KeyboardChatScrollView/types.d.ts`) — LiAI uses `blankSpace` and does **not** set this |

---

## 12. Differences from LiAI

> **Updated after the research pass.** The LiAI column originally described the
> pre-`f3df301`/composer-collapse code. Rows touching the composer's structure,
> its lift and its measurement were corrected once the collapse landed, and one
> row (sign handling) records a finding that turned out to be a **bug in ours**,
> not parity. The PocketPal column is unchanged from the original pass. LiAI
> line references below were spot-checked after the update; the pre-update
> research pass verified all of them, and rows outside the corrected set still
> carry their original, verified references.

| Concern | PocketPal (verified) | LiAI (verified) | Gap |
|---|---|---|---|
| Provider | `<KeyboardProvider statusBarTranslucent navigationBarTranslucent>` inside `SafeAreaProvider`, above the navigator — `App.tsx:95` | bare `<KeyboardProvider>`, no props — `app/_layout.tsx:38` | None; LiAI's edge-to-edge reasoning is app-specific and documented at `app/_layout.tsx:39-46` |
| Occlusion value | `useDerivedValue` inline in the component — `ChatView.tsx:424-426` | pure worklet `keyboardOcclusion()` in `lib/keyboard.ts`, consumed through the single hook `useKeyboardLift()` in `hooks/useKeyboardLift.ts`, used by chat **and** vision | **LiAI is better** — one module, one hook, two screens, unit-testable; enforced by a guard allowing exactly one reader of `keyboard.height` |
| Sign handling | `Math.abs` + `-insets.bottom` + `Math.max(0, …)` — `ChatView.tsx:425` | `Math.abs` + `-anchor` + `Math.max(0, …)` — `lib/keyboard.ts:45`. The composer is anchored at `bottom: 0` so it passes **no** anchor and rises by the **full** height; the vision panel is anchored at `insets.bottom` and does subtract | **LiAI is better, and this corrects a real bug.** PocketPal's own composer is `bottom: 0` (`styles.ts:67-84`) yet still deducts `insets.bottom`, which under-lifts it by the navigation bar height. LiAI copied that formula and inherited the bug — it is the reported "the chat input is not above the keyboard". Every component in the library itself lifts by the full height (`KeyboardStickyView` is `translateY: height.value + offset`; the native `EdgeToEdgeReactViewGroup` suppresses its own bottom padding to avoid double-spacing), so the anchor parameter — not a blanket subtraction — is the correct model |
| List component | plain `Reanimated.FlatList`, `inverted` — `ChatView.tsx:985-1029` | `KeyboardChatScrollView` via `renderScrollComponent` — `MessageList.tsx:55-77` | **LiAI is better** — lift behaviour, `extraContentPadding`, `blankSpace`, `onEndVisible` are 1.21.9 APIs |
| `inverted` | conditional on message count — `ChatView.tsx:1004` | never inverted; non-inverted, so `scrollToEnd` is the jump target — `MessageList.tsx:80-93` | Different, deliberate |
| Lift behaviour | n/a | `keyboardLiftBehavior="whenAtEnd"` — `MessageList.tsx:68` | LiAI-only; **available in 1.21.9** |
| Dismiss mode | `ios ? 'interactive' : 'none'` — `ChatView.tsx:1014-1016` | `"interactive"` unconditionally — `MessageList.tsx:69` | **Gap.** LiAI reproduces the Android failure mode PocketPal explicitly avoids. The same comment also implies the fix is iOS-gated. |
| Composer height source | `onLayout` on the **whole input container** (banners + input + chrome) — `ChatView.tsx:1139` fed to `useComponentSize` | `onLayout` on the field, which is the outermost element and owns the in-flow rows above the control row: the voice/attach issue lines and the attach preview | **Parity, and the original gap is closed.** The banners are deliberately NOT counted — they are overlays over the list, and reserving for them would reflow the list every time a chip appeared. The split criterion is in-flow vs overlay, not persistence: the issue lines are transient and still belong inside, because a row the field owns is what the measured height can honestly reserve |
| Composer positioning | absolutely positioned `bottom: 0`, `zIndex: 10`, list compensated by `marginBottom` — `styles.ts:67-84`, `ChatView.tsx:1003` | absolutely positioned `bottom: 0` and lifting itself via `useKeyboardLift()`; list compensated by `extraContentPadding` | **Divergence: the field IS the composer.** PocketPal's input sits in a Cool Paper bar with a 1px Hairline top border; LiAI's is full-bleed — Clean White, radius 0, top border only, no gutter, value 16px from the edge. This required amending `DESIGN.md` in five places (field spec, radius scale, gutters, card border, the composer paragraph), because the two documents had made the bar and the field two separate, separately-specified elements. Recorded as a divergence, not a win: it breaks the rule that inputs are Default-radius inset cards |
| Suggested prompts | absolute sibling, `bottom: chatInputHeight.height`, translate-only — `ChatView.tsx:1180-1198` | an overlay above the field, rising on the same hook | Equivalent, and it needs no second positioning scheme |
| No-model message in a conversation | **none** — `ModelNotLoadedMessage` is dead code with zero importers. The affordances are the input placeholder ("Model not loaded. Please initialize the model.") and a transient "Load a model first" chip after a blocked send | same pair, with the strings taken verbatim from PocketPal, plus a tappable **Load a model** chip on field focus | **Parity, plus one addition.** LiAI previously had a persistent "Load a model to keep chatting" banner with a Go to Models button. It was removed because it was the one overlay that persisted for a whole conversation — unload a model mid-thread and it sat over live content, covering the newest message permanently, and it was the only thing asking the list to reserve space for something floating over it. The chip keeps the affordance without the reservation |
| Empty / no-model | `ListEmptyComponent` + `marginBottom: bottomComponentHeight + 100`; returns empty `<View/>` when a model is active — `ChatEmptyPlaceholder.tsx:78-88` | an **overlay beside the list**, lifted by the **measured** composer height | **Deliberately NOT `ListEmptyComponent`, and this is a divergence LiAI had to make.** PocketPal's list is a plain `Reanimated.FlatList` that adds no keyboard inset, so their centred-then-offset empty state is stable. `KeyboardChatScrollView` adds the keyboard height to the scroll viewport as a dynamic `contentInset` (`ScrollViewWithBottomPadding`: `dynamic.bottom = bottomPadding.value`), applied on every Android keyboard open regardless of `keyboardLiftBehavior` — a centred `flex-1` child inside that inset re-centres in the shrunken box, so it visibly moved. LiAI also measures the lift rather than hard-coding `+100`. Guarded in `tests/keyboard-avoidance.test.ts` |
| Jump-to-latest | absolute FAB in a `KeyboardStickyView`, Reanimated `withTiming` opacity, 8 px slide — `ChatView.tsx:1030-1055`, `487-490` | absolute overlay above the composer, lifting on the same hook, gated on `!atEnd` fed by `onEndVisible` | **LiAI is better** — `onEndVisible` fires in both directions and is the same signal `whenAtEnd` uses; no manual `underflow`/`atLatest`/`STICK`/`LEAVE` needed, and no separate `KeyboardStickyView` to keep in sync |
| Bottom inset owner | input container `paddingBottom` — `ChatView.tsx:435` | the tab bar: `paddingBottom: insets.bottom` on the router `tabBar` — `(tabs)/_layout.tsx:47`; screen uses `edges={['top','left','right']}` — `ChatScreen.tsx:162`, and the single-owner rule is enforced by a guard in `tests/keyboard-avoidance.test.ts` | Different owner, both single-owner. LiAI's is correct for a tab bar |
| Tab bar while keyboard is up | n/a (no tabs) | hidden via `useKeyboardState(s => s.isVisible)` — `(tabs)/_layout.tsx:41` | LiAI-only; **available in 1.21.9** |
| Dialogs / sheets | `KeyboardAwareScrollView` opt-in per dialog; gorhom scroll component wrapped in `createAnimatedComponent` — `Dialog.tsx:11,62-70,89-91`; `BottomSheetAwareScrollview.tsx:1-34` | @expo/ui `BottomSheet`; not audited by this pass | **Unverified** — needs a separate pass |
| `KeyboardGestureArea` | not used (1.19.6 predates it) | not used, and the dead `CHAT_INPUT_ID` / `nativeID` plumbing that fed it has been deleted | **Closed.** The first pass flagged that plumbing as dead code promising a consumer that does not exist in 1.21.9; it is gone |
| `KeyboardStickyView` | wraps the jump-to-latest FAB only — `ChatView.tsx:1045` | unused; the composer and the jump overlay call `useKeyboardLift()` instead | Deliberate. It applies `translateY: height.value + offset` and nothing else, which is exactly what the hook does, so wrapping adds a component without adding behaviour |
| `KeyboardAvoidingView` | unused | unused (deliberate, `ChatScreen.tsx:128-131`) | None |
| `freeze` | n/a | unused | **Gap (opportunity).** `freeze` exists in 1.21.9 and is exactly the "dismiss the keyboard to open a sheet" case |

---

## 13. Copyable now

Priority order. Every row states whether it needs an API that exists in **1.21.9**.

| # | Change | File | Justified by | 1.21.9? |
|---|---|---|---|---|
| 1 | **Move `onLayout={onHeightChange}` from the field row to the composer wrapper** (the `<View className="border-t … px-5 pt-2">` at `ChatInput.tsx:208`), so `extraContentPadding` covers the border, `pt-2`/`mb-3`, the attach preview and the issue lines. Today the list under-reserves by all of that whenever a warning or preview is showing. | `components/chat/ChatInput.tsx:252` → `:208` | `ChatView.tsx:1139` measures the whole input container, not the field | ✅ yes — no new API |
| 2 | **Gate `keyboardDismissMode` per platform**: `"interactive"` on iOS, `"none"` on Android. | `components/chat/MessageList.tsx:69` | `ChatView.tsx:1008-1016`: on Android `"interactive"` "makes a drag forcibly close the keyboard as the only outcome, so the user can never scroll the list to reveal content the keyboard is hiding" | ✅ yes — plain RN prop |
| 3 | **Delete the dead `CHAT_INPUT_ID` / `nativeID` plumbing** (`ChatScreen.tsx:61-62`, `:399`, `ChatInput.tsx:48-49`, `:294`) or annotate it as reserved-for-1.22. Nothing consumes it. | `ChatScreen.tsx`, `ChatInput.tsx` | `KeyboardGestureArea` is **NOT in 1.21.9** (no export in `lib/typescript/index.d.ts`; only an unused native spec) | ✅ yes — deletion only |
| 4 | **Pass `freeze` while a bottom sheet/modal is open** so dismissing the keyboard to reveal a sheet does not shift the chat content. | `MessageList.tsx:57-77` + the sheet call sites | 1.21.9 `KeyboardChatScrollView` `freeze?: boolean \| SharedValue<boolean>`; docs: "useful when dismissing the keyboard to open a bottom sheet" | ✅ yes |
| 5 | **Call `scrollToEnd` on the `KeyboardChatScrollView` ref, not the `FlatList` ref**, for the jump-to-latest button and the follow-the-conversation effect. RN's `FlatList.scrollToEnd` computes the offset from `visibleLength` without keyboard-adjusted layout and "may stop short of the actual end when the keyboard is visible". Needs a `forwardRef` wrapper that keeps a second ref to the scroll component. | `MessageList.tsx:55-77`, `:86-91`, `ChatScreen.tsx:384` | upstream docs `main`, troubleshooting §`scrollToEnd` | ✅ yes — the ref is `Reanimated.ScrollView` in 1.21.9. The `KeyboardChatScrollViewRef` *type* is not exported in 1.21.9; type the wrapper ref as `Reanimated.ScrollView` |
| 6 | **Consider `applyWorkaroundForContentInsetHitTestBug`** if the `blankSpace` area turns out unscrollable on iOS + RN 0.81+. | `MessageList.tsx:57-77` | 1.21.9 prop; docs flag it as ObjC swizzling, "inherently fragile" | ✅ yes, but **opt-in only after reproducing the bug** — do not pre-enable |
| 7 | **Unmount (or `freeze`) the attach-picker popover and any sheet before the keyboard opens**; the popover at `ChatInput.tsx:262-280` is a sibling of the composer and is already hidden behind the keyboard translate. | `ChatInput.tsx` | `ChatView.tsx:1206-1207`: "Conditionally render the sheet to avoid keyboard issues… better than the keyboard issue" | ✅ yes |
| 8 | **Blocked:** make the composer track an interactive drag dismissal (input follows the finger, `KeyboardGestureArea` + `offset.bottom`). | — | — | ❌ **NOT in 1.21.9 (main only).** Unblock by upgrading to ≥ 1.22 |

**Explicitly do not copy from PocketPal:**

- `offset={{closed: 0, opened: insets.bottom}}` on the jump-to-latest
  `KeyboardStickyView` (`ChatView.tsx:1045`) — mixes the raw-keyboard-height and
  occlusion-minus-inset accounting conventions in one expression; intent unverified.
- The `isKeyboardVisible` shared value that is never written (`ChatView.tsx:429`, `435`) —
  dead branch, silently means "always apply the bottom inset".
- `marginBottom: bottomComponentHeight + 100` on the empty state
  (`ChatEmptyPlaceholder.tsx:86`) — magic number; LiAI's padded-centre approach is better.
- The manual `underflow` / `atLatest` / `STICK` / `LEAVE` scroll tracker
  (`ChatView.tsx:448-478`) — `onEndVisible` supersedes it in 1.21.9.
- `statusBarTranslucent navigationBarTranslucent` (`App.tsx:95`) — dead props under
  edge-to-edge; LiAI's `app/_layout.tsx:39-46` already documents why.

---

## 14. Unverified

- The sign of `keyboard.height` (negative while up) is asserted by two codebases
  (`ChatView.tsx:415-416`, `lib/keyboard.ts:11-18`) but is **not** stated in the 1.21.9
  `.d.ts` (`context.d.ts:21` is just `SharedValue<number>`). No runtime measurement was
  performed.
- The `opened: insets.bottom` intent in `ChatView.tsx:1045` (§7).
- The edge-to-edge runtime warning quoted in `app/_layout.tsx:41-43` was not captured.
- LiAI's dialogs / bottom sheets (`@expo/ui` `BottomSheet`, `Host`) were not audited for
  keyboard behaviour; only the "not audited" fact is asserted (§12).
- The three upstream-docs pitfalls in §11 (commit-hook flag, commit-pausing flag,
  `scrollToEnd`) are documented on `main`; only the *APIs they reference* were verified
  against 1.21.9. The behavioural claims are **unverified at runtime**.
