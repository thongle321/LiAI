/** A catalog preset, drawn with the models screen's one card.
 *
 * PocketParity: the reference has no preset card of its own — its
 * "Available to Download" accordion holds the same ModelCard every other
 * model uses (ModelsScreen.tsx:346-376, ModelCard.tsx:377-592), which on a
 * model with no file yet offers Download + settings + remove + expand.
 * This adapter is that card; the catalog only decides WHAT it is.
 *
 * It used to carry its own anatomy — a Recommended chip, an author line, a
 * file count, and an "Available Quantizations" list under the header. Every
 * preset in the catalog (services/models/huggingface.ts) ships exactly one
 * file, so that list expanded to a single row and the Download button it
 * held is the one the card header carries today.
 *
 * Dismissal stays session-only list surgery, so the X remains X (not trash)
 * — see dismissPreset in store/models/catalog.ts.
 */

import { useModelStore } from "@/store/modelStore";
import { presetSpecView } from "@/services/models/preset-spec.ts";
import type { PresetModel } from "@/types/models";
import { ModelCard } from "./model-card.tsx";

export function PresetModelCard({
  preset,
  onDownload,
  onSettings,
}: {
  preset: PresetModel;
  /** Downloads the preset's file; the caller guards the size first. */
  onDownload: () => void;
  onSettings: () => void;
}) {
  // One subscription each: a progress tick must re-render this one card,
  // and the whole catalog's array is what presetSpecView reads.
  const models = useModelStore((s) => s.models);
  const dismissPreset = useModelStore((s) => s.dismissPreset);

  return (
    <ModelCard
      item={presetSpecView(preset, models)}
      // Never the loaded model: a preset leaves Available once its file lands
      // (model-groups filters it out with isPresetDownloaded), so the loaded
      // face of this model is the store's own row in Ready to Use.
      isActive={false}
      /* Unreachable from this card: it always offers Download (the row is
         never completed), so Load/Offload never render. */
      onActivate={() => {}}
      onDeactivate={() => {}}
      onDownload={onDownload}
      onSettings={onSettings}
      onRemove={() => dismissPreset(preset.id)}
    />
  );
}
