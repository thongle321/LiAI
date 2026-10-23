# Research: PocketPal composer pal/model picker — parity port

Date: 2026-10-23
Status: implemented on `dev-mobile`; device verification outstanding.
Reference: `pocketpal-ai/` (read-only).

## What PocketPal does

- **The arrow is the pal selector.** A 28px circle holding a `ChevronUp` sits in the
  composer's leading control group, after the attach button (`ChatInput.tsx:569-607`).
  Its background is `inverseSurface`, or the active pal's colour. The chevron rotates
  while the picker is open (`ChatInput.tsx:169`, `:232-237`, `:394`).
- **The label is `Pal: Name`.** `palNameCompact` is 10px, truncates, and only appears
  alongside an active model (`ChatInput.tsx:596-607`).
- **One sheet, two tabs.** `ChatPalModelPickerSheet` holds Pals and Models; `activeTab`
  initialises to `'models'` (`:79`), the tabs are `Pals`/`Models` (`:86`), and the list
  snaps to 70% (`:358`). "No Pal / Disable active pal" is the **first** row when a pal
  is active (`:208-215`).
- **Selecting closes.** A model tap selects it and dismisses; a pal tap binds it, may
  ask whether to switch to that pal's default model, then dismisses.
- **The mic is already beside Send.** `micBeforeSend` places it in the right controls,
  immediately before Send/Stop (`ChatInput.tsx:699`).

## What LiAI ships

- One shared `Sheet` — `components/chat/chat-picker-sheet.tsx` — titled
  "Companion & Model", with **Companions** and **Models** tab pills. It always opens on
  Models, matching PocketPal, and resets to Models each time it is shown.
- **Companions** tab: "No companion" first, but only while one is bound, then the
  companion rows (colour stripe, name, one-line description, check on the active row).
  Selection goes through `useActivateCompanion`, so the existing default-model prompt
  and conversation kick-off are reused.
- **Models** tab: the same `pickableModels` list and local/remote discriminator the old
  model sheet used.
- The composer's leading `chat-picker-button` (a 48dp `ChevronUp`) opens the sheet. The
  active companion is named beside it as `Companion: Name` when a model is active.
- The chat header's `Users` button is gone. Its trailing slot is new-conversation plus
  the overflow menu, matching PocketPal's header, which never carried the pal control.
- The mic moved from the leading group to the trailing group, between the Think pill and
  Send/Stop.

## Divergences (deliberate)

- **12/16 label, not 10px.** `Companion: Name` uses `text-quiet`; 10px would break the
  design system's reading floor. This is the same trade recorded for PocketPal's
  `palNameCompact` in `font-size-comparison.md`.
- **Copy.** `Companion` and `Models` are LiAI's domain words; PocketPal says `Pal`.
  "Preset" in LiAI already means a generation preset, so it is not the tab label.
- **No chevron rotation.** The sheet owns the open state; the button is not an
  animated disclosure, so it stays a static `ChevronUp`.
- **Tabs scroll with the body.** The shared `Sheet` has a measured header/body/actions
  contract; adding a fixed subheader for two pills was not worth widening it.
- **Tap to switch.** Selecting an installed companion or model is a single tap. The old
  LiAI model sheet required the same, and PocketPal's pal switch prompt is retained by
  `useActivateCompanion`.

## Files

- `components/chat/chat-picker-sheet.tsx` (new)
- `components/chat/__tests__/chat-picker-sheet.test.tsx` (new)
- `components/chat/message-input.tsx` — picker control, mic moved
- `components/chat/chat-header.tsx` — companion button removed
- `app/(drawer)/(tabs)/chat.tsx` — one picker state
- Deleted: `components/chat/model-picker-sheet.tsx`, `components/companions/companions-sheet.tsx`
