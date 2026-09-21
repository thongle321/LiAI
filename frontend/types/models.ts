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
  repo: string; // HF repo like "HuggingFaceTB/SmolLM-135M"
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
  private: boolean;
  ggufFiles: HFModelFile[];
}

export interface HFModelFile {
  name: string;
  size: number;
  path: string; // Path in the repo
  downloadUrl: string;
}

export interface DownloadJob {
  id: string;
  modelId: string;
  fileName: string;
  downloadUrl: string;
  destinationPath: string;
  status: ModelDownloadStatus;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
  resumable: boolean;
  pauseToken?: string;
}

export interface RemoteApiProvider {
  id: string;
  name: string;
  providerType: "custom_openai" | "openrouter";
  baseUrl: string;
  apiKey: string;
  modelName: string;
  isActive: boolean;
}

/** Probed capability snapshot per provider (PocketPal remoteCaps parity). */
export interface RemoteCaps {
  reachable: boolean;
  checkedAt: number;
}

/** Per-model overrides edited on the Models screen. */
export interface ModelSettings {
  displayName: string;
  systemPrompt: string;
  stopWords: string[];
}