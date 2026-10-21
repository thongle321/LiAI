# Available to Download — the preset card is now the shared ModelCard

**Date:** 2026-10-18
**Supersedes:** divergence #5 of
[`2026-10-10-model-card-architecture-parity.md`](./2026-10-10-model-card-architecture-parity.md)
("The preset card is untouched, structurally"), which argued the opposite on a
premise this record corrects.
**Screenshot:** `pocketpal_availablemodel.jpg` (PocketPal's "Available to
Download" group, expanded).

## The verdict

PocketPal has no preset card. Its "Available to Download" accordion holds the
**same `ModelCard`** every other model uses
(`ModelsScreen.tsx:346-376` nests that one component inside each group
header; `ModelCard.tsx:377-592` gives a model with no file yet the action row
Download + settings + remove + expand). The reference's collapsed catalog row
and its quantization list do not exist — the file list lives inside the Hub
search sheet, not on the card.

LiAI carried a second card (`PresetModelCard`, 232 lines) whose whole header
was a press target, with a Recommended chip, an author line, a file-count chip
and an "Available Quantizations" section. That card is gone. `available-models.tsx`
is now a 50-line adapter: it decides *what* a preset is and hands the result to
`ModelCard`.

## The premise that was wrong

Divergence #5 said matching PocketPal "would mean deleting the preset
catalogue". It would not. The catalog exists in
`services/models/huggingface.ts` (`PRESETS`, 18 entries) and is read by
`store/models/catalog.ts`; only the *card* was bespoke. And every preset in
that catalog ships **exactly one file**, so the quantization accordion expanded
to a single row whose Download button is now the card's own.

Both facts are now pinned by tests rather than prose:
`isPresetDownloaded` (`services/models/__tests__/file-state.test.ts`) and
`presetSpecView` (`services/models/__tests__/preset-spec.test.ts`).

## How one card covers both halves

`services/models/preset-spec.ts` projects a catalog preset onto the `ModelSpec`
`ModelCard` already takes:

- **One id, one row.** The view's id is `presetSpecId(preset.id, files[0].name)` —
  the same id `buildPresetModelSpec` mints when the download starts. A preset
  card and the row it becomes are the same row, so progress, pause, cancel and
  the failure dialog need no translation layer.
- **Catalog fields win** (`name`, `author`, `description`, `files`, `hfUrl`,
  `params`, `capabilities`), because the store names a row
  `"name (file.gguf)"` for the engine's benefit while the card header shows the
  model. The store wins on everything it owns: status, progress, bytes, speed,
  error and the paired projector.
- **`hfUrl` is new.** `buildPresetModelSpec` mints no url for a preset; the
  view derives `https://huggingface.co/<repo>`, which is what puts
  "View Model Card on Hugging Face" on a preset card at all.

`ModelCard` gained one optional prop, `onRemove`, so the preset card's X
dismisses from the catalog (`dismissPreset`) instead of calling
`removeBookmark` on a row that does not exist yet. Dismissal stays session-only
list surgery, so the glyph stays **X, not trash**.

## The settings gear on a model with no row

PocketPal's gear opens on a not-yet-downloaded model, so ours does too. That
needed the sheet to stop resolving the model by id alone:
`ModelSettingsSheet` now takes `model: ModelSpec | null` and looks the store row
up by that id, falling back to the view it was handed. Settings are still keyed
by the id string through `getModelSettings`/`updateModelSettings`, which are
plain map operations — so anything set before the download survives it, exactly
as in the reference. Onboarding mounts the same sheet, so its gear is live
rather than a dead button in a three-step flow.

## Corrections to the expanded panel

Applied to `ModelCardDetails`, which the screenshot exposes directly:

- **Memory estimate and the RAM warning render only when the model is
  downloaded.** The reference gates its `MemoryRequirement` on
  `isDownloaded && !isRemote` (`ModelCard.tsx:820-900`); nothing here is
  remote. Without the gate a 2 GB download candidate reports a device-fit
  verdict for a file that is not on the phone.
- **Integrity checking is skipped until the file lands.** It stat'ed paths
  that could not exist and reported "Model file is missing. Please redownload."
  on every un-downloaded card.
- **The model name moved into a soft sub-card**, matching the reference's
  full-name box, and the Hugging Face row became the outlined
  **"View Model Card on Hugging Face"** button (`ModelCard.tsx:990-1024`)
  rather than a bare link.

## Also removed

`presetFileState` and `presetCardState` (`services/models/file-state.ts`) went
with the card: both existed only to feed the per-quantization rows, and
`presetSpecView` reads the same store row directly. Their tests went with them.
`isPresetDownloaded` stays — `model-groups.ts` uses it to decide which group a
preset belongs in.

## Verification gap

Unchanged from the earlier record and still true: **nothing here has been
looked at on a device.** Typecheck and the full suite (421 tests) pass; the
sizes in the reference screenshot match this catalog byte-for-byte
(gemma-3-4b `2_370_065_536`, bonsai-8b `1_158_654_496`, phi-4-mini
`2_331_442_560`), but the layout — the soft name box, the outlined HF button,
the action row wrapping at 320pt — needs a screenshot before it is a claim.