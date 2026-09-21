/** Versioned store upgrades: prune-and-reconcile persisted models/providers.
 *
 * Pure + tested. Idempotent: safe to run on every load. Bumped via
 * MODEL_STORE_VERSION when shapes change again.
 */

import type {
  ModelDownloadStatus,
  ModelSpec,
  RemoteApiProvider,
} from "../types/models";

export const MODEL_STORE_VERSION = 1;

const STATUSES: ModelDownloadStatus[] = [
  "idle",
  "downloading",
  "paused",
  "completed",
  "failed",
  "cancelled",
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Upgrade one persisted model; null = prune (unrecognizable). */
export function upgradeModelSpec(raw: unknown): ModelSpec | null {
  const v = asRecord(raw);
  if (!v || typeof v.id !== "string" || typeof v.name !== "string") return null;

  const status =
    typeof v.downloadStatus === "string" &&
    (STATUSES as string[]).includes(v.downloadStatus)
      ? (v.downloadStatus as ModelDownloadStatus)
      : "idle";

  const files = Array.isArray(v.files)
    ? v.files.filter(
        (f): f is ModelSpec["files"][number] => {
          const r = asRecord(f);
          return (
            !!r &&
            typeof r.name === "string" &&
            typeof r.size === "number" &&
            typeof r.downloadUrl === "string"
          );
        },
      )
    : [];

  const origin =
    v.origin === "preset" ||
    v.origin === "huggingface" ||
    v.origin === "local" ||
    v.origin === "remote_api"
      ? v.origin
      : "local";

  const type = v.type === "vision" || v.type === "projection" ? v.type : "llm";

  return {
    id: v.id,
    name: v.name,
    author: typeof v.author === "string" ? v.author : "Unknown",
    description: typeof v.description === "string" ? v.description : "",
    origin,
    type,
    files,
    providerType: v.providerType === "openrouter" || v.providerType === "custom_openai" || v.providerType === "local_gguf"
      ? v.providerType
      : undefined,
    baseUrl: typeof v.baseUrl === "string" ? v.baseUrl : undefined,
    apiKey: typeof v.apiKey === "string" ? v.apiKey : undefined,
    modelName: typeof v.modelName === "string" ? v.modelName : undefined,
    localPath: typeof v.localPath === "string" ? v.localPath : undefined,
    downloadStatus: status,
    downloadProgress: asNumber(v.downloadProgress, 0),
    downloadedBytes: asNumber(v.downloadedBytes, 0),
    totalBytes: asNumber(v.totalBytes, 0),
    error: typeof v.error === "string" ? v.error : undefined,
    params: typeof v.params === "number" && Number.isFinite(v.params) ? v.params : undefined,
    capabilities: Array.isArray(v.capabilities)
      ? v.capabilities.filter((c): c is string => typeof c === "string")
      : undefined,
    ggufMetadata:
      v.ggufMetadata && typeof v.ggufMetadata === "object" && !Array.isArray(v.ggufMetadata)
        ? (v.ggufMetadata as Record<string, unknown>)
        : undefined,
  };
}

/** Upgrade a persisted model list; drops what can't be reconciled. */
export function upgradeModelList(raw: unknown): ModelSpec[] {
  if (!Array.isArray(raw)) return [];
  const out: ModelSpec[] = [];
  for (const entry of raw) {
    const upgraded = upgradeModelSpec(entry);
    if (upgraded) out.push(upgraded);
  }
  return out;
}

/** Upgrade persisted providers; apiKey hydrates from SecureStore separately. */
export function upgradeRemoteApis(raw: unknown): RemoteApiProvider[] {
  if (!Array.isArray(raw)) return [];
  const out: RemoteApiProvider[] = [];
  for (const entry of raw) {
    const v = asRecord(entry);
    if (
      !v ||
      typeof v.id !== "string" ||
      typeof v.name !== "string" ||
      typeof v.baseUrl !== "string" ||
      typeof v.modelName !== "string"
    ) {
      continue;
    }
    out.push({
      id: v.id,
      name: v.name,
      providerType: v.providerType === "openrouter" ? "openrouter" : "custom_openai",
      baseUrl: v.baseUrl,
      apiKey: "",
      modelName: v.modelName,
      isActive: v.isActive === true,
    });
  }
  return out;
}
