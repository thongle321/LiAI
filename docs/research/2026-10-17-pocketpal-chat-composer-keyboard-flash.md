# Research: pocketpal-ai chat screen keyboard + composer — why it does not flash

Date: 2026-10-17
Scope: how `pocketpal-ai/` drives the keyboard on the chat screen and renders its
composer, as a reference for why LiAI's composer flashes on keyboard state changes.
READ-ONLY research pass; no app code was modified.

`pocketpal-ai/` pins `react-native-keyboard-controller@1.19.6`, LiAI pins 1.21.9.
Both APIs LiAI needs from this reference (`useReanimatedKeyboardAnimation`,
`KeyboardStickyView`) exist in 1.21.9 (see the parity spec §11).

---

## 1. PocketPal owns the keyboard in one place

`pocketpal-ai/src/screens/ChatScreen/ChatScreen.tsx` is a thin pass-through to
`<ChatView>` — no `SafeAreaView`, no `useSafeAreaInsets`, no keyboard handling.
All avoidance lives in `pocketpal-ai/src/components/ChatView/ChatView.tsx`.

`pocketpal-ai/App.tsx:119`:

```tsx
<KeyboardProvider statusBarTranslucent navigationBarTranslucent>
```

(mounted inside `SafeAreaProvider`, above the navigator).

In `ChatView.tsx`, a single call to `useReanimatedKeyboardAnimation()` (line 432)
feeds one derived value:

```tsx
const keyboardOcclusion = useDerivedValue(() =>
  Math.max(0, Math.abs(keyboard.height.value) - insets.bottom),
); // ChatView.tsx:434-445
```

Sign convention: `keyboard.height` is **negative while up**, hence `Math.abs`.
The `Math.max(0, …)` clamp is load-bearing — it makes Android API ≤ 29
under-reservation a no-op instead of a platform branch (`ChatView.tsx:418-421`).
`insets` comes from `useSafeAreaInsets()` called once at `ChatView.tsx:245`.

Three parts read that **one** value, so they can never disagree:

| Consumer | Style | Citation |
|---|---|---|
| Input container | `translateY: -occlusion` + `paddingBottom` | `ChatView.tsx:451-455` |
| Suggested-prompts overlay | `translateY: -occlusion` only | `ChatView.tsx:460-463` |
| Inverted-list bottom spacer | `height: occlusion` as `ListHeaderComponent` | `ChatView.tsx:1004-1006` |

The prompts overlay is translate-only because inheriting `paddingBottom` leaves a
large gap between the chips and the input when closed (`ChatView.tsx:457-461`).
The spacer is held while settled-open (it returns to 0 only when the keyboard
closes — not merely when it stops moving — the earlier "in-flight" gate dropped
it too early on API ≤ 29, `ChatView.tsx:1001-1003`).

## 2. The composer never touches keyboard state

`pocketpal-ai/src/components/ChatInput/ChatInput.tsx` (704 lines) contains **zero**
keyboard references. It is a pure UI bar: edit bar, attach preview, multiline
`TextInput` (`multiline` at `:472` — growth happens implicitly because the
container re-lays-out, not via `onContentSizeChange`), and a control row. No
`KeyboardAvoidingView`, no listener, no lift. The parent `ChatView` owns the
transform, which is the core reason there is no flash.

The input wrapper in `styles.ts:56-69` is `position: absolute; bottom: 0;
left: 0; right: 0; zIndex: 10` with rounded top corners and an upward shadow.
`onLayout` is wired to `useComponentSize` over the **whole** input container
(`ChatView.tsx:363-365`, `1180-1182`), giving `chatInputHeight`. One measurement
feeds four consumers for free: list `marginBottom` (`ChatView.tsx:1045`), FAB
bottom (`:1080-1084`), prompts overlay bottom (`:1194`), and picker sheet
`paddingBottom` (`ChatPalModelPickerSheet.tsx:331-332`; the sheet is **unmounted**
rather than hidden while opening — `ChatView.tsx:1248-1250`).

The list itself is a plain `Reanimated.FlatList`, `inverted` **only when
messages exist** (`ChatView.tsx:1050`), with no `KeyboardChatScrollView`, no
`renderScrollComponent`. `keyboardDismissMode = Platform.OS === 'ios' ?
'interactive' : 'none'` (`:1057-1059`); `Keyboard.dismiss()` is called on send
(`:563` from `Keyboard` in `react-native`). The scroll-to-bottom button is the
only `KeyboardStickyView` in the codebase (`:1087`).

The picker sheet unmount-on-close comment says it plainly: "Conditionally
render the sheet to avoid keyboard issues. … better than the keyboard issue"
(`ChatView.tsx:1248-1250`).

## 3. Why there is no flash

1. **No JS-thread state** — the transform is driven by a Reanimated shared value
   on the UI thread; nothing waits for a React render to catch up.
2. **One value** — input, prompts and list spacer all derive from `keyboardOcclusion`,
   so nothing can land a frame out of sync with its siblings.
3. **Continuous** — the underlying event re-fires frame-by-frame; there is no
   "closed → open" snap that has to be animated separately.
4. **No `KeyboardAvoidingView`** — which the library docs note frame-drops and
   double-scrolls.
5. **No unmounts on keyboard open** — there is no tab bar, so nothing in the tree
   appears and disappears when the keyboard comes up. This is the contrast LiAI
   most pays for (LiAI hides its tab bar and compensates).

`useSafeAreaInsets()` is applied as `paddingBottom` in exactly one spot — the
input container (`ChatView.tsx:435`) — since route-level handling is absent.

## 4. LiAI today (contrast) — where a flash can still come from

LiAI ported the technique. What matches:
- `utils/keyboard.ts` — pure worklet `keyboardOcclusion(height, anchor = 0)`,
  `TAB_BAR_HEIGHT_SEED = 69`, `resolveTabBarHeight`.
