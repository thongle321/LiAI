import type {
  HFModelFile,
  HFModelSearchResult,
  ModelSpec,
  ModelType,
  PresetModel,
  PresetModelFile,
} from "@/types/models";
import { mmprojSiblings } from "./vision-pairing.ts";
import { isVisionModel } from "./hf-format.ts";
import { isDraftOnlyFilename } from "@/utils/draft-only.ts";

const HF_HUB_BASE = "https://huggingface.co";

export interface HFModelRef {
  modelId: string;
  author: string;
  name: string;
  description: string;
  tags?: string[];
  siblings?: HFModelFile[];
}

export function hfDownloadUrl(modelId: string, path: string): string {
  // Encode each segment but keep the separators: a repo can nest GGUFs in a
  // folder, and a filename with a space in it is otherwise a broken request.
  // Decoding first keeps an already-encoded segment from doubling up.
  const encoded = path
    .split("/")
    .map((seg) => {
      try {
        return encodeURIComponent(decodeURIComponent(seg));
      } catch {
        return encodeURIComponent(seg);
      }
    })
    .join("/");
  return `${HF_HUB_BASE}/${modelId}/resolve/main/${encoded}`;
}

/**
 * PocketPal parity: the HF token only ever leaves the device for huggingface.co.
 *
 * Exactly that host. A suffix match also accepts "evil-huggingface.co" and
 * "huggingface.co.attacker.net", which would post the user's token to whoever
 * registered the lookalike — and this predicate is the only thing standing
 * between a redirect and that leak.
 */
export function isHuggingFaceUrl(url: string): boolean {
  try {
    return new URL(url).hostname === "huggingface.co";
  } catch {
    return false;
  }
}

/** Best-effort repo metadata when a search result is no longer cached. */
export function hfRefFromId(modelId: string): HFModelRef {
  const [author, ...rest] = modelId.split("/");
  return { modelId, author, name: rest.join("/") || modelId, description: "" };
}

export function hfRefFromSearch(result: HFModelSearchResult): HFModelRef {
  return {
    modelId: result.modelId,
    author: result.author,
    name: result.name,
    description: result.description,
    tags: result.tags,
    siblings: result.ggufFiles,
  };
}

function inferModelType(fileName: string): ModelType {
  const name = fileName.toLowerCase();
  if (name.includes("vision") || name.includes("mmproj") || name.includes("clip")) {
    return "vision";
  }
  if (name.includes("projection") || name.includes("mmproj")) {
    return "projection";
  }
  return "llm";
}

/** Stable spec id for a preset file (persisted-state upgrades rely on it). */
export function presetSpecId(presetId: string, fileName: string): string {
  return `preset-${presetId}-${fileName}`;
}

/** Stable spec id for a search-result file (mirrors buildHfModelSpec). */
export function hfSpecId(modelId: string, fileName: string): string {
  return `hf-${modelId}-${fileName}`;
}

/** The HF repo a spec came from, parsed back from its first file URL.
 *
 *  The spec id embeds the modelId but with ambiguous separators (the file
 *  name may contain slashes too); a file's download URL is the unambiguous
 *  record: everything between the host and `/resolve/` IS the modelId.
 *  null for anything that is not a HF-resolve URL (presets, remotes). */
export function hfModelIdFromSpec(spec: Pick<ModelSpec, "files">): string | null {
  const url = spec.files[0]?.downloadUrl ?? "";
  try {
    const parsed = new URL(url);
    const path = parsed.pathname; // /<modelId>/resolve/main/<file>
    const marker = "/resolve/";
    const idx = path.indexOf(marker);
    if (idx < 1) return null;
    return decodeURIComponent(path.slice(1, idx));
  } catch {
    return null;
  }
}

export function buildHfModelSpec(ref: HFModelRef, file: HFModelFile): ModelSpec {
  // Vision facts recorded ONCE here, so the card's toggle, the selector and
  // the downloader all read the same answer instead of re-deriving it (the
  // old filename-derived `type` misses repos like `gemma-3-4b-it`).
  const siblings = ref.siblings;
  // Vision is decided per repo, but a speculative draft that merely lives
  // alongside an mmproj cannot use one — it would pull the projector down
  // for nothing and offer image attach on a model that never loads.
  // PocketPal parity: hfAsModel (pocketpal-ai/src/utils/index.ts:430).
  const isDraftOnly = isDraftOnlyFilename(file.name);
  const supportsVision =
    siblings !== undefined && !isDraftOnly
      ? isVisionModel(ref.tags ?? [], siblings.map((f) => f.name))
      : false;
  // The projector candidates follow the answer: a model that cannot see
  // images has no projector to choose.
  const projectorCandidates = supportsVision
    ? mmprojSiblings(siblings ?? []).map((f) => ({
        name: f.name,
        size: f.size,
        downloadUrl: f.downloadUrl,
      }))
    : [];
  return {
    id: hfSpecId(ref.modelId, file.name),
    name: `${ref.name} (${file.name})`,
    author: ref.author,
    description: ref.description,
    origin: "huggingface",
    type: inferModelType(file.name),
    supportsVision,
    ...(supportsVision ? { visionEnabled: true } : {}),
    ...(projectorCandidates.length > 0 ? { projectorCandidates } : {}),
    hfUrl: `https://huggingface.co/${ref.modelId}`,
    files: [
      { name: file.name, size: file.size, downloadUrl: file.downloadUrl, oid: file.oid },
    ],
    downloadStatus: "idle",
    downloadProgress: 0,
    downloadedBytes: 0,
    totalBytes: file.size,
  };
}

export function buildPresetModelSpec(
  preset: PresetModel,
  file: PresetModelFile,
): ModelSpec {
  return {
    id: presetSpecId(preset.id, file.name),
    name: `${preset.name} (${file.name})`,
    author: preset.author,
    description: preset.description,
    origin: "preset",
    type: preset.type,
    params: preset.params,
    capabilities: preset.capabilities,
    files: [
      { name: file.name, size: file.size, downloadUrl: file.downloadUrl },
    ],
    downloadStatus: "idle",
    downloadProgress: 0,
    downloadedBytes: 0,
    totalBytes: file.size,
  };
}
