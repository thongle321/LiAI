# Vision becomes a mode of the voice tab (2026-10-26)

## Decision

Vision loses its third bottom-tab destination. The tab bar renders **Chat +
Voice** only (`components/navigation/bottom-nav.tsx`, `ChatTab = "chat" |
"voice"`), and the vision experience moves inside the voice tab as an
in-screen mode:

- `VoiceScreen` keeps an always-visible corner **Eye** icon button
  ("Open vision"). Pressing it ends a live voice session first (the
  controller's mic capture stops synchronously in `exit()`), dismounts any
  parked gate sheet, then swaps the whole tree to the camera mode — silently,
  deliberately, no confirmation dialog.
- The mode body (`components/voice/voice-vision-mode.tsx`) owns the full-bleed
  camera shell (its own `SafeAreaView edges={[]}`), the permission prompt,
  watch mode and the vision turn — the exact logic the old
  `app/(drawer)/(tabs)/vision.tsx` owned, unduplicated. Its exit ("Stop
  vision") stops the recognizer, speech and the watch buffer BEFORE calling
  `onExit` back to the orb; there is no route navigation left inside the mode
  (the "Open Models" action remains the one router call).
- The `/vision` route is deleted outright, redirect included — nothing
  deep-linked or navigated to it besides the removed bar entry.
- Switching tabs while in vision mode drops the mode (blur resets
  `visionOn`), so the camera never survives a route blur; returning lands on
  the orb.

- The "model doesn't support vision" split (2026-10-26): the HUD's cannot-see
verdict AND its kind are read from the engine's own module
(services/inference/mmproj.ts — `canSeeImages` is the send gate's function;
`cannotSeeKind` is the split's one owner, derived from the same records, so a
screen can never split differently from the gate). Two cases:
- the flag is toggled off while the projector is on disk → "Vision is off for
  this model." + "Open Models" card — fixable, but the mic is greyed dead too:
  a blind model cannot answer "what do you see?" even before the flag is;
- any other cannot-see (no projector paired, or a remote probe that recorded
  no vision) → "This model can't see images." up front, and the mic greyed
  dead — the spirit of PocketPal's disabled plus button, without letting a
  doomed "what do you see?" turn go out first. Text input stays available in
  BOTH cases (the turn degrades to text-only). No-model-at-all keeps its own
  dead state.

## Why an in-screen swap instead of a pushed route

The tab bar must remain visible (the mode is full-screen *above the bar*, as
before) — a pushed screen would hide it, and the permission/watch-mode
footprint (`useIsFocused`-gated) is preserved by keeping the mode inside the
already-focused voice route.

## Tests

- `components/navigation/__tests__/bottom-nav.test.tsx` — the bar renders
  Chat + Voice only.
- `jest/voice-screen.test.tsx` "VoiceScreen vision swap" — the Eye button is
  always here; entry with a live session calls `end()` and lands on the
  camera HUD ("Stop vision", no voice labels); "Stop vision" returns to the
  orb; entering from closed ends nothing; and the three capability states —
  text-only model ("This model can't see images.", mic dead), toggled-off
  model (the fixable "Vision is off" card with Open Models, mic dead too),
  vision-capable model (neither card, live mic).
- `services/inference/__tests__/mmproj.test.ts` — the pure rule: `canSeeImages`
  sees for a completed local pair; `cannotSeeKind` returns sees / toggledOff
  (flag off, projector on disk) / noVision (no projector, remote probe without
  vision, no model at all).
- `jest/keyboard-invariants.test.ts` — the vision-panel source guards
  (`const panelBottom = 12`, no `s.isVisible`) now read the extracted
  `components/voice/voice-vision-mode.tsx`.