- `hooks/useKeyboardLift.ts` — composer and jump-to-latest both call `useKeyboardLift(0)`,
  returning `transform: [{translateY: -occlusion}]`, no `paddingBottom`.
- Composer in `components/chat/message-input.tsx` is absolutely positioned at
  `inset-x-0 bottom-0`, lifts itself, reports its height via `onLayout`.
- `components/chat/message-list.tsx` uses `KeyboardChatScrollView` with
  `keyboardLiftBehavior="whenAtEnd"`, `offset`, `extraContentPadding`, `blankSpace`
  and platform-gated `keyboardDismissMode` (already correct per PocketPal:
  `components/chat/message-list.tsx:146`).

LiAI-only differences that can still produce a visible flash:
1. **Tab bar unmounts** when the keyboard is up (`(tabs)/_layout.tsx:41`),
   growing the content column by one bar slot. LiAI masks the transition gap
   with a painted "keyboard strip" (`app/(drawer)/(tabs)/chat.tsx:645-668`) sized
   `keyboardOffset = insets.bottom + tabBarHeight` and a step-style
   `tabBarCompensation`. A step matched to a ramp is itself described in that
   file as "a worse version of the flash it was meant to remove" — if the step
   timing drifts from the ramp, the strip flashes.
2. **Two consumers that must agree**: the composer lifts itself via Reanimated,
   while the column/Lift behaviour runs through `KeyboardChatScrollView`. Both
   derive from `keyboardOcclusion`, but if either consumes stale insets or
   re-renders on JS-thread keyboard toggles, they desync for a frame. Rows are
   memoized precisely because "a keyboard toggle — which re-renders the screen —
   … is the jank half of the keyboard flash" (`components/chat/message-list-item.tsx:106-109`).
3. **Content inset vs extra padding**: the list's keyboard inset and
   `extraContentPadding` are both animated; a re-measure of the composer height
   mid-ramp can lurch the newest message up.

`ChatRoute` also re-renders on the `keyboard-visible` store flip, which is the
single notification point (`store/keyboard.ts:9-15`); if anything observable
changes identity across that flip dispatch, it becomes a re-rendering frame.

## 5. Gotchas (do not blindly copy)

- `isKeyboardVisible` is a shared value initialised `false` and **never written
  true** anywhere in `ChatView.tsx` (`:429`, `:435`). The documented "only when
  keyboard is NOT visible" branch never fires; the bottom inset is always
  applied. The parity spec (§4) flags this as a dead branch — LiAI's
  `useKeyboardLift` (no `paddingBottom` at all) is the cleaner form.
- Do not copy `offset={{closed: 0, opened: insets.bottom}}` on `KeyboardStickyView`
  (`ChatView.tsx:1045`): it mixes raw keyboard-height and occlusion-minus-inset
  accounting; intent unverified.
- Do not copy `marginBottom: bottomComponentHeight + 100` for empty state
  (`ChatEmptyPlaceholder.tsx:86`): magic number, and it only works because
  PocketPal's list adds no keyboard inset.
- `statusBarTranslucent navigationBarTranslucent` (`App.tsx:95`) is dead under
  LiAI's edge-to-edge mode; `app/_layout.tsx:39-46` documents why.
- PocketPal's manager is the `KeyboardProvider` in `App.tsx`, with the Chat route
  also wrapped in `gestureHandlerRootHOC` (`App.tsx:130`).

## 6. Sources (primary)

- `pocketpal-ai/App.tsx:95` — `KeyboardProvider statusBarTranslucent navigationBarTranslucent`
- `pocketpal-ai/App.tsx:130-134` — `gestureHandlerRootHOC(ChatScreen)`
- `pocketpal-ai/src/screens/ChatScreen/ChatScreen.tsx` — thin route, no keyboard code
- `pocketpal-ai/src/components/ChatView/ChatView.tsx:245` — `useSafeAreaInsets()`
- `pocketpal-ai/src/components/ChatView/ChatView.tsx:430-445` — `useReanimatedKeyboardAnimation` + `keyboardOcclusion`
- `pocketpal-ai/src/components/ChatView/ChatView.tsx:447-463` — input/prompts animated styles; dead `isKeyboardVisible`
- `pocketpal-ai/src/components/ChatView/ChatView.tsx:990-1059` — inverted `Reanimated.FlatList`,
  dismiss mode, `maintainVisibleContentPosition`
- `pocketpal-ai/src/components/ChatView/ChatView.tsx:1180-1198` — suggested prompts sibling overlay
- `pocketpal-ai/src/components/ChatView/ChatView.tsx:1080-1087` — scroll-to-bottom in `KeyboardStickyView`
- `pocketpal-ai/src/components/ChatView/ChatView.tsx:1248-1250` — sheet unmount-on-close
- `pocketpal-ai/src/components/ChatView/styles.ts:56-69` — input container (absolutely positioned)
- `pocketpal-ai/src/components/ChatInput/ChatInput.tsx` — composer; no keyboard handling (`multiline` at `:472`)
- `pocketpal-ai/src/components/KeyboardAccessoryView/hooks/useKeyboardDimensions.tsx` — legacy listener hook; **not used by the chat screen**
- LiAI: `utils/keyboard.ts`, `hooks/useKeyboardLift.ts`, `components/chat/message-input.tsx`,
  `components/chat/message-list.tsx:128-147`, `app/(drawer)/(tabs)/chat.tsx:645-668`,
  `store/keyboard.ts`, `components/chat/message-list-item.tsx:96-110`
- `docs/specs/2026-09-27-pocketpal-keyboard-ui-parity.md` — earlier parity pass

Companion: `.scratch/` issue tracker (if created) should point at this file for the fix.