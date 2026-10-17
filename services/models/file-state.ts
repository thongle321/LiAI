/** Per-file download state for preset cards (pure, node-tested).
 *
 * Specs are stored per (preset × file); the card must look each file up by
 * its exact spec id. Prefix-matching the first spec smeared one file's
 * state across every row — this is the single lookup everything uses.
 */

import { presetSpecId } from "./huggingface.ts";
import type {
  ModelDownloadStatus,
  ModelSpec,
  PresetModel,
  PresetModelFile,
} from "@/types/models.ts";

export interface PresetFileState {
  status: ModelDownloadStatus;
  progress: number;
  downloaded: number;
  total: number;
  error?: string;
  speed?: number;
}

export function presetFileState(
  models: ModelSpec[],
  presetId: string,
  file: PresetModelFile,
): PresetFileState {
  const spec = models.find((m) => m.id === presetSpecId(presetId, file.name));
  if (!spec) return { status: "idle", progress: 0, downloaded: 0, total: 0 };
  return {
    status: spec.downloadStatus,
    progress: spec.downloadProgress,
    downloaded: spec.downloadedBytes,
    total: spec.totalBytes,
    ...(spec.error !== undefined ? { error: spec.error } : {}),
    ...(spec.speedBytesPerSec !== undefined ? { speed: spec.speedBytesPerSec } : {}),
  };
}

/** True when every file of the preset is downloaded: the card belongs
 * to Ready, not Available (PocketPal: finished models leave the set). */
export function isPresetDownloaded(models: ModelSpec[], preset: PresetModel): boolean {
  return preset.files.every((f) => {
    const spec = models.find((m) => m.id === presetSpecId(preset.id, f.name));
    return spec?.downloadStatus === "completed";
  });
}

export interface PresetCardState extends PresetFileState {
  downloaded: number;
  total: number;
  /** The spec actually downloading, so a collapsed card can cancel it
   * without knowing which quantization the user picked. */
  specId?: string;
}

export function presetCardState(models: ModelSpec[], preset: PresetModel): PresetCardState {
  const states = preset.files.map((f) => {
    const spec = models.find((m) => m.id === presetSpecId(preset.id, f.name));
    return { file: f, spec };
  });
  const downloading = states.find((s) => s.spec?.downloadStatus === "downloading");
  if (downloading?.spec) {
    return {
      status: "downloading",
      progress: downloading.spec.downloadProgress,
      downloaded: downloading.spec.downloadedBytes,
      total: downloading.spec.totalBytes,
      specId: downloading.spec.id,
      ...(downloading.spec.speedBytesPerSec !== undefined
        ? { speed: downloading.spec.speedBytesPerSec }
        : {}),
    };
  }
  const failed = states.find((s) => s.spec?.downloadStatus === "failed");
  if (failed?.spec) {
    return {
      status: "failed",
      progress: 0,
      downloaded: 0,
      total: 0,
      ...(failed.spec.error !== undefined ? { error: failed.spec.error } : {}),
    };
  }
  const specs = states.map((s) => s.spec);
  if (specs.length > 0 && specs.every((s) => s?.downloadStatus === "completed")) {
    return { status: "completed", progress: 100, downloaded: 0, total: 0 };
  }
  return { status: "idle", progress: 0, downloaded: 0, total: 0 };
}
