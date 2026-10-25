# Research: PocketPal SquarePalCard + picker-sheet UI — parity port

Date: 2026-10-25
Status: implemented on the current branch; device verification outstanding.
Reference: `pocketpal-ai/` (read-only).
Question: make LiAI's companion card and composer picker match the reference
screenshots (`pocketpal_pal.jpg`, `pocketpal_selectpal&models.jpg`).

## What the reference ships

- **SquarePalCard** (`src/screens/PalsScreen/components/SquarePalCard/`,
  styles in the sibling `styles.ts`): a Paper Card (radius 16, outline hairline,
  content padding 12) holding an **inset letter avatar** — full-width, 80px tall,
  radius 12, background `pal.color[0]` (solid, no gradient; the code itself
  notes the gradient is a TODO and uses `[, '#333333', '#e5e5e6']` when
  colorless), first letter at fontSize 24 in `getContrastColor(ground)`, with a
  `thumbnail` image winning over the letter when `thumbnail_url` is set. A
  **28px circular chat badge** (radius 14, `surface` ground, light shadow /
  dark outline, offset bottom-right 6) carries a `Camera` glyph for video-capable
  pals else a chat bubble at 18px, `onChatPress` running
  `activatePalWithModel`. The name row pairs the 14px semibold name with share
  (local only, `exportPal`) and red trash (local only, Alert confirm →
  `palStore.deletePal`) IconButton 24s with 16px strokes. Description is 11px,
  `numberOfLines={warning ? 1 : 2}`. The warning pill (errorContainer+20 ground,
  error+40 hairline, radius 6, alert-circle 14 + 9px error text) appears when a
  local pal with a `defaultModel` fails `modelStore.isModelAvailable(id)`.
- **ChatPalModelPickerSheet** (`src/components/ChatPalModelPickerSheet/`): tab
  pills 16×8 padding, radius 8, active = `primaryContainer` ground +
  `onPrimaryContainer` label; the list is a **flat divider row list**
  (`borderBottomWidth: 1 outline`, padding 16) — pal rows show the 16px name and
  a 14px capability subtitle from `getCapabilityText` (`capabilities.video` →
  "Video", else "Assistant"), NO avatar, NO per-row borders, NO check. The
  active row (pal or model) adds `tertiaryContainer` ground + `primary` border
  colour; the active pal row also carries a settings gear. "No Pal / Disable
  pal" is the first row while a pal is active, with a leading X icon.

## What LiAI now ships

- `components/companions/companion-card.tsx` — the SquarePalCard shape: 16px
  card, inset 80×80 avatar (`color[0]`, `#333333` fallback, 24px letter via
  `text-h2`, white-on-dark from the new pure `utils/contrast.ts` port of
  `getContrastColor`), 28px hairline-bordered badge bottom-right, name row with
  Share + Trash2 lucide glyphs (16px, `primaryText` / `errorMark`), 12px
  description capped at `warning ? 1 : 2` lines, `bg-error/10` +
  `border-error/40` pill read "Model not downloaded" only while the companion's
  `defaultModel` is absent from the completed-download slice of the model
  store (`downloadStatus === "completed"`, the same readiness test
  `useActivateCompanion` resolves its model by). Trash confirms through an
  Alert, then `deleteCompanion(id)`; share calls `shareCompanions([companion])`
  (already-wired export glue — no stub needed).
- `utils/contrast.ts` — pure luminance → black/white pick; the project's only
  color arithmetic lives in utils, per the module-boundary rule.
- `components/chat/chat-picker-sheet.tsx` — companion rows rebuilt as the
  reference's flat divider list (no per-row rounded borders, no colour stroke,
  no Check), name `text-body-lg` + `text-primary-text`, subtitle
  `text-body-md text-secondary-text` = capability text ("Video"/"Assistant");
  active row = `bg-surface-3` ground with `border-primary`; "No companion" is
  the first row with a leading X and a "Disable this companion" subtitle while
  bound. The active tab gained the reference's tinted pill (`bg-surface-2`,
  radius 8).
- `components/companions/companions-screen.tsx` — the removed card-level "Use"
  button; activation moved onto the avatar badge (where the reference also runs
  `activatePalWithModel`), the screen dropped its own `useActivateCompanion`
  clone so both surfaces share the one orchestrator inside the card.

## Deliberate divergences (and why)

- **No box-shadow** — global.css bans shadow everywhere ("depth is a 1px
  hairline or one step between the surfaces"); the badge and pill use the
  hairline treatment instead of the reference's shadow layers.
- **Pill text at `text-micro` (10px), not the reference's 9px** — same
  reading-floor trade already recorded in `font-size-comparison.md`.
- **Glyphs stay lucide** — `Share`/`Trash2`/`Camera`/
  `MessageSquareText`/`AlertCircle`/`X` at the reference's sizes; the UI rule
  pins lucide for glyph work.
- **No active-row settings gear** — management lives on the Companions screen
  (the 10-23 picker doc's standing decision); the active row is marked by the
  tint pair + `accessibilityState.selected` alone.
- **Grey pill (`bg-surface-2`), not `primaryContainer`** — the screenshot shows
  a neutral grey pill, and LiAI's tokens carry no primaryContainer pair; the
  selected-element tint the tokens DO define is exactly this surface step.
- **`accessibilityLabel` and `testID` hook points, not style assertions** — Uniwind
  resolves to nothing under Jest; suites pin behaviour, and the design-system
  lint (`jest/design-system.test.ts`) pins the styling vocabulary.
- **Fallback letter "C", not "P"** — the letter mirrors LiAI's domain word
  (Companion), not PocketPal's (Pal).
- **Description fallback is trimmed** — the cleanSystemPrompt strip ports
  exactly; the parameter-summary and capability-text steps are skipped:
  no video template and no UI-written parameters exist here yet.
- **Readiness is ONE predicate, not `isModelAvailable`** — PocketPal's
  `modelStore.isModelAvailable(id)` filters `availableModels`; the port's
  `services/companions/activate.ts isModelReady` (catalog member +
  `downloadStatus "completed"`) is the same readiness the activation flow
  already resolved by, so the pill can never contradict the badge's
  activation (code-review dedup; also handled in `useActivateCompanion`
  via `downloadedSpecs`).
- **A set `color` pair tints the CARD border** (`color[1]`, 0.5 hairline),
  matching SquarePalCard's cardStyle — added on the spec review's finding
  that it was missed; the pill keeps the token hairline width.

## Verdict

Card and picker now read as the reference's screenshots (avatar letter card +
badge; pill tabs + divider rows with capability subtitles). Parity coverage:
`components/companions/__tests__/companion-card.test.tsx` (12 tests) and
`components/chat/__tests__/chat-picker-sheet.test.tsx` (10 tests). Full suite
946/946 green; typecheck clean. Device screenshots against
`pocketpal_pal.jpg` / `pocketpal_selectpal&models.jpg` still to capture.

## Files

- `utils/contrast.ts` (new) + `utils/__tests__/contrast.test.ts`
- `services/companions/activate.ts` (shared readiness rule: `isDownloaded`,
  `downloadedSpecs`, `isModelReady`)
- `hooks/useActivateCompanion.ts` (reads the shared rule)
- `components/companions/companion-card.tsx` (rewritten) +
  `components/companions/__tests__/companion-card.test.tsx` (new)
- `components/companions/companions-screen.tsx` (Use-button removal)
- `components/chat/chat-picker-sheet.tsx` (tabs pill + divider companion rows)
- `components/chat/__tests__/chat-picker-sheet.test.tsx` (extended)
