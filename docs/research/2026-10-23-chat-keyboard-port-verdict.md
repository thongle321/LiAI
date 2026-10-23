# Chat keyboard parity port — implementation verdict (2026-10-23)

Resolves the two reported symptoms:

1. **Empty-state card ramps up/down as the keyboard opens/closes.**
2. **Composer UI flash when the keyboard opens.**

## Root causes (both from research docs, both reintroduced by later commits)

- The empty state sat **inside** `MessageList` as `ListEmptyComponent`
  (commit `192d3df`, "put the no-model empty state back in the list
  (PocketParity)"). That shape is a **forced divergence** — it only works in
  PocketPal because their plain `Reanimated.FlatList` adds *no* keyboard
  inset. Our `KeyboardChatScrollView` adds the keyboard height as dynamic
  content inset on every open, so a centred `flex-grow justify-center`
  child re-centres inside the shrinking box and visibly follows the
  keyboard ramp upward and downward.
- `tabBarCompensation = keyboardVisible ? keyboardOffset : 0` (a step)
  fed `bottomInset` in the *same commit* in which the tab bar unmounted
  (`_layout.tsx` returned `null` while the keyboard was visible). Step
  matched to a native ramp is the composer-flash mechanism ranked first in
  `docs/research/2026-10-17-pocketpal-chat-composer-keyboard-flash.md`.

## What shipped (10 files)

- `app/(drawer)/(tabs)/_layout.tsx` — bar **stays mounted** while the
  keyboard opens; edge-to-edge keyboard covers it pane by pane.
- `app/(drawer)/(tabs)/chat.tsx` — deleted `tabBarCompensation` and the
  painted keyboard strip; empty-state band overlay restored beside the
  list anchored at `bottom: composerHeight` (no keyboard term anywhere);
  `composerLift` re-anchored to `useKeyboardLift(keyboardOffset)`.
- `components/chat/message-list.tsx` — dropped `listEmpty` /
  `ListEmptyComponent` / empty-centring classes; header records why.
- `components/chat/chat-empty-placeholder.tsx` — back to
  `flex-1 justify-center` root, as an overlay beside the list.
- `components/chat/message-input.tsx` — gained `liftAnchor` prop
  (tunnelled `keyboardOffset` from the screen).
- `app/(drawer)/(tabs)/vision.tsx` + `components/vision/vision-overlays.tsx`
  — bottom panel anchored at `panelBottom + insets.bottom + tabBarHeight`
  for both keyboard states; no visibility compensation remain.
- `store/keyboard.ts` — survives as broadcast (`isVisible`) + the measured
  bar anchor; header records the new shape.
- `hooks/useKeyboardLift.ts` / `utils/keyboard.ts` — doc comments state the
  anchor rule (pass your distance above the physical screen bottom, or you
  overshoot your anchor by that amount).
- `jest/keyboard-invariants.test.ts` — new source-scan guards: no
  visibility term in geometry, empty state is not list content, step
  compensation and keyboard strip gone, store header states the ported
  shape.

## Reversed recorded decisions

This port overturns two decisions on record:

- `docs/research/2026-10-10-pocketpal-chat-keyboard-port.md` declined
  removing the tab-bar hide. Both symptoms observed since are exactly that
  decline's failure modes (centred child slides by half an unmounted bar
  slot; step vs. ramp flash); the plate of risk has reversed.
- `192d3df` moved the empty state into the list as ListEmptyComponent.
  It moves with every keyboard inset application from our divergent list;
  the overlay beside the list does not.

## Outstanding checks

- **Device protocol** (from the 2026-10-10 doc §3.1-4), on a device:
  model loaded and unloaded; empty card must not move while the keyboard
  opens and closes; no composer colour flash on open; sending dismisses
  the keyboard. The `adjustResize`-shrinks-window suspect on
  pre-Android-15 has no static probe — only the device data closes it.
  `session-list.tsx` rename field keeps its 0 anchor on the drawer
  overlay (iOS-only flow) — verify on device.
- Test-health note, unrelated to the port: `jest/onboarding-done.test.tsx`
  fails to complete (`RangeError: Maximum call stack size exceeded` in the
  async-storage jest.mock resolver) and `store/__tests__/chat-store.test.ts`
  times out 6 gated tests; reproduce even without the port (clean HEAD).
