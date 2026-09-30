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

import { hfSortParams, nextPageFromLink, type HFSortBy } from "./hf-format.ts";

const HF_HUB_BASE = "https://huggingface.co";
const HF_API_BASE = "https://huggingface.co/api";

/** Ceiling on any single Hub request, so a stalled socket cannot leave the
 * search spinner up forever. */
const HUB_TIMEOUT_MS = 15000;

/** Our attribution for outbound Hugging Face requests (PocketPal parity:
 * they send PocketPal/<v>; HF's CDN refuses anonymous clients).
 * Version mirrors app.json — bump together. */
export const HF_USER_AGENT = "LiAI/1.0.0";

/** Wire shape of the HF browse proxy (verbatim HF rows we actually read). */
interface HFSearchItem {
  modelId: string;
  cardData?: { description?: string };
  tags?: string[];
  downloads?: number;
  likes?: number;
  private?: boolean;
  gated?: boolean | string;
  lastModified?: string;
  trendingScore?: number;
}

/** Wire shape of the HF tree proxy (verbatim HF rows we actually read). */
interface HFTreeItem {
  type?: string;
  path: string;
  size?: number;
  /** LFS rows carry the true byte size and the content id a bookmark
   * is remembered by (`oid`). */
  lfs?: { size?: number; oid?: string };
}

