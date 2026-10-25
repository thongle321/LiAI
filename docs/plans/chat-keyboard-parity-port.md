# Plan: Chat keyboard parity port (empty view + composer flash)

## Goal
Port PocketPal's chat message view / empty view / keyboard / composer behavior into LiAI to fix:
1. Empty-view text moves up/down as the keyboard opens/closes.
2. Composer UI flash when the keyboard opens.

Root cause (researched in docs/research/2026-10-08, -10-10, -10-17): LiAI's chat geometry is
keyboard-variant on the JS thread — the tab bar unmounts on keyboard open, a step
(`tabBarCompensation`) feeds the empty placeholder, and the empty state lives inside the
`KeyboardChatScrollView` (which applies keyboard height as a dynamic content inset, re-centring
a `flex-grow justify-center` child). PocketPal has none of this: nothing unmounts, one
Reanimated `translateY` per consumer, empty state is overlay-anchored and immobile.

## Approach: make chat geometry keyboard-invariant

A. **Tab bar never unmounts** — `app/(drawer)/(tabs)/_layout.tsx`: drop the
   `keyboardVisible → return null` branch. The keyboard covers the bar (edge-to-edge, no window
   resize). Reverses the 10-10 port doc's "declined: keep the hide" on evidence (it is the flash source).
B. **Re-anchor the lifts** — with the bar mounted, bottom-anchored views rise only by the
   keyboard's part above the bar top: `useKeyboardLift(insets.bottom + tabBarHeight)`.
   Consumers: composer (`message-input.tsx:88`), jump overlay / overlay group (`chat.tsx:387,566`),
   and audit `vision-overlays.tsx:300` and `session-list.tsx:152`.
C. **Empty view back to absolute overlay** (reversing 192d3df "empty state back in the list") —
   `chat-empty-placeholder.tsx` regains a `flex-1 justify-center` root; chat.tsx renders it as an
   absolutely-positioned overlay anchored `bottom: composerHeight` only (no keyboard term).
   PocketPal's ListEmptyComponent placement is a forced divergence (their list adds no keyboard
   inset; ours does), documented in the 09-27 spec and 10-08 research.
D. **Message-view flow audit vs ChatView.tsx** — keep KeyboardChatScrollView (its whenAtEnd lift /
   blankSpace / offset are real tab-bar-aware behaviors), iOS-interactive / Android-none dismiss,
   `maintainVisibleContentPosition` while streaming, send dismisses keyboard, memoized rows stay.
E. **Guards + gate** — restore a source-scan invariant suite (empty state is not scroll content;
   its anchor carries no keyboard term; no keyboard-gated unmounts on the chat tree), then
   `npm run typecheck` + `npm test`, then the 4-step device protocol from the 10-10 doc
   (§3.1): empty state with and without a model, card must not move, no strip colour flash,
   send dismisses keyboard.

## Files
- `app/(drawer)/(tabs)/_layout.tsx` — keep bar mounted.
- `app/(drawer)/(tabs)/chat.tsx` — remove strip + `tabBarCompensation`; overlay for empty state;
  re-anchor lifts.
- `components/chat/message-list.tsx` — drop `listEmpty`/ListEmptyComponent + empty centring classes.
- `components/chat/chat-empty-placeholder.tsx` — flex-1 centred root, no bottomInset keyboard term.
- `components/chat/message-input.tsx` — composer lift anchor from props.
- `hooks/useKeyboardLift.ts` — unchanged API (anchor param already exists).
- New invariant test suite; findings recorded in `docs/research/`.

## Known trade-offs (accepted)
- A too-tall empty card no longer scroll-overflows (192d3df's gain); ours is compact. Revert-able.
- `adjustResize` on pre-Android-15 may still shrink the window — unverifiable statically; the
  device protocol's probe distinguishes it.
