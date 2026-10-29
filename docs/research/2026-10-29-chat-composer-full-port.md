# 2026-10-29 — Full port of PocketPal's chat composer + message view

## Verdict

**REVERSED the 2026-10-23 verdict** (`docs/research/2026-10-23-chat-keyboard-port-verdict.md`)
and the spec's "LiAI is better" calls in
`docs/specs/2026-09-27-pocketpal-keyboard-ui-parity.md` §12–§13. The user
reported the composer jumping UP off the bottom (screenshot held:
`359626...jpg` attached to the session — composer parked mid-screen with the
keyboard already closed, the reply's stats footer rendered under it, the
streaming reply clipped behind it) and asked to copy PocketPal's chat
architecture in full: same functionality, same behavior, same flow —
**keep LiAI's own UI widgets**.

## Root cause shape

The stuck-lifted composer was a two-measurements race: `MessageInput` and
`chat.tsx` EACH read `keyboard.height` through their own `useKeyboardLift`
hook (plus `KeyboardChatScrollView` measuring a third time as a dynamic
content inset, and `extraContentPadding`/`composerHeight` React state
measuring a fourth). When the reply that "touches" the composer starts
growing during the send/dismiss ramp, the surfaces disagree for a frame —
and the composer's translateY could park at a keyboard height that had
already gone away. PocketPal's own comment states why theirs cannot do this:
the input translate, the spacer and the overlays all derive from ONE
`keyboardOcclusion = max(0, |keyboard.height| − insets.bottom)`
(ChatView.tsx:461-469, "so they never disagree").

## What was ported (verbatim mechanisms, PocketPal file → LiAI file)

| PocketPal | LiAI |
| --- | --- |
| `keyboardOcclusion` derived ONCE in ChatView, passed down | derived ONCE in `chat.tsx` (`useDerivedValue` → `keyboardOcclusion(keyboard.height.value, keyboardOffset)`), the route is now the screen's only `useReanimatedKeyboardAnimation` reader |
| `inputContainerAnimatedStyle` translate | `MessageInput` takes `occlusion: SharedValue<number>` and applies `translateY: −occlusion` (hook call in the composer is GONE) |
| input `maxHeight: 150` (ChatInput styles.ts) | `MAX_FIELD_HEIGHT = 150` clamp on the multiline field |
| plain `Reanimated.FlatList`, no dynamic inset | `MessageList` renders a plain `Animated.FlatList` (keyboard-controller scroll vehicle removed) |
| `inverted={chatMessages.length > 0}`, newest-first data | `inverted={data.length > 0}`, data built by converting rows adapter output to newest-first (`rows.filter(kind === "message").reverse()`) |
| ListHeaderComponent = PendingIndicatorView + animated spacer `height: keyboardOcclusion` | same: pending indicator renders from the LIST HEADER (never from data), spacer reads the route's shared `occlusion` |
| MVCP `{minIndexForVisible: 1, autoscrollToTopThreshold: 20}` gated on isStreaming | identical config, gated on `streaming` |
| auto-scroll ONLY on a new user message → `scrollToOffset({offset: 0})` | identical effect (data[0] flipped to a NEW user message). LiAI's row-count `scrollToEnd` follow effect is DELETED |
| scroll tracker: underflow + STICK 24 / LEAVE 40 + rubber-band clamp | adopted as the inverted-aware handler (`underflow`/`atLatest` shared values, `scheduleOnRN` on flips — Flow unchanged) |
| jump-to-bottom FAB rises with the keyboard | pill unchanged visually, rides `composerLift` = the SAME occlusion value; press scrolls `scrollToOffset({offset: 0})` |
| `keyboardDismissMode` ios interactive / android none; `automaticallyAdjustContentInsets={false}` | identical |
| empty thread as ListEmptyComponent + flexGrow/justify-center | placeholder + greeting are ListEmptyComponent content again (the overlay existed ONLY to escape the keyboard library's re-centring bug — that bug leaves with the scroll view) |
| send dismisses the keyboard | unchanged (already ported; `KeyboardControllerNative.dismiss(false, true)`) |

## Deliberate divergences (kept, not creative)

- **Anchor = bar slot.** PocketPal's list/input anchor at the physical
  bottom; LiAI's column bottoms out one mounted tab-bar slot up. The single
  derivation therefore subtracts `keyboardOffset = insets.bottom +
  tabBarHeight` (the pre-existing, recorded anchor arithmetic in
  `utils/keyboard.ts`), not bare `insets.bottom`.
- **Measured composer height, not `+100`.** The list's marginBottom takes
  the composer's onLayout height (PocketPal hardcodes +100 in
  ChatEmptyPlaceholder).
- **No `paddingBottom: insets.bottom ↔ 0` toggle.** PocketPal's
  `isKeyboardVisible` shared value is declared and read but NEVER written
  (dead), so their padding toggle is permanently `insets.bottom`; LiAI's
  composer sits above the always-mounted tab bar, which owns the bottom
  inset. Nothing to port.
- **LiAI UI kept:** Think pill, mic, attach menu, edit bar, VoiceRecordingBar,
  stats footer, chips, snackbar, sheets, header, per-row layout animation
  (`itemLayoutAnimation`), windowing constants (10/6 — already PocketPal's),
  multiline editable while streaming, `freeze` prop deleted (it existed only
  to hold the removed dynamic inset steady; with a plain list there is
  nothing to freeze).
- **rows.ts adapter unchanged.** It still appends the pending row while a
  run is active OR a stop is unwinding; MessageList strips it from data and
  renders it in the header, so the adapter's shape stays the tested seam.

## Guards updated

- `jest/keyboard-invariants.test.ts` — rewritten for the port: ONE keyboard
  reader per screen (the route), composer consumes the shared value, empty
  state is list content, welded overlays counted.
- New `components/chat/__tests__/message-list-port.test.ts` — pins each
  ported mechanism line (inversion, header spacer, MVCP config, scroll
  triggers, no keyboard-controller scroll vehicle, no extraContentPadding).
- `components/chat/__tests__/message-list-scroll.test.ts` — tracker now
  asserts the underflow/STICK/LEAVE handler form.
- `components/chat/__tests__/message-input-plus-gate.test.tsx` — composer
  props gained the shared occlusion.

## Verification

- `bun run typecheck` — clean.
- `bun run test` — 122 suites / 1084 tests green.
- On device (Android), the reported repro path: type with the keyboard up,
  send; the keyboard dismisses while the reply streams in. The composer
  must stay parked above the tab bar and never jump; the growing reply
  stays pinned above it; reopening the keyboard drops the newest turn
  behind the header spacer exactly one keyboard height, welded to the
  composer.