/** GGUF specs from `?expand[]=gguf` — decoration for the detail view. */
export interface HFModelSpecs {
  gguf?: {
    parameters?: Record<string, { total?: number }>;
  };
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
    id: "gemma-3-1b",
    name: "Gemma 3 1B",
    author: "ggml-org",
    description: "Google's 1B instruction model, official ggml mirror",
    repo: "ggml-org/gemma-3-1b-it-GGUF",
    type: "llm",
    params: 999_885_952,
    recommended: true,
    files: [
      {
        name: "gemma-3-1b-it-Q4_K_M.gguf",
        size: 806_058_240,
        downloadUrl:
          "https://huggingface.co/ggml-org/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf",
        quantization: "Q4_K_M",
      },
    ],
  },
  {
    id: "bonsai-1.7b",
    name: "Bonsai 1.7B",
    author: "prism-ml",
    description: "Tiny 1.7B model in 1-bit quant — very fast, very small",
    repo: "prism-ml/Bonsai-1.7B-gguf",
    type: "llm",
    params: 1_720_028_160,
    files: [
      {
        name: "Bonsai-1.7B-Q1_0.gguf",
        size: 248_302_272,
        downloadUrl:
          "https://huggingface.co/prism-ml/Bonsai-1.7B-gguf/resolve/main/Bonsai-1.7B-Q1_0.gguf",
        quantization: "Q1_0",
      },
    ],
  },
  {
    id: "qwen3-0.6b",
    name: "Qwen3 0.6B",
    author: "bartowski",
    description: "Compact 0.6B Alibaba model, community GGUF",
    repo: "bartowski/Qwen_Qwen3-0.6B-GGUF",
    type: "llm",
    params: 751_632_384,
    files: [
      {
        name: "Qwen_Qwen3-0.6B-Q4_K_M.gguf",
        size: 484_220_320,
        downloadUrl:
          "https://huggingface.co/bartowski/Qwen_Qwen3-0.6B-GGUF/resolve/main/Qwen_Qwen3-0.6B-Q4_K_M.gguf",
        quantization: "Q4_K_M",
      },
    ],
  },
  {
    id: "lfm2.5-350m",
    name: "LFM2.5 350M",
    author: "LiquidAI",
    description: "Ultra-compact 350M model — fastest option",
    repo: "LiquidAI/LFM2.5-350M-GGUF",
    type: "llm",
    params: 354_483_968,
    files: [
      {
        name: "LFM2.5-350M-Q4_K_M.gguf",
        size: 229_312_224,
        downloadUrl:
          "https://huggingface.co/LiquidAI/LFM2.5-350M-GGUF/resolve/main/LFM2.5-350M-Q4_K_M.gguf",
        quantization: "Q4_K_M",
      },
    ],
  },
  {
    id: "smollm3-3b",
    name: "SmolLM3 3B",
    author: "bartowski",
    description: "Strong 3B all-rounder, community GGUF",
    repo: "bartowski/HuggingFaceTB_SmolLM3-3B-GGUF",
    type: "llm",
    params: 3_075_098_624,
    recommended: true,
    files: [
      {
        name: "HuggingFaceTB_SmolLM3-3B-Q4_0.gguf",
        size: 1_811_455_808,
        downloadUrl:
          "https://huggingface.co/bartowski/HuggingFaceTB_SmolLM3-3B-GGUF/resolve/main/HuggingFaceTB_SmolLM3-3B-Q4_0.gguf",
        quantization: "Q4_0",
      },
    ],
  },
  {
    id: "lfm2-2.6b",
    name: "LFM2 2.6B",
    author: "LiquidAI",
    description: "Efficient 2.6B hybrid model",
    repo: "LiquidAI/LFM2-2.6B-GGUF",
    type: "llm",
    params: 2_569_272_320,
    files: [
      {
        name: "LFM2-2.6B-Q4_K_M.gguf",
        size: 1_563_668_704,
        downloadUrl:
          "https://huggingface.co/LiquidAI/LFM2-2.6B-GGUF/resolve/main/LFM2-2.6B-Q4_K_M.gguf",
        quantization: "Q4_K_M",
      },
    ],
  },
  {
    id: "qwen3-1.7b",
    name: "Qwen3 1.7B",
    author: "bartowski",
    description: "Capable 1.7B Alibaba model, community GGUF",
    repo: "bartowski/Qwen_Qwen3-1.7B-GGUF",
    type: "llm",
    params: 2_031_739_904,
    files: [
      {
        name: "Qwen_Qwen3-1.7B-Q4_K_M.gguf",
        size: 1_282_439_584,
        downloadUrl:
          "https://huggingface.co/bartowski/Qwen_Qwen3-1.7B-GGUF/resolve/main/Qwen_Qwen3-1.7B-Q4_K_M.gguf",
        quantization: "Q4_K_M",
      },
    ],
  },
  {
    id: "lfm2.5-1.2b",
    name: "LFM2.5 1.2B",
    author: "LiquidAI",
    description: "Fast 1.2B instruction model, good first download",
    repo: "LiquidAI/LFM2.5-1.2B-Instruct-GGUF",
    type: "llm",
    params: 1_170_340_608,
    files: [
      {
        name: "LFM2.5-1.2B-Instruct-Q4_K_M.gguf",
        size: 730_895_168,
        downloadUrl:
          "https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF/resolve/main/LFM2.5-1.2B-Instruct-Q4_K_M.gguf",
        quantization: "Q4_K_M",
      },
    ],
  },
  {
    id: "lfm2-vl-1.6b",
    name: "LFM2-VL 1.6B",
    author: "LiquidAI",
    description: "Vision-capable 1.6B model — text chat now, camera vision later",
    repo: "LiquidAI/LFM2-VL-1.6B-GGUF",
    type: "vision",
    params: 1_170_340_608,
    files: [
      {
        name: "LFM2-VL-1.6B-Q4_0.gguf",
        size: 695_750_048,
        downloadUrl:
          "https://huggingface.co/LiquidAI/LFM2-VL-1.6B-GGUF/resolve/main/LFM2-VL-1.6B-Q4_0.gguf",
        quantization: "Q4_0",
      },
    ],
  },
  {
    id: "bonsai-8b",
    name: "Bonsai 8B",
    author: "prism-ml",
    description: "Full 8B model in 1-bit quant — small file, big brain",
    repo: "prism-ml/Bonsai-8B-gguf",
    type: "llm",
    params: 8_188_548_096,
    files: [
      {
        name: "Bonsai-8B-Q1_0.gguf",
        size: 1_158_654_496,
        downloadUrl:
          "https://huggingface.co/prism-ml/Bonsai-8B-gguf/resolve/main/Bonsai-8B-Q1_0.gguf",
        quantization: "Q1_0",
      },
    ],
  },
  {
    id: "gemma-3-4b",
    name: "Gemma 3 4B",
    author: "unsloth",
    description: "Capable 4B instruction model, community GGUF",
    repo: "unsloth/gemma-3-4b-it-GGUF",
    type: "llm",
    params: 3_880_263_168,
    recommended: true,
    files: [
      {
        name: "gemma-3-4b-it-Q4_0.gguf",
        size: 2_370_065_536,
        downloadUrl:
          "https://huggingface.co/unsloth/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_0.gguf",
        quantization: "Q4_0",
      },
    ],
  },
  {
    id: "gemma-4-e2b",
    name: "Gemma 4 E2B",
    author: "unsloth",
    description: "Efficient multimodal 4.6B model — text chat now, camera vision later",
    repo: "unsloth/gemma-4-E2B-it-GGUF",
    type: "vision",
    params: 4_647_450_147,
    files: [
      {
        name: "gemma-4-E2B-it-Q4_0.gguf",
        size: 3_041_376_384,
        downloadUrl:
          "https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_0.gguf",
        quantization: "Q4_0",
      },
    ],
  },
  {
    id: "phi-4-mini",
    name: "Phi-4 Mini",
    author: "bartowski",
    description: "Microsoft's 3.8B reasoning-strong mini model",
    repo: "bartowski/microsoft_Phi-4-mini-instruct-GGUF",
    type: "llm",
    params: 3_836_021_856,
    files: [
      {
        name: "microsoft_Phi-4-mini-instruct-Q4_0.gguf",
        size: 2_331_442_560,
        downloadUrl:
          "https://huggingface.co/bartowski/microsoft_Phi-4-mini-instruct-GGUF/resolve/main/microsoft_Phi-4-mini-instruct-Q4_0.gguf",
        quantization: "Q4_0",
      },
    ],
  },
  {
    id: "bonsai-4b",
    name: "Bonsai 4B",
    author: "prism-ml",
    description: "4B model in 1-bit quant — half a gig, punches up",
    repo: "prism-ml/Bonsai-4B-gguf",
    type: "llm",
    params: 4_021_784_576,
    files: [
      {
        name: "Bonsai-4B-Q1_0.gguf",
        size: 572_270_624,
        downloadUrl:
          "https://huggingface.co/prism-ml/Bonsai-4B-gguf/resolve/main/Bonsai-4B-Q1_0.gguf",
        quantization: "Q1_0",
      },
    ],
  },
  {
    id: "gemma-4-e4b",
    name: "Gemma 4 E4B",
    author: "unsloth",
    description: "Large 7.5B multimodal model — needs a recent phone",
    repo: "unsloth/gemma-4-E4B-it-GGUF",
    type: "vision",
    params: 7_518_069_290,
    files: [
      {
        name: "gemma-4-E4B-it-Q4_0.gguf",
        size: 4_836_000_928,
        downloadUrl:
          "https://huggingface.co/unsloth/gemma-4-E4B-it-GGUF/resolve/main/gemma-4-E4B-it-Q4_0.gguf",
        quantization: "Q4_0",
      },
    ],
  },
  {
    id: "lfm2.5-8b-a1b",
    name: "LFM2.5 8B-A1B",
    author: "LiquidAI",
    description: "Mixture-of-experts 8B — needs a recent phone",
    repo: "LiquidAI/LFM2.5-8B-A1B-GGUF",
    type: "llm",
    params: 8_467_856_832,
    files: [
      {
        name: "LFM2.5-8B-A1B-Q4_0.gguf",
        size: 4_844_678_368,
        downloadUrl:
          "https://huggingface.co/LiquidAI/LFM2.5-8B-A1B-GGUF/resolve/main/LFM2.5-8B-A1B-Q4_0.gguf",
        quantization: "Q4_0",
      },
    ],
  },
  {
    id: "ministral-3-3b",
    name: "Ministral 3 3B",
    author: "bartowski",
    description: "Mistral's efficient 3B instruction model",
    repo: "bartowski/mistralai_Ministral-3-3B-Instruct-2512-GGUF",
    type: "llm",
    params: 3_429_006_336,
    files: [
      {
        name: "mistralai_Ministral-3-3B-Instruct-2512-Q4_0.gguf",
        size: 2_046_375_904,
        downloadUrl:
          "https://huggingface.co/bartowski/mistralai_Ministral-3-3B-Instruct-2512-GGUF/resolve/main/mistralai_Ministral-3-3B-Instruct-2512-Q4_0.gguf",
        quantization: "Q4_0",
      },
    ],
  },
  {
    id: "qwen3.5-4b",
    name: "Qwen3.5 4B",
    author: "unsloth",
    description: "Strong 4B all-rounder, community GGUF",
    repo: "unsloth/Qwen3.5-4B-GGUF",
    type: "llm",
    params: 4_205_751_296,
    files: [
      {
        name: "Qwen3.5-4B-Q4_0.gguf",
        size: 2_583_221_408,
        downloadUrl:
          "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_0.gguf",
        quantization: "Q4_0",
      },
    ],
  },
];

