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
  /** HF tags/siblings said this repo is a vision model. Recorded at build
   *  time so the toggle appears before a projector is ever paired — the
   *  filename-derived `type` misses repos like `gemma-3-4b-it`. */
  supportsVision?: boolean;
  /** Per-model vision switch: false loads the LLM blind even when a
   *  projector is paired. Absent = on (pocketpal parity). */
  visionEnabled?: boolean;
  /** The sibling mmproj files this model could be paired with, recorded at
   *  build time so the selector never re-hits the Hub. */
  projectorCandidates?: ModelFile[];
  /** HuggingFace repo page for this model (PocketPal `hfUrl`); absent
   *  for local/preset-only specs. */
  hfUrl?: string;
  /** The paired mmproj projector for a vision model (vision-series 01):
   *  recorded at download time from the repo's siblings and fetched right
   *  after the LLM lands, so ticket 02 can attach it at engine load. */
  projector?: ModelFile;
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
  /** Machine-readable failure kind; see DownloadErrorCode. */
  errorCode?: DownloadErrorCode;
  // Catalog metadata (PocketPal parity, minus companion features)
  params?: number; // parameter count, e.g. 135_000_000
  capabilities?: string[];
  /** Whether this model reasons at all (C6): true = known reasoner,
   *  false = known NON-reasoner, absent = unknown — which is the app's
   *  historic behaviour, unchanged for every model never classified.
   *  Typed on purpose: C6's schema decision rejected parsing the
   *  free-form `capabilities` above. User overrides live in the
   *  inference store's thinkingOverrides, not here. */
  reasoning?: boolean;
  /** Whether this model can call tools at all (PocketPal parity): true =
   *  known tool-capable, false = known NOT, absent = unknown — probed
   *  from llama.rn's jinja metadata when the model loads. A model that
   *  was never probed stays absent, because "never asked" is not the
   *  same claim as "asked and found wanting". */
  supportsTools?: boolean;
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

/** Why a download failed, in a form the UI can act on rather than parse out
 *  of a sentence. One member is the whole need today: it is the only
 *  failure with a one-tap fix. Anything else stays a plain message, so this
 *  earns a member when a real affordance appears for it, not before. */
export type DownloadErrorCode = "authentication";

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
  /** Machine-readable failure kind, when the UI can offer a fix for it. */
  errorCode?: DownloadErrorCode;
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
   *  Rule lives in one place: utils/guards.ts positiveFinite — remote-engine
   *  re-exports it as normalizeTimeoutMs. */
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
  /** The server's OWN generation defaults under wire names (06b,
   *  PocketPal props.ts readSamplerDefaults): informational only —
   *  remote turns never send sampler overrides, so these ARE the
   *  values in effect. Absent when the probe reported none. */
  samplerDefaults?: Record<string, number>;
}

/** Per-model overrides edited on the Models screen. */
export interface ModelSettings {
  displayName: string;
  systemPrompt: string;
  stopWords: string[];
  /** Which base-template preset the Edit Chat Template dialog has selected
   *  (PocketPal's config `name`). "custom" = the model default; absent on
   *  rows written before presets existed, which parse back as "custom".
   *  Stored so the picker shows the selection without matching template
   *  strings by content. */
  templateName?: string;
  /** Token overrides (PocketPal parity). BOS is persisted but not
   *  injected today — llama.rn applies the GGUF template's own BOS. */
  addBosToken: boolean;
  addEosToken: boolean;
  bosToken: string;
  eosToken: string;
  /** Forwarded to llama.rn's add_generation_prompt. Tri-state on purpose:
   *  absent = the user never touched it, so the model default (llama.cpp
   *  sends true) stands; an explicit false only arrives after the toggle
   *  is switched off, which is the whole point of the switch. */
  addGenerationPrompt?: boolean;
  /** Forwarded to llama.rn's chat_template; "" = model default. */
  chatTemplate: string;
}