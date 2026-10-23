# Research: PocketPal chat keyboard port — root causes found, decisions taken, verification protocol

Date: 2026-10-10
Status: implemented (commits `4ac35e6`, `d39b3f1` on `dev-mobile`); device verification outstanding.
Updated: 2026-10-16 — the empty-state flash was still reproducible (reported with NO model
loaded, which §2 ranked as the covered case). Root cause and fix in §5. Still unverified on
device.
Scope: the two reported symptoms and the port they were fixed by. Companion documents:
- `docs/research/2026-10-08-pocketpal-chat-empty-view-keyboard.md` (the symptom analysis this work
  concludes — its §7 open questions are closed or reclassified here).
- `docs/specs/` keyboard-parity specs (unchanged by this work).
- `tests/keyboard-avoidance.test.ts`, `tests/keyboard.test.ts` (the source-scan and unit guards).

## 1. The reported symptoms

1. The no-model empty card still moved when the keyboard opened, on a 2026-10-07 Android build that
   already contained the compensation fix from the 2026-10-08 research pass.
2. A UI flash when the keyboard opened with a model loaded.

## 2. Root causes found (static analysis; both consistent with symptom 1 surviving a static pass)

The card's centring box is exact in source: the column grows by the bar slot (`TAB_BAR_HEIGHT +
insets.bottom`) when the tab bar unmounts, and `tabBarCompensation` gives exactly that back — the
box is invariant, so nothing in the geometry can move it. What survived was not geometry:

- **Commit race.** The tab bar and the chat screen each called `useKeyboardState` in their OWN
  subtree. Both re-render from the same native event, but they are separate component trees, so
  nothing guarantees the two updates land in the same React commit. For a frame or two the column
  had grown while `tabBarCompensation` was still 0 — the box δ-too-tall, the centred card shifted
  by half the bar slot, then snapped back. A race is invisible to a static pass, which is exactly
  why the 2026-10-07 report survived one. Fix: one writer (`KeyboardVisibilitySync` at the root
  under `KeyboardProvider`) into `store/keyboard.ts`; both consumers read the store — one
  notification, one batched commit, simultaneous by construction.
- **Constant drift (known residual).** `TAB_BAR_HEIGHT = 67` is device-verified, not test-verified;
  the history has three disagreeing values (60/64/75 → 7.5px). Fix: the bar measures itself
  (`onLayout`), the store replaces the seed, a guard (`resolveTabBarHeight`, unit-tested) rejects
  nonsense measurements. The seed's only re-declaration lives in `lib/keyboard.ts`
  (`TAB_BAR_HEIGHT_SEED`), because a store importing `components/BottomNav.tsx` drags React
  Native's type graph into the ambient program and breaks the Uniwind augmentation loading
  (observed: BottomNav's `className` type-errors under `tsc`).
- **Window resize (suspect, unverifiable statically).** `windowSoftInputMode="adjustResize"` plus
  pre-Android-15 behaviour can shrink the window itself; no layout compensation can hold that case.
  It is the fallback explanation if the card still moves after the race fix — see the protocol.

For symptom 2, ranked by evidence:

- **Tab-bar repaint (most likely).** The bar is `bg-surface-1`; the chat screen behind it is
  `colors.base`. The bar unmounts on keyboard open and remounts on close, so the slot's strip
  changes colour for a frame or two — most exposed with a model loaded, where the placeholder card
  no longer covers the strip. Fix: a keyboard strip (the bar's own colour and height, flipped by
  the SAME store in the SAME commit as the bar's unmount — no frame can mix the two; behind the
  fully open keyboard it is invisible). It paints BEFORE the composer/overlays because those are
  lifted and cross the strip's band for the transition frames.
- **Per-toggle row re-render.** `renderRow` was a fresh arrow per screen render, `MessageListItem`
  was not memoised, so every keyboard toggle re-rendered every visible row (markdown re-parse
  included) — with a model loaded the rows are visible content. Fix: `memo(MessageListItem)` +
  id-taking handlers + already-memoised rows.
- **contentInset snap.** `KeyboardChatScrollView` writes its padding unanimated at keyboard open;
  a secondary suspect, addressed only if symptoms survive commit 1 (see protocol).

## 4a. §5 — the empty-state flash, root cause and fix (2026-10-16)

**Symptom.** With no model loaded, the composer area flashes when the keyboard opens, then settles.
This is the *opposite* of how §2 ranked symptom 2: the placeholder card is the thing that moves here,
not the strip.

**Root cause (first attempt — WRONG, reverted).** `tabBarCompensation` was React state
(`keyboardVisible ? keyboardOffset : 0`), flipping to a full bar slot in one commit. The first
theory was that this was a clock mismatch with the composer's UI-thread lift, and it was changed
to a `useDerivedValue` ramp off `useReanimatedKeyboardAnimation().height`, on PocketPal's
"everything derives from the same value" rule (`ChatView.tsx:434-442`). That made the symptom
WORSE and was reverted the same day: the empty chat view began moving.

**Why that theory was wrong.** The thing being compensated for is a **step, not a ramp**.
`keyboardVisible` comes from `useKeyboardState` — a JS-thread store flag that flips ONCE — and
`(tabs)/_layout.tsx:51` returns `null` in that commit, so the column grows by the whole bar slot
at once. Matching that step with a ramp meant the overlay stayed a bar slot too tall for the
entire rise until the keyboard had travelled ~110 of its ~300dp, so the centred card sat up to
half a slot low and then snapped up. A step matched to a ramp is a worse version of the flash it
was meant to remove.

**What PocketPal actually does.** They never hit this because **nothing unmounts**: their
navigation is a drawer, not a tab bar (`App.tsx:130`), so the chat column never changes size on
keyboard open. Their centring box is invariant *by construction* — `styles.chatContainer` is
`flex:1, position:'relative'` (`styles.ts:70-75`), the list is `height:'100%'` with `flex:1`
commented out (`styles.ts:9-12`), the input is `position:'absolute'` and only `translateY`-ed
(`ChatView.tsx:452-455`), and the empty state lives INSIDE the list, centred by
`flatListContentContainer`'s `flexGrow:1` (`styles.ts:13-15`), with an animated
`ListHeaderComponent` spacer for the occlusion (`ChatView.tsx:1005-1007`). There is no
compensation because there is no change to compensate.

**Current state.** `tabBarCompensation` is React state again, committed with the bar's unmount —
a step matching a step, which is §2's "commit together, no frame can mix the two" invariant. The
`keyboardSlotProgress` worklet and its hook were deleted; the dead `__DEV__` probe stays deleted.
**Still unverified on device**, and the originally-reported flash has no confirmed cause yet: the
§2 suspects that survive are `KeyboardChatScrollView`'s unanimated padding (ranked secondary) and
`windowSoftInputMode="adjustResize"` shrinking the window (unverifiable statically). If the card
still moves after this revert, the §4 protocol's distinction applies — a whole-screen move means
window resize, not compensation — and it needs the probe or the pixel loop to tell them apart.

## 3. Decisions taken

Ported (flow + mechanism parity, LiAI stack): single keyboard-visibility store; self-measuring tab
bar; single-source placeholder gate on `activeModelId` (connection health keeps gating send and
the prompt chips — it is a stale-able transport concern, resolved only at mount and model change);
keyboard strip; memoised rows; dismiss-keyboard-on-send; `ModelPickerSheet` on the shared `Sheet`
(the empty thread's "Select Model" CTA activates without leaving chat; the download branch still
routes to `/models`; selection uses the same local/remote discriminator as the header menu).

Declined, on evidence: inverted/newest-first list (high data-layer churn, no observable gain);
MobX; empty state as `ListEmptyComponent` (rejected in the 2026-10-08 pass — the scroll view's
contentInset would move a centred child again); deleting `KeyboardChatScrollView` (its `whenAtEnd`
lift, `blankSpace` absorption, tab-bar-aware `offset` and `extraContentPadding` are real
behaviours PocketPal never needed because it has no tab bar); a composer model-chevron
(ported on 2026-10-23: the chevron opens `ChatPickerSheet`, PocketPal's Pals/Models tabs,
and the mic moved beside Send - see `2026-10-23-chat-composer-picker-parity.md`). The picker is NOT conditionally mounted (unlike
PocketPal's `{open && <Sheet/>}`): TrueSheet lazy-mounts its native view on first present, so a
closed sheet already has no keyboard interaction, and the conditional pattern's X-button path
unmounts a presented native sheet.

## 4. Verification protocol (the outstanding gate)

On the Android dev build (`npm run android`), model loaded AND unloaded:
1. Keyboard open/close: the card does not move (survival here points at the window-resize
   suspect, pre-Android-15 — capture the `__DEV__` probe's console output before removing it).
2. Keyboard open/close with a model loaded: no colour flash in the bottom strip.
3. Typing does not re-render rows visibly (jank check on a long conversation).
4. Send dismisses the keyboard; the picker opens from the empty card, activates a model, and
   closes.
If 1–4 pass: delete the `__DEV__` probe (`chat.tsx`, its two `onLayout` hooks and its effect) as
the closing commit, and close this document's status to verified. If symptom 1 survives, the
probe output distinguishes the constant case (δ/2, fixed by measurement) from window resize
(whole screen moves; needs a different strategy — flag before building it).