export async function getPresets(): Promise<PresetModel[]> {
  return PRESETS;
}

/** Caller abort plus our own ceiling. AbortSignal.any keeps both; where it
 * is missing (older Hermes) we keep the caller's signal alone, because
 * dropping the 15s timeout is survivable while ignoring a supersede is not. */
function hubSignal(external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(HUB_TIMEOUT_MS);
  if (!external) return timeout;
  return typeof AbortSignal.any === "function"
    ? AbortSignal.any([external, timeout])
    : external;
}

/** A Hub failure the UI can act on: 401/403 is `authentication`, which is
 * what surfaces the "Disable Token & Retry" escape hatch (PocketPal
 * carries the same code on its ErrorState). */
export class HfError extends Error {
  // An explicit field, NOT a constructor parameter property: node's
  // strip-only type stripping (node --test) rejects parameter properties.
  readonly code: "authentication" | "network" | "unknown";

  constructor(message: string, code: "authentication" | "network" | "unknown") {
    super(message);
    this.name = "HfError";
    this.code = code;
  }
}

interface HubPage {
  rows: unknown[];
  /** The `Link: …; rel="next"` URL, when there is a next page. */
  link: string | null;
}

async function hubFetch(
  url: string,
  token: string | undefined,
  fallback: string,
  externalSignal?: AbortSignal,
): Promise<HubPage> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": HF_USER_AGENT,
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "GET",
      headers,
      signal: hubSignal(externalSignal),
    });
  } catch (error) {
    // The UI renders this message verbatim, so the raw fetch text
    // ("Network request failed", "The operation was aborted") must not
    // escape. Keep it in the log, hand the screen the clean fallback.
    console.warn(`[huggingface] ${fallback}:`, error);
    throw new HfError(fallback, "network");
  }
  if (resp.status === 401 || resp.status === 403) {
    throw new HfError("check your Hugging Face token", "authentication");
  }
  if (!resp.ok) throw new HfError(fallback, "unknown");
  let data: unknown;
  try {
    data = await resp.json();
  } catch {
    throw new HfError(fallback, "unknown");
  }
  if (!Array.isArray(data)) throw new HfError(fallback, "unknown");
  return { rows: data, link: nextPageFromLink(resp.headers.get("Link")) };
}

