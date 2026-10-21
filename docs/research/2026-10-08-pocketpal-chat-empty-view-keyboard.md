# Research: why does LiAI's chat empty view shift when the keyboard opens, while PocketPal's does not move at all?

Date: 2026-10-08
Status: READ-ONLY research pass; no app code was modified.
Scope: both apps' actual code — `pocketpal-ai/` (vendored reference) and the LiAI root app.
Companion documents:
- `docs/specs/2026-09-27-pocketpal-keyboard-ui-parity.md` (broader keyboard parity spec; some of its
  line references predate the current tree — all line numbers below were re-verified against the
  working tree).
- `tests/keyboard-avoidance.test.ts` (LiAI's source-scan guard; it encodes the intended behavior
  described here).

---

## 1. The question

PocketPal's chat screen shows its empty/no-model placeholder inside the message list. Open the
keyboard and it does not move a pixel — the keyboard simply covers it. LiAI's chat empty view has
historically shifted when the keyboard opens (the reported symptoms: *"no models available section
moves when the keyboard shows up"* and *"the no-model card looked like it moved when the keyboard
opened"* — `tests/keyboard-avoidance.test.ts:123`, `:141-149`). Why does one move and the other
doesn't, and what would it take for LiAI to match?

## 2. Answer in one paragraph

Neither app resizes its window for the keyboard, and **neither app feeds keyboard height into the
empty view's layout box** — that is why PocketPal cannot move: on the keyboard path, every
keyboard-driven change in its chat tree is either a `translateY` on *other* elements (input,
suggested prompts, scroll-to-bottom button) or a spacer height that only exists when messages
exist; the empty state's centring box is a function of the composer height alone. LiAI's empty view
moved because, in its earlier designs, **keyboard state leaked into the centring box's geometry**
by two routes: (1) the placeholder was a `ListEmptyComponent` inside `KeyboardChatScrollView`, which
applies the keyboard height as a dynamic `contentInset`, so a centred `flex-1` child re-centred in
a shrunken box; and (2) LiAI's custom tab bar unmounts while the keyboard is up, so the content
column — the placeholder's centring box — *grows* by the bar's height, sliding a vertically centred
child down by half of it (made worse at the time by three disagreeing copies of the bar height:
60 in code, 64 in prose, 75 actual → ~7.5 px residual drift). PocketPal has route (2) **structurally
absent** — it has no bottom tab bar at all — and route (1) **by choice** — its list is a plain
`Reanimated.FlatList` that adds no keyboard inset. In LiAI's *current* tree both routes are closed
(placeholder moved out of the list into an overlay; the tab-bar growth is compensated exactly);
what remains is the compensation's dependence on one device-verified constant.

---

## 3. PocketPal's mechanism (quoted, cited)

### 3.1 Outermost component tree of the chat screen

The route is a thin pass-through — no `SafeAreaView`, no `useSafeAreaInsets`, no keyboard code
(`pocketpal-ai/src/screens/ChatScreen/ChatScreen.tsx`, verified by full read; `<ChatView` at
`ChatScreen.tsx:259`). The whole layout lives in `ChatView`:

```tsx
// pocketpal-ai/src/components/ChatView/ChatView.tsx
1123:      <UserContext.Provider value={user}>
1124:        <View style={[styles.container, ...]} onLayout={onLayout}>       // flex:1          (styles.ts:6-8)
             ...
1133:          <Reanimated.View style={styles.chatContainer}>                // flex:1, position:relative, zIndex:0  (styles.ts:70-73)
                  {customContent}
                  {renderChatList()}                                          // list block, ChatView.tsx:981-1060
                  <Reanimated.View onLayout={onLayoutChatInput}              // ChatView.tsx:1138-1148
                    style={[styles.inputContainer,                           // absolute; bottom:0; left/right:0; zIndex:10  (styles.ts:56-68)
                            inputContainerAnimatedStyle, ...]}>
                    <BannerRow ... />
                    <ChatInput ... />
                  </Reanimated.View>
                  {…suggested-prompts overlay…}                               // absolute sibling, ChatView.tsx:1183-1198
```

What wraps the message list: `styles.chatContainer` (`flex: 1; position: relative`,
`pocketpal-ai/src/components/ChatView/styles.ts:70-73`) inside `styles.container` (`flex: 1`,
`styles.ts:6-8`). Nothing else — **no `KeyboardAvoidingView` anywhere in the chat tree** (repo-wide
grep for `KeyboardAvoidingView` in `pocketpal-ai/`: 0 hits).

What wraps the empty state: the **FlatList itself**. The placeholder is the list's
`ListEmptyComponent`:

```tsx
// pocketpal-ai/src/components/ChatView/ChatView.tsx
912:    const renderListEmptyComponent = React.useCallback(() => {
          …
927:          <ChatEmptyPlaceholder
928:            bottomComponentHeight={bottomComponentHeight}
929:            onSelectModel={() => setIsPickerVisible(true)}
930:          />
…
998:              ListEmptyComponent={renderListEmptyComponent}
```

### 3.2 Keyboard handling — no KeyboardAvoidingView; translate-only

Grep `KeyboardAvoidingView|keyboardVerticalOffset|KeyboardAware|react-native-keyboard-controller|
useKeyboardHandler|keyboardHeight|isOpen` over `pocketpal-ai/src`, hits that touch the chat screen:

| Hit | What it does | Citation |
|---|---|---|
| `KeyboardStickyView`, `useReanimatedKeyboardAnimation` imports | the ONLY keyboard-controller imports in ChatView | `ChatView.tsx:23-26` |
| `const keyboard = useReanimatedKeyboardAnimation()` | raw animated keyboard height | `ChatView.tsx:413` |
| `const keyboardOcclusion = useDerivedValue(() => Math.max(0, Math.abs(keyboard.height.value) - insets.bottom))` | one reconciled value; comment: *"The input translate, the suggested-prompts overlay, and the inverted-list bottom spacer all derive from THIS value so they never disagree"* | `ChatView.tsx:415-426` |
| `transform: [{translateY: -keyboardOcclusion.value}]` + `paddingBottom: isKeyboardVisible.value ? 0 : insets.bottom` | **input container only** | `ChatView.tsx:433-436` |
| `transform: [{translateY: -keyboardOcclusion.value}]` | **suggested-prompts overlay only** (translate, no padding) | `ChatView.tsx:442-444` |
| `height: keyboardOcclusion.value` on the list's `ListHeaderComponent` spacer | the list's keyboard spacer — **gated**: `{chatMessages.length > 0 && <Reanimated.View style={headerStyle} />}` — it does **not** exist when the list is empty | `ChatView.tsx:962-964`, gate at `:974` |
| `<KeyboardStickyView offset={{closed: 0, opened: insets.bottom}}>` | wraps the scroll-to-bottom button only | `ChatView.tsx:1045` |
| `KeyboardProvider statusBarTranslucent navigationBarTranslucent` at the app root | provider setup | `pocketpal-ai/App.tsx:119` |
| `useKeyboardDimensions` / `keyboardHeight` in `KeyboardAccessoryView` | composer height tracking, not avoidance of the list | `components/KeyboardAccessoryView/index.tsx:45-101`, `hooks/useKeyboardDimensions.tsx:45` |

**Does PocketPal use a KeyboardAvoidingView?** No — 0 hits repo-wide. Its chat avoidance is
entirely: *absolute-positioned input + `translateY`*, plus one `KeyboardStickyView` on the
scroll-to-bottom button.

### 3.3 The empty view's full layout

```tsx
// pocketpal-ai/src/components/ChatEmptyPlaceholder/ChatEmptyPlaceholder.tsx
19:    if (activeModelId) return null;                    // no-model state only
       …
84:    return (
85:      <View style={[styles.container, {marginBottom: bottomComponentHeight + 100}]}>
86:        <Image source={require('../../assets/pocketpal-dark-v2.png')} … />
```

```ts
// pocketpal-ai/src/components/ChatEmptyPlaceholder/styles.ts:6-12
container: { flex: 1, justifyContent: 'center', alignItems: 'center',
             paddingHorizontal: 32, gap: theme.spacing.default },
```

Positioning: **not absolute, not keyboard-aware** — a `flex: 1` centred child inside the list's
content container, which is itself centred when empty:

```ts
// pocketpal-ai/src/components/ChatView/styles.ts
9:    flatList: { height: '100%' },
13:   flatListContentContainer: { flexGrow: 1 },
```

```tsx
// pocketpal-ai/src/components/ChatView/ChatView.tsx
989:              contentContainerStyle={[
990:                styles.flatListContentContainer,
993:                justifyContent:
994:                  chatMessages.length !== 0 ? undefined : 'center',   // centred only when empty
996:              ]}
1003:              style={[styles.flatList, {marginBottom: bottomComponentHeight}]}
1008:              inverted={chatMessages.length > 0}             // NOT inverted when empty
```

Around it: the header (`styles.headerWrapper`, `ChatView.tsx:1128-1130`, `styles.ts:85-87`), the
chat container, and — outside the flow — the absolute input container. The list's bottom edge is
`marginBottom: bottomComponentHeight` (the measured input height, `ChatView.tsx:1003`), i.e. a
**composer-height** reservation, never a keyboard-height one.

### 3.4 How the message list reacts to the keyboard: it doesn't

| Prop | PocketPal chat FlatList | Citation |
|---|---|---|
| `automaticallyAdjustContentInsets` | **`false`** (explicitly disabled) | `ChatView.tsx:988` |
| `automaticallyAdjustKeyboardInsets` | **not set — 0 hits anywhere in `pocketpal-ai/`** (RN default: `false`) | repo grep |
| `contentInset` | **not set — 0 hits in `pocketpal-ai/`** | repo grep |
| `keyboardShouldPersistTaps` | **not set on the chat list** (only dialogs/sheets: `Dialog.tsx:69,78`, `SearchableSelectSheet.tsx:130`, `EnhancedSearchBar.tsx:224`, `ModelsScreen.tsx:400`, `SettingsScreen.tsx:367`) | grep |
| `keyboardDismissMode` | iOS `"interactive"`, Android `"none"` — a gesture prop, no layout effect | `ChatView.tsx:1015-1017` |
| `renderScrollComponent` | **none** — plain `Reanimated.FlatList` | `ChatView.tsx:987` |
| `scrollToOffset` | only (a) jump-to-bottom (`ChatView.tsx:494`) and (b) auto-scroll on a new user message (`ChatView.tsx:551`) — **never driven by keyboard events** | grep |

When the keyboard opens on PocketPal's empty chat, the set of things that change is exactly:
input container `translateY` (`ChatView.tsx:434`), suggested prompts `translateY` if rendered
(`ChatView.tsx:442-444`, render at `:1183-1198` — moves **by design**, and LiAI's
`SuggestedPrompts` does the same via `composerLift`, `app/(drawer)/(tabs)/chat.tsx:667,705`), and
the scroll-to-bottom button (`KeyboardStickyView`, `ChatView.tsx:1045` — not rendered on an empty
list). **The list's viewport, its `marginBottom`, and the placeholder's centring box are untouched.**

### 3.5 Does PocketPal rely on default platform behavior?

**Not on iOS's automatic ScrollView keyboard avoidance — explicitly not.** Evidence:
`automaticallyAdjustContentInsets={false}` (`ChatView.tsx:988`) switches RN's automatic adjustment
*off*, and `automaticallyAdjustKeyboardInsets` (the iOS ScrollView prop, default `false`) appears
nowhere in the repo (0 grep hits). There is no iOS-specific avoidance code on the chat screen at all.

**What it relies on is the keyboard overlaying the UI without the window resizing:**
- iOS: React Native does not resize the window for the keyboard; avoidance requires a
  `KeyboardAvoidingView` or scroll-view insets — both explicitly absent/disabled above.
- Android: PocketPal targets SDK 36 (`pocketpal-ai/android/build.gradle:6`) with
  `android:windowSoftInputMode="adjustResize"` in the manifest
  (`pocketpal-ai/android/app/src/main/AndroidManifest.xml:42`), but at targetSdk 35+ Android 15
  enforces edge-to-edge and the window no longer shrinks — the same platform fact LiAI's test file
  states for itself: *"the app is edge-to-edge on Android (targetSdk 36, expo edgeToEdgeEnabled),
  so softwareKeyboardLayoutMode 'resize' no longer shrinks the window and the app draws behind the
  keyboard"* (`tests/keyboard-avoidance.test.ts:4-9`). Both apps also wrap everything in
  `KeyboardProvider` (`pocketpal-ai/App.tsx:119`, `app/_layout.tsx:81`), whose Android view sets
  `setDecorFitsSystemWindows(window, false)`
  (`node_modules/react-native-keyboard-controller/android/.../EdgeToEdgeReactViewGroup.kt:146-154`)
  and suppresses its own IME bottom padding while active (`EdgeToEdgeReactViewGroup.kt:113-117`).

**Honest caveat:** on a device where the window *does* resize for the keyboard (older-Android
`adjustResize` environments), PocketPal's centred `ListEmptyComponent` would re-centre and move
too — it is not immune by construction against window resize, it is immune against *code* that
feeds keyboard height into its box. The observed "does not move at all" is consistent with a
no-resize environment (iOS, or Android 15+ edge-to-edge).

---

## 4. LiAI's mechanism (quoted, cited)

### 4.1 The outer tree of `app/(drawer)/(tabs)/chat.tsx`

```tsx
// app/(drawer)/(tabs)/chat.tsx
429:    <SafeAreaView
430:      edges={["top", "left", "right"]}
431:      style={{ flex: 1, backgroundColor: colors.base }}
        …
          {/* 56px header */}  <View className="h-14 flex-row …">  …
        …
559:      <View className="flex-1">                        {/* the content column */}
560:        <View className="flex-1" onLayout={…setListHeight…}>
564:          <MessageList … />                            {/* KeyboardChatScrollView-backed */}
            </View>
608:        {showPlaceholder && (
609:          <View
610:            className="absolute inset-x-0 top-0"
611:            style={{ bottom: composerHeight + tabBarCompensation }}
612:            pointerEvents="box-none"
613:          >
614:            <ChatEmptyPlaceholder />
615:          </View>
616:        )}
          …jump-to-latest overlay (same compensation, :624-627)…
        </View>
650:      <MessageInput
651:        className="absolute inset-x-0 bottom-0"          {/* the composer, lifts itself */}
```

- **No `KeyboardAvoidingView`** — stated in code (*"No KeyboardAvoidingView on this screen"*,
  `chat.tsx:387-392`) and enforced by test (`tests/keyboard-avoidance.test.ts:109`).
- The placeholder mounts **beside the list, as an absolute overlay**, gated by
  `const showPlaceholder = !ready && emptyState` (`chat.tsx:223`).
- The screen's own comment records the design intent: *"the content column (list + empty state):
  never moves. The keyboard covers what it covers, and nothing re-centres"* (`chat.tsx:540-557`),
  and *"a ListEmptyComponent would sit inside the keyboard's contentInset and visibly re-centre as
  the keyboard rose"* (`chat.tsx:604-607`).

### 4.2 What `react-native-keyboard-controller` is actually used for in LiAI

| API | Where | Role |
|---|---|---|
| `KeyboardProvider` | `app/_layout.tsx:12,81-97` | app-root provider, no props |
| `useKeyboardState(s => s.isVisible)` | `app/(drawer)/(tabs)/chat.tsx:44,366`; `app/(drawer)/(tabs)/_layout.tsx:11,40`; `app/(drawer)/(tabs)/vision.tsx:30,94` | boolean "keyboard open" (tab bar hide, tab-bar compensation) |
| `KeyboardChatScrollView` | `components/chat/MessageList.tsx:29,122` (via `renderScrollComponent`, `:120-143`; `offset={offset}` `:128`, `keyboardLiftBehavior="whenAtEnd"` `:133`, `keyboardDismissMode` `:138`) | the message list's scroll view: content repositioning, keyboard lift for content |
| `useReanimatedKeyboardAnimation` (via the house hook) | `hooks/useKeyboardLift.ts:21,36` → `translateY: -occlusion.value` (`:41`); consumed by `MessageInput.tsx:82,347` and `chat.tsx:394` (`composerLift`) | composer + overlay lift |
| `KeyboardAvoidingView` / `KeyboardStickyView` | **unused — 0 hits** | deliberate (`chat.tsx:387-392`; `MessageList.tsx:6-12` quotes the library's four KAV limitations) |

`tests/keyboard-avoidance.test.ts` encodes the intended behavior:
- *"the chat composer is carried by the chat architecture, not a KAV"* — asserts chat has no
  `KeyboardAvoidingView` (`:109`), the list is `KeyboardChatScrollView` (`:111-112`) with
  `offset` (`:113`) and `extraContentPadding` (`:114-115`);
- *"the empty state must NOT be scroll content: the keyboard inset moves it"* — asserts
  `doesNotMatch(list, /ListEmptyComponent/)` (`:128-131`), the overlay markers
  `showPlaceholder && (` (`:133`), `absolute inset-x-0 top-0` (`:134-135`), and
  `bottom: composerHeight + tabBarCompensation` (`:136-139`);
- *"column-anchored overlays compensate for the tab bar hiding"* (`:141-165`, pattern asserted at
  `:150`, count at `:154-158`);
- *"the tab bar height has one definition"* (`:167-199`) — records the historical drift:
  *"three numbers for one bar (constant 60, prose 64, real 75). The compensation subtracted
  60+inset while the column grew by 75+inset, so the centring box ended up 15px taller — half of
  which the centred card absorbed as drift"* (`:178-186`);
- exactly one file may read `keyboard.height` (`:368-377`), the lift must negate (`:355-356`),
  the composer's anchor defaults to 0 (`:339`, `:344`).

### 4.3 The empty placeholder itself

```tsx
// components/chat/ChatEmptyPlaceholder.tsx
19:  if (activeModelId) return null;                      // no-model state only (pocketpal parity)
     …
44:  return (
45:    <View className="flex-1 items-center justify-center px-8">
       …glyph / title / description / button…
```

A `flex-1` centred child — identical *internal* layout to pocketpal's
(`pocketpal-ai/.../ChatEmptyPlaceholder/styles.ts:6-12`). The difference is **where it mounts**:
inside an absolute overlay box (`chat.tsx:609-613`) instead of inside the list.

### 4.4 The exact mechanisms that moved LiAI's empty view

All three are documented in-repo verbatim, and all three are *layout* (not transform) changes:

**Mechanism 1 — the list's keyboard `contentInset` (fixed by moving the placeholder out of the list).**
LiAI's list is `KeyboardChatScrollView`, which applies the keyboard height to the scroll viewport
as a dynamic inset. First-hand from the installed 1.21.9 source:

```tsx
// node_modules/react-native-keyboard-controller/src/components/ScrollViewWithBottomPadding/index.tsx
81:      const dynamicBottom = !inverted ? bottomPadding.value : 0;
144:       contentInsetBottom: dynamic.bottom,
// node_modules/react-native-keyboard-controller/src/components/KeyboardChatScrollView/index.tsx
141:           bottomPadding={totalPadding}
```

> *"KeyboardChatScrollView adds the keyboard height to the scroll viewport as a dynamic
> contentInset (ScrollViewWithBottomPadding: `dynamic.bottom = bottomPadding.value`), and on
> Android that is applied on every keyboard open regardless of keyboardLiftBehavior. A centred
> flex-1 child inside that inset re-centres in the shrunken box, so the empty state visibly MOVED
> as the keyboard rose. pocketpal-ai gets away with it because their list is a plain FlatList that
> adds no keyboard inset."*
> — `components/chat/MessageList.tsx:14-23`; same statement at `tests/keyboard-avoidance.test.ts:118-127`
> and `chat.tsx:213-221`.

**Mechanism 2 — the tab bar unmounting (column growth).** LiAI's custom tab bar returns `null`
while the keyboard is up:

```tsx
// app/(drawer)/(tabs)/_layout.tsx
40:  const keyboardVisible = useKeyboardState((s) => s.isVisible);
     // Hidden on the keyboard only: it would sit directly on top of it …
47:  if (keyboardVisible) return null;
56:  <View className="bg-surface-1" style={{ paddingBottom: insets.bottom }}>
```

The column (and therefore the overlay's centring box) then grows by
`TAB_BAR_HEIGHT + insets.bottom` (`components/BottomNav.tsx:38`, `= 67`, class sum documented at
`:24-37`), and a vertically centred child slides **down by half of that growth** — see
`chat.tsx:359-367`:

> *"The tab bar renders null while the keyboard is up ((tabs)/_layout.tsx:42), so the screen — and
> this column with it — GROWS by exactly that much. A vertically centred child would then slide
> down by half of it, which is what made the 'No Models Available' card look like it moved when
> the keyboard opened. The keyboard height is not the cause; this is."*
> and `tests/keyboard-avoidance.test.ts:141-149`. When the compensating constant disagreed with the
real bar (60 vs 75), a ~7.5 px drift remained (`tests/keyboard-avoidance.test.ts:178-186`).
**PocketPal cannot hit this mechanism at all: it has no bottom tab bar** — the chat screen lives in
a drawer (`pocketpal-ai/App.tsx:128`, `createDrawerNavigator` at `:9,62`).

**Mechanism 3 — the earlier translate/pad split (deleted).** The composer used to be lifted by a
padding change on one component while the centred empty state was padded on another, so the two
disagreed: *"a wrapper that only re-exports a transform is a second box that can disagree with the
one it wraps — which is exactly how the empty state came to look like it was sinking while the
composer sat still"* (`chat.tsx:643-649`, asserted as deleted by
`tests/keyboard-avoidance.test.ts:201-240`).

**Current state of the tree:** mechanism 1 is removed (overlay placement + test at
`tests/keyboard-avoidance.test.ts:128-131`), mechanism 2 is compensated exactly
(`chat.tsx:366-367` → `chat.tsx:611`; `keyboardOffset = insets.bottom + TAB_BAR_HEIGHT`,
`chat.tsx:358`; single-definition guard `tests/keyboard-avoidance.test.ts:167-199`), mechanism 3 is
deleted and guarded (`tests/keyboard-avoidance.test.ts:201-240`). Every remaining keyboard-driven
change on the screen is a **transform**: `composerLift` (`chat.tsx:394,667`), the jump overlay
(`:625`), the composer (`MessageInput.tsx:82,347`) — all `translateY` from the one reconciled
`keyboardOcclusion()` (`lib/keyboard.ts:41-47`, `hooks/useKeyboardLift.ts:35-42`). Transforms do
not re-lay-out the centring box, so they cannot move the card.

---

## 5. The precise reason one moves and the other doesn't

| | PocketPal | LiAI (as shipped before the fixes) |
|---|---|---|
| Empty view lives in | list content, centred (`ChatView.tsx:993-996`, `:998`; `ChatEmptyPlaceholder/styles.ts:6-12`) | list content, centred (original) → now an absolute overlay (`chat.tsx:609-613`) |
| Keyboard → list viewport | **nothing** — plain FlatList, `automaticallyAdjustContentInsets={false}` (`ChatView.tsx:988`), no `contentInset`, no `renderScrollComponent`; spacer gated to `messages.length > 0` (`:974`) | **dynamic `contentInset` = keyboard height** through `KeyboardChatScrollView` (`MessageList.tsx:122`; library source `ScrollViewWithBottomPadding/index.tsx:81,144`) → box shrinks → centred child re-centres (**moves**) |
| Keyboard → container height | **nothing changes** — input is absolute + `translateY` (`ChatView.tsx:433-436`, `styles.ts:56-68`) | **tab bar unmounts** (`(tabs)/_layout.tsx:47`) → column grows by `TAB_BAR_HEIGHT + inset` → centred child slides down half the growth (**moves**), historically by ~7.5 px more (`tests/keyboard-avoidance.test.ts:178-186`) |
| Window resize | none (iOS default; Android 15+ edge-to-edge at targetSdk 36 — `build.gradle:6`; `tests/keyboard-avoidance.test.ts:4-9`) | same platform facts (`app.json:24` "resize" is inert per `tests/keyboard-avoidance.test.ts:4-9`) |
| Bottom tab bar | **none** (drawer nav, `App.tsx:128`) | custom bar, hidden on keyboard (`(tabs)/_layout.tsx:47`) — a LiAI-only mechanism PocketPal never has |

**Root cause in one sentence:** LiAI's empty view moved because its centring box's *geometry*
depended on keyboard state (list inset + column growth), while PocketPal's centring box's geometry
depends only on the composer height — in PocketPal every keyboard response is a transform on other
elements, so the empty view's box is keyboard-invariant and the keyboard merely covers it.

Whether PocketPal *stays* still also presupposes the window does not resize (§3.5) — on iOS RN
never resizes, and on Android 15+ (targetSdk 36) edge-to-edge means the app draws behind the
keyboard. PocketPal does **not** use iOS's automatic ScrollView keyboard avoidance; it explicitly
turns automatic content-inset adjustment off (`ChatView.tsx:988`).

---

## 6. Concrete options to make LiAI match (empty view never moves)

### Option A — keep the current design (status quo) and verify on device — RECOMMENDED
The current tree is already built for "the content column never moves" (`chat.tsx:540-557`): the
placeholder is an overlay outside the list, and `tabBarCompensation` (`chat.tsx:367`, applied at
`:611`, counted at exactly two sites by `tests/keyboard-avoidance.test.ts:154-158`) restores the
centring box to identical height in both keyboard states.
- **Files to touch:** none (verification only: open the keyboard on the empty thread and watch the
  card).
- **Risk:** low. Residual risk is exactly one class: `TAB_BAR_HEIGHT = 67` (`components/BottomNav.tsx:38`)
  must equal the bar's rendered height on every device — the comment admits *"the value itself is
  verified on device, not by test"* (`BottomNav.tsx:29-38`). A δ error moves the card by δ/2 (the
  historical 60-vs-75 case moved it ~7.5 px). Locked by `tests/keyboard-avoidance.test.ts:167-199`
  against *redefinition*, not against *value drift*. Also confirm the build under test contains
  `chat.tsx:367`/`:611` at all (the pre-fix build exhibits both historical symptoms).

### Option B — structural parity: make the column height keyboard-invariant (remove the compensation entirely)
PocketPal's stability comes partly from never changing the container's height. Two ways to get there:
- **B1: keep the tab bar mounted while the keyboard is up and let the keyboard cover it**
  (closest to PocketPal's world — they have no bar; the keyboard overlays UI in both apps).
  - **Files:** `app/(drawer)/(tabs)/_layout.tsx:47` (delete the hide), `app/(drawer)/(tabs)/chat.tsx:366-367`
    (compensation → gone), `:611` and `:625` (bottom → `composerHeight` only), **and every lift
    anchor**: with the bar still mounted, the composer's `bottom: 0` box sits above the bar, so
    `useKeyboardLift()` must receive the bar offset (`chat.tsx:394`, `components/chat/MessageInput.tsx:82`
    → `useKeyboardLift(keyboardOffset)`), plus `tests/keyboard-avoidance.test.ts:141-199` and
    `:328-367` rewritten; `voice.tsx`/`vision.tsx` keyboard-visible consumers re-checked
    (`vision.tsx:94`).
  - **Risk:** medium-high. Re-anchoring the composer is exactly the bug class already paid for
    once — under-lifting by the anchor (`lib/keyboard.ts:24-30`, test `:328-367`); the transition
    changes (the bar is progressively covered instead of vanishing); three screens move together.
- **B2: hide the bar without giving up layout space** (absolute/transform-based tab bar).
  - **Files:** `(tabs)/_layout.tsx` (custom layout), all three screens' bottom offsets, `MessageList`
    `offset` semantics, tests.
  - **Risk:** high — a navigation-layout rewrite for one card's stability. Not worth it.

### Option C — pocketpal-literal: put the placeholder back in the list as `ListEmptyComponent`
- **Files:** `app/(drawer)/(tabs)/chat.tsx:608-616` (remove overlay), `components/chat/MessageList.tsx`
  (add `ListEmptyComponent`), `tests/keyboard-avoidance.test.ts:128-131` (assertion must be inverted).
- **Risk:** **HIGH — rejected.** It reintroduces mechanism 1 verbatim: `KeyboardChatScrollView`
  applies the keyboard height as `contentInset` on Android on every keyboard open regardless of
  `keyboardLiftBehavior` (`MessageList.tsx:14-20`; library source
  `ScrollViewWithBottomPadding/index.tsx:81,144`, `KeyboardChatScrollView/index.tsx:141`), so the
  centred `flex-1` card re-centres in the shrunken box — the original reported bug. PocketPal's
  version only works because their list adds no keyboard inset (`ChatView.tsx:987`, plain
  FlatList); LiAI's list cannot drop the inset when empty with the APIs in the pinned 1.21.9
  (`keyboardLiftBehavior` governs lift, not the Android inset). This is the one difference that is
  a *forced divergence*, not a gap.

### Option D — if the card is STILL observed to shift on a current build: diagnose before editing
- **Files:** none initially.
- **Checks, in order:** (1) build contains `chat.tsx:367`/`:611`; (2) measure the rendered tab bar
  (border 1 + pt-2 8 + h-10 40 + 14 + pb-1 4 + `insets.bottom` — `BottomNav.tsx:24-38`,
  `(tabs)/_layout.tsx:56`) against `keyboardOffset` (`chat.tsx:358`) on the device; (3) confirm the
  moving element is `ChatEmptyPlaceholder` and not `SuggestedPrompts`
  (`chat.tsx:667,705`), which **moves with the keyboard by design in both apps**
  (`pocketpal-ai/.../ChatView.tsx:442-444`, `:1196`).
- **Risk:** none.

---

## 7. Static verification (2026-10-08, after the device report)

A device test on 2026-10-07 reported the empty view **still moves** on a build that
contains both fixes (`tabBarCompensation` landed 03ff9d1, 2026-09-28), so the
source-side suspects were re-checked directly:

1. **The class sum is 67, and the one drifting term is pinned.**
   `BottomNav.tsx:24-38`: `border-t 1 + pt-2 8 + h-10 40 + label 14 + pb-1 4 = 67`,
   and the label box cannot grow — `ScopedVariables` pins line-height to 14
   (`BottomNav.tsx:57-60`) and `maxFontSizeMultiplier={1.1}` caps worst-case
   13.31px inside it (`:92-96`). Font scaling cannot move the bar.
2. **The compensation algebra is exact.** Column growth on bar-hide =
   `TAB_BAR_HEIGHT + insets.bottom` (`(tabs)/_layout.tsx:56` adds the inset as
   `paddingBottom`), and `keyboardOffset = insets.bottom + TAB_BAR_HEIGHT`
   (`chat.tsx:358`) is handed back as `tabBarCompensation` (`:367`, applied at
   `:611`). `Δcolumn = Δbottom`, to the pixel.
3. **`composerHeight` cannot wobble on keyboard open.** `MessageInput.tsx:345-348`
   carries the composer as a `translateY` (`style={lift}`) and reports layout
   via `onLayout`; a transform does not re-fire `onLayout`, and `MessageInput`
   has no keyboard-conditional `paddingBottom`/inset of its own.

**Consequence:** the box is invariant *in source*, so the 10-07 observation
implies either a mechanism not on this document's list (window/safe-area-level,
i.e. "the whole screen moves") or an input this pass could not see (the runner's
bundle date, the device's Android version — pre-15 devices still resize the
window for the keyboard, and on such a device PocketPal's centred
`ListEmptyComponent` would move too, making the literal copy no fix).

**Open item:** a `__DEV__`-only probe (temporary, `app/(drawer)/(tabs)/chat.tsx`)
logs `column`/`overlay` box heights across a keyboard toggle; the two numbers
name the mechanism. Device check still outstanding.

## 8. Limitations of this pass

- `git log`/`git status` were unavailable in this environment (the shell is broken), so the *dates*
  of the three LiAI fixes could not be read from history; the mechanism claims above rest on the
  current tree's code, its in-repo comments, and `tests/keyboard-avoidance.test.ts` (which records
  the symptoms as reported facts).
- No device run was performed; "the current tree does not move the card" is a static-layout
  argument (all keyboard responses are transforms; the one layout change is compensated), not a
  runtime measurement. Option D exists for that reason.
- The Android window-resize claim for PocketPal's older-Android range is inferred from targetSdk 36
  + edge-to-edge + the identical fact stated for LiAI at `tests/keyboard-avoidance.test.ts:4-9`; it
  was not measured on a pre-15 device.