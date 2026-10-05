/** Model types for the LiAI model management system. */

export type ModelOrigin = "preset" | "huggingface" | "local" | "remote_api";

export type ModelType = "llm" | "vision" | "projection";

export type ModelDownloadStatus =
  | "idle"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type ProviderType = "openrouter" | "custom_openai" | "local_gguf";

export interface ModelFile {
  name: string;
  size: number;
  downloadUrl: string;
  sha256?: string;
  /** LFS content id — how a bookmark recognizes its own file. */
  oid?: string;
}

export interface ModelSpec {
  id: string;
  name: string;
  author: string;
  description: string;
  origin: ModelOrigin;
  type: ModelType;
  files: ModelFile[];
  // For remote API providers
  providerType?: ProviderType;
  baseUrl?: string;
  apiKey?: string;
  modelName?: string;
  // For local GGUF
  localPath?: string;
  // Download state
  downloadStatus: ModelDownloadStatus;
  downloadProgress: number; // 0-100
  downloadedBytes: number;
  totalBytes: number;
  /** Live bytes/sec while downloading; transient, never persisted. */
  speedBytesPerSec?: number;
  error?: string;
  // Catalog metadata (PocketPal parity, minus pal features)
  params?: number; // parameter count, e.g. 135_000_000
  capabilities?: string[];
  ggufMetadata?: Record<string, unknown>;
}

export interface PresetModel {
  id: string;
  name: string;
  author: string;
  description: string;
  repo: string; // HF repo like "ggml-org/gemma-3-1b-it-GGUF"
  files: PresetModelFile[];
  type: ModelType;
  recommended?: boolean;
  params?: number;
  capabilities?: string[];
}

export interface PresetModelFile {
  name: string;
  size: number;
  downloadUrl: string;
  quantization?: string; // e.g., "Q4_K_M", "Q8_0"
}

export interface HFModelSearchResult {
  modelId: string;
  author: string;
  name: string;
  description: string;
  tags: string[];
  downloads: number;
  likes: number;
  /** Hub's "requires token" flag (what PocketPal calls gated). */
  gated: boolean;
  /** ISO date, for the "Updated 3 days ago" chips. */
  lastModified?: string;
  /** >20 earns the trending flame in the details header. */
  trendingScore?: number;
  ggufFiles: HFModelFile[];
}

export interface HFModelFile {
  name: string;
  size: number;
  path: string; // Path in the repo
  downloadUrl: string;
  /** LFS content id — the identity a bookmark is remembered by. */
  oid?: string;
}

export interface DownloadJob {
  id: string;
  modelId: string;
  fileName: string;
  downloadUrl: string;
  /** Auth headers for gated URLs (HF token); absent for public files. */
  headers?: Record<string, string>;
  destinationPath: string;
  status: ModelDownloadStatus;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
  resumable: boolean;
  pauseToken?: string;
  /** Live bytes/sec while downloading; computed per progress callback. */
  speedBytesPerSec?: number;
}

export interface RemoteApiProvider {
  id: string;
  name: string;
  providerType: "custom_openai" | "openrouter";
  baseUrl: string;
  apiKey: string;
  modelName: string;
  isActive: boolean;
  /** Per-provider request timeout in ms; absent/invalid = engine default.
   *  Rule lives in one place: remote-engine's normalizeTimeoutMs. */
  timeoutMs?: number;
}

/** Probed capability snapshot per provider (PocketPal remoteCaps parity).
 *  Capability fields describe ONE model — `model` records which — so a
 *  provider that switches models starts fresh (store strips them) and a
 *  merge never carries a field across models. An ABSENT capability field
 *  means UNKNOWN: never coerced to zero or false ("unsupported" is a
 *  claim a failed probe must not make). */
export interface RemoteCaps {
  reachable: boolean;
  checkedAt: number;
  /** The model this snapshot describes; absent on legacy records. */
  model?: string;
  /** Context window (n_ctx) as reported by /props; absent = unknown. */
  contextLength?: number;
  /** Vision modality, only when the body described a loaded model AND
   *  reported modalities; absent = unknown. */
  supportsVision?: boolean;
}

/** Per-model overrides edited on the Models screen. */
export interface ModelSettings {
  displayName: string;
  systemPrompt: string;
  stopWords: string[];
}