/** Direct Hub GET: Bearer token header, verbatim JSON list, Error surfacing. */
async function hubGet<T>(
  url: string,
  token: string | undefined,
  fallback: string,
  externalSignal?: AbortSignal,
): Promise<T[]> {
  // SAFETY: Array.isArray proves list shape at runtime; T only documents
  // which verbatim Hub row fields the mapper below reads (no coercion).
  return (await hubFetch(url, token, fallback, externalSignal)).rows as T[];
}

export interface HFSearchOptions {
  author?: string;
  sortBy?: HFSortBy;
  /** A `Link` URL from a previous page; fetches that page instead. */
  pageUrl?: string;
}

export interface HFSearchPage {
  results: HFModelSearchResult[];
  nextPageLink: string | null;
}

/** PocketPal parity: an EMPTY query is still a search — the Hub answers
 * with its default (relevance) listing, which is what the sheet shows
 * before you type. `author` and `sortBy` carry the filter-sheet values. */
export async function searchModels(
  query: string,
  token?: string,
  signal?: AbortSignal,
  options: HFSearchOptions = {},
): Promise<HFSearchPage> {
  const { author, sortBy = "relevance", pageUrl } = options;
  const url =
    pageUrl ??
    (() => {
      const params = new URLSearchParams({
        search: query.trim(),
        // conversational keeps chat-tuned GGUFs in; full/config bring
        // the row data the details view reads.
        filter: "gguf,conversational",
        full: "true",
        config: "true",
        limit: "10",
        ...hfSortParams(sortBy),
      });
      if (author?.trim()) params.set("author", author.trim());
      return `${HF_API_BASE}/models?${params}`;
    })();
  const { rows, link } = await hubFetch(url, token, "Search failed", signal);
  // No visibility filter: HF scopes results to what the token may see,
  // and gated rows are downloadable now that downloads carry the token.
  const results = (rows as HFSearchItem[]).map((m) => ({
    modelId: m.modelId,
    author: m.modelId.split("/")[0],
    name: m.modelId.split("/")[1],
    description: m.cardData?.description || "",
    tags: m.tags || [],
    downloads: m.downloads || 0,
    likes: m.likes || 0,
    gated: Boolean(m.gated),
    lastModified: m.lastModified,
    trendingScore: m.trendingScore || 0,
    ggufFiles: [],
  }));
  return { results, nextPageLink: link };
}

