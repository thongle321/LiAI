# Research: PocketPal chat keyboard port — root causes found, decisions taken, verification protocol

Date: 2026-10-10
Status: implemented (commits `4ac35e6`, `d39b3f1` on `dev-mobile`); device verification outstanding.
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
(LiAI's documented composer decision: no model chrome in the field; the header routes to /models
and each message offers "Regenerate with…"). The picker is NOT conditionally mounted (unlike
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
