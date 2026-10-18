/** A catalog preset projected onto the ModelSpec the shared ModelCard
 *  already renders.
 *
 *  PocketParity: the reference draws its whole catalog — presets included —
 *  with ONE card (ModelsScreen.tsx:346-376 nests the same ModelCard inside
 *  each accordion; ModelCard.tsx:377-592 gives a not-yet-downloaded model
 *  Download + settings + remove + expand). LiAI keeps the card and feeds it
 *  this view, so "Available to Download" needs no card of its own.
 *
 *  The two halves have one rule between them: the id is the id
 *  `buildPresetModelSpec` mints at download time (presetSpecId), so a preset
 *  card and the row it becomes are the same row — the catalog row IS the
 *  live row, overlaid, never a second identity to keep in step.
 *
 *  Catalog fields win over the stored row: the store names the row
 *  `name (file.gguf)` for the engine's benefit, while the card header shows
 *  the model's name. Everything the downloader attaches (progress, speed,
 *  failure reason, the paired projector) comes through untouched.
 */

import type { ModelSpec, PresetModel, PresetModelFile } from "@/types/models";
import { presetSpecId } from "./huggingface.ts";

/** The file a preset's card downloads.
 *
 *  One file per preset in the catalog today (services/models/huggingface.ts).
 *  If a multi-file preset ever lands, the card downloads the first and the row
 *  created for it is that same first file — the rest become a store concern,
 *  not a card one. One owner for that rule: the card, the store row and both
 *  screens all read it from here.
 */
export function presetPrimaryFile(preset: PresetModel): PresetModelFile | undefined {
  return preset.files[0];
}

export function presetSpecView(
  preset: PresetModel,
  models: ModelSpec[],
): ModelSpec {
  const file = presetPrimaryFile(preset);
  const id = file ? presetSpecId(preset.id, file.name) : `preset-${preset.id}`;

  // What the catalog answers for on its own. Re-applied over the stored row
  // so these fields have exactly one source — the store names a row
  // "name (file.gguf)" for the engine, while the card header shows the model.
  const identity = {
    id,
    name: preset.name,
    author: preset.author,
    description: preset.description,
    origin: "preset" as const,
    type: preset.type,
    files: file
      ? [{ name: file.name, size: file.size, downloadUrl: file.downloadUrl }]
      : [],
    // The reference links a preset's repo page from the card ("View Model
    // Card on Hugging Face"); the store mints no url for a preset.
    hfUrl: `https://huggingface.co/${preset.repo}`,
    ...(preset.params !== undefined ? { params: preset.params } : {}),
    ...(preset.capabilities !== undefined
      ? { capabilities: preset.capabilities }
      : {}),
  };

  // Nothing downloaded yet: the same zeroed row buildPresetModelSpec writes,
  // so an untouched preset reads like a freshly bookmarked model. These four
  // are the store's to own — a row that exists replaces them wholesale.
  const base: ModelSpec = {
    ...identity,
    downloadStatus: "idle",
    downloadProgress: 0,
    downloadedBytes: 0,
    totalBytes: file?.size ?? 0,
  };

  // Everything else the downloader attached — progress, speed, the failure
  // reason, the paired projector — comes straight through.
  const stored = models.find((m) => m.id === id);
  return stored === undefined ? base : { ...base, ...stored, ...identity };
}