/** recursive=true so projector files nested in subfolders show up —
 * the vision size breakdown pairs an LLM with its mmproj. `oid` is the
 * identity a bookmark is remembered by. */
export async function getModelFiles(
  modelId: string,
  token?: string,
): Promise<HFModelFile[]> {
  if (modelId.trim() === "") return [];
  const data = await hubGet<HFTreeItem>(
    `${HF_API_BASE}/models/${modelId.trim()}/tree/main?recursive=true`,
    token,
    "Failed to fetch model files",
  );
  return data
    .filter((f) => f.type === "file" && f.path.toLowerCase().endsWith(".gguf"))
    .map((f) => ({
      name: f.path.split("/").pop() || f.path,
      size: f.lfs?.size ?? f.size ?? 0,
      path: f.path,
      downloadUrl: hfDownloadUrl(modelId, f.path),
      oid: f.lfs?.oid,
    }));
}

/** GGUF specs (`?expand[]=gguf`): what the detail view needs to size a
 * vision model and report its parameter count. */
export async function getModelSpecs(
  modelId: string,
  token?: string,
): Promise<HFModelSpecs> {
  if (modelId.trim() === "") return {};
  try {
    const info = await hubGet<{
      gguf?: { parameters?: Record<string, { total?: number }> };
    }>(
      `${HF_API_BASE}/models/${encodeURIComponent(modelId.trim())}?expand[]=gguf`,
      token,
      "Failed to fetch model specs",
    );
    return { gguf: info[0]?.gguf ?? {} };
  } catch {
    // Specs are decoration (a count, a pairing hint): the file list is
    // still usable without them, so a failure must not blank the sheet.
    return {};
  }
}

export function hfDownloadUrl(modelId: string, path: string): string {
  return `${HF_HUB_BASE}/${modelId}/resolve/main/${path}`;
}

/** PocketPal parity: the HF token only ever leaves the device for huggingface.co. */
export function isHuggingFaceUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("huggingface.co");
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

export function buildHfModelSpec(ref: HFModelRef, file: HFModelFile): ModelSpec {
  return {
    id: hfSpecId(ref.modelId, file.name),
    name: `${ref.name} (${file.name})`,
    author: ref.author,
    description: ref.description,
    origin: "huggingface",
    type: inferModelType(file.name),
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
