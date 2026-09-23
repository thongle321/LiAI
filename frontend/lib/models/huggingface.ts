/** Hugging Face model source: presets, search, file listing, spec builders.
 *
 * Plain functions — no strategy interface/registry (there is exactly one
 * Hugging Face source, so the indirection bought nothing). Spec ids stay
 * stable for persisted-state upgrades:
 *   preset-<presetId>-<fileName>   hf-<modelId>-<fileName>
 */

import type {
  ModelSpec,
  ModelType,
  PresetModel,
  PresetModelFile,
  HFModelSearchResult,
  HFModelFile,
} from "../../types/models";

const HF_API_BASE = "https://huggingface.co/api";
const HF_HUB_BASE = "https://huggingface.co";

/** Minimal shape of the HF models API we actually read. */
interface HFSearchItem {
  modelId: string;
  cardData?: { description?: string };
  tags?: string[];
  downloads?: number;
  likes?: number;
  private?: boolean;
}

/** Minimal shape of the HF tree API we actually read. */
interface HFTreeItem {
  type?: string;
  path: string;
  size?: number;
}

/** Everything the spec builder needs about a repo, independent of search. */
export interface HFModelRef {
  modelId: string;
  author: string;
  name: string;
  description: string;
}

const PRESETS: PresetModel[] = [
  {
    id: "smollm-135m",
    name: "SmolLM-135M",
    author: "HuggingFaceTB",
    description: "Ultra-compact 135M parameter model for mobile",
    repo: "HuggingFaceTB/SmolLM-135M",
    type: "llm",
    params: 135_000_000,
    recommended: true,
    files: [
      {
        name: "SmolLM-135M-Q4_K_M.gguf",
        size: 92_000_000,
        downloadUrl:
          "https://huggingface.co/HuggingFaceTB/SmolLM-135M-GGUF/resolve/main/SmolLM-135M-Q4_K_M.gguf",
        quantization: "Q4_K_M",
      },
      {
        name: "SmolLM-135M-Q8_0.gguf",
        size: 160_000_000,
        downloadUrl:
          "https://huggingface.co/HuggingFaceTB/SmolLM-135M-GGUF/resolve/main/SmolLM-135M-Q8_0.gguf",
        quantization: "Q8_0",
      },
    ],
  },
  {
    id: "smollm-360m",
    name: "SmolLM-360M",
    author: "HuggingFaceTB",
    description: "Compact 360M parameter model with better quality",
    repo: "HuggingFaceTB/SmolLM-360M",
    type: "llm",
    params: 360_000_000,
    files: [
      {
        name: "SmolLM-360M-Q4_K_M.gguf",
        size: 230_000_000,
        downloadUrl:
          "https://huggingface.co/HuggingFaceTB/SmolLM-360M-GGUF/resolve/main/SmolLM-360M-Q4_K_M.gguf",
        quantization: "Q4_K_M",
      },
      {
        name: "SmolLM-360M-Q8_0.gguf",
        size: 400_000_000,
        downloadUrl:
          "https://huggingface.co/HuggingFaceTB/SmolLM-360M-GGUF/resolve/main/SmolLM-360M-Q8_0.gguf",
        quantization: "Q8_0",
      },
    ],
  },
  {
    id: "qwen2.5-0.5b",
    name: "Qwen2.5-0.5B",
    author: "Qwen",
    description: "Strong 0.5B model from Alibaba",
    repo: "Qwen/Qwen2.5-0.5B",
    type: "llm",
    params: 500_000_000,
    recommended: true,
    files: [
      {
        name: "Qwen2.5-0.5B-Q4_K_M.gguf",
        size: 350_000_000,
        downloadUrl:
          "https://huggingface.co/Qwen/Qwen2.5-0.5B-GGUF/resolve/main/Qwen2.5-0.5B-Q4_K_M.gguf",
        quantization: "Q4_K_M",
      },
      {
        name: "Qwen2.5-0.5B-Q8_0.gguf",
        size: 600_000_000,
        downloadUrl:
          "https://huggingface.co/Qwen/Qwen2.5-0.5B-GGUF/resolve/main/Qwen2.5-0.5B-Q8_0.gguf",
        quantization: "Q8_0",
      },
    ],
  },
  {
    id: "llama-3.2-1b",
    name: "Llama 3.2 1B",
    author: "Meta",
    description: "Meta's compact 1B parameter model",
    repo: "meta-llama/Llama-3.2-1B",
    type: "llm",
    params: 1_000_000_000,
    files: [
      {
        name: "Llama-3.2-1B-Q4_K_M.gguf",
        size: 700_000_000,
        downloadUrl:
          "https://huggingface.co/bartowski/Llama-3.2-1B-GGUF/resolve/main/Llama-3.2-1B-Q4_K_M.gguf",
        quantization: "Q4_K_M",
      },
    ],
  },
  {
    id: "gemma-2-2b",
    name: "Gemma 2 2B",
    author: "Google",
    description: "Google's efficient 2B model",
    repo: "google/gemma-2-2b",
    type: "llm",
    params: 2_000_000_000,
    files: [
      {
        name: "gemma-2-2b-Q4_K_M.gguf",
        size: 1_400_000_000,
        downloadUrl:
          "https://huggingface.co/bartowski/gemma-2-2b-GGUF/resolve/main/gemma-2-2b-Q4_K_M.gguf",
        quantization: "Q4_K_M",
      },
    ],
  },
];

export async function getPresets(): Promise<PresetModel[]> {
  return PRESETS;
}

function authHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function searchModels(
  query: string,
  token?: string,
): Promise<HFModelSearchResult[]> {
  const params = new URLSearchParams({
    search: query,
    filter: "gguf",
    limit: "20",
    sort: "downloads",
  });

  const response = await fetch(`${HF_API_BASE}/models?${params}`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw new Error(`HF search failed: ${response.status}`);
  }

  const data = (await response.json()) as HFSearchItem[];
  return data
    .filter((m) => m.private === false)
    .map((m) => ({
      modelId: m.modelId,
      author: m.modelId.split("/")[0],
      name: m.modelId.split("/")[1],
      description: m.cardData?.description || "",
      tags: m.tags || [],
      downloads: m.downloads || 0,
      likes: m.likes || 0,
      private: m.private || false,
      ggufFiles: [],
    }));
}

export async function getModelFiles(
  modelId: string,
  token?: string,
): Promise<HFModelFile[]> {
  const response = await fetch(`${HF_API_BASE}/models/${modelId}/tree/main`, {
    headers: authHeaders(token),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch model files: ${response.status}`);
  }

  const data = (await response.json()) as HFTreeItem[];
  return data
    .filter((f) => f.type === "file" && f.path.toLowerCase().endsWith(".gguf"))
    .map((f) => ({
      name: f.path.split("/").pop() || f.path,
      size: f.size || 0,
      path: f.path,
      downloadUrl: hfDownloadUrl(modelId, f.path),
    }));
}

export function hfDownloadUrl(modelId: string, path: string): string {
  return `${HF_HUB_BASE}/${modelId}/resolve/main/${path}`;
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

export function buildHfModelSpec(ref: HFModelRef, file: HFModelFile): ModelSpec {
  return {
    id: `hf-${ref.modelId}-${file.name}`,
    name: `${ref.name} (${file.name})`,
    author: ref.author,
    description: ref.description,
    origin: "huggingface",
    type: inferModelType(file.name),
    files: [
      { name: file.name, size: file.size, downloadUrl: file.downloadUrl },
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
    id: `preset-${preset.id}-${file.name}`,
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
