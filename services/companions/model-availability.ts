/** A companion's recommended model, resolved against the LIVE catalog
 *  (PocketPal's ModelNotAvailable).
 *
 *  PocketPal stores the whole model JSON, so it can re-download a deleted
 *  recommendation. LiAI stores a ref (`types/companion.ts`), so the only
 *  recoverable case is a catalog preset: the preset still carries the file
 *  URL the ref omits. Everything else degrades to an honest "unavailable".
 */

import type { CompanionModelRef } from "@/types/companion.ts";
import type { ModelSpec, PresetModel, PresetModelFile } from "@/types/models.ts";
import { presetSpecId } from "@/services/models/spec-builders.ts";

export type CompanionModelStatus =
  | { state: "none" }
  | { state: "ready" }
  | { state: "downloading"; progress: number }
  | {
      state: "downloadable";
      name: string;
      size: number;
      presetId: string;
      file: PresetModelFile;
    }
  | { state: "unavailable"; name: string; size?: number };

export function resolveCompanionModelStatus(
  ref: CompanionModelRef | null | undefined,
  models: readonly ModelSpec[],
  presets: readonly PresetModel[],
): CompanionModelStatus {
  if (!ref) return { state: "none" };

  const spec = models.find((m) => m.id === ref.id);
  if (spec?.downloadStatus === "completed") return { state: "ready" };
  if (spec?.downloadStatus === "downloading" || spec?.downloadStatus === "paused") {
    return { state: "downloading", progress: spec.downloadProgress };
  }

  for (const preset of presets) {
    const file = preset.files.find(
      (candidate) => presetSpecId(preset.id, candidate.name) === ref.id,
    );
    if (file) {
      return {
        state: "downloadable",
        name: preset.name,
        size: file.size,
        presetId: preset.id,
        file,
      };
    }
  }

  return { state: "unavailable", name: ref.name, size: ref.file?.size };
}
