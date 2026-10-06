/** Versioned store upgrades: prune-and-reconcile persisted models/providers.
 *
 * Pure + tested. Idempotent: runs unconditionally on every load, so no
 * version key is persisted anywhere.
 */

import type {
  ModelDownloadStatus,
  ModelSpec,
  RemoteApiProvider,
  RemoteCaps,
} from "../types/models";
import { asRecord, positiveFinite } from "./guards.ts";

const STATUSES: ModelDownloadStatus[] = [
  "idle",
  "downloading",
  "paused",
  "completed",
  "failed",
  "cancelled",
];

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** The one rule for ModelSpec.ggufMetadata: a plain record or nothing.
 *
 * Shared by the load path and by the GGUF header read, so a record is
 * never written that a restart would drop. A GGUF header is a native
 * read that has already been narrowed to scalars before it gets here;
 * this guards the shape of the field itself, not the header's contents. */
export function sanitizeGgufMetadata(
  raw: unknown,
): Record<string, unknown> | undefined {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : undefined;
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

  // Transient states never survive a restart: the download task handle is
  // in-memory, so a persisted "downloading" could never resume, and a
  // persisted error would paint the row forever. Retry starts clean.
  const live = status === "downloading" ? "idle" : status;

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

  // The paired projector record (vision-series 01): same guard shape as
  // files — a malformed pair is NO pair (undefined), never repaired into
  // a guess.
  const pr = asRecord(v.projector);
  const projector =
    pr &&
    typeof pr.name === "string" &&
    typeof pr.size === "number" &&
    typeof pr.downloadUrl === "string"
      ? { name: pr.name, size: pr.size, downloadUrl: pr.downloadUrl }
      : undefined;

  // Selector candidates (same guard as files). Older rows never recorded
  // them; they re-derive from the next HF search result.
  const projectorCandidates = Array.isArray(v.projectorCandidates)
    ? v.projectorCandidates.filter(
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
    : undefined;

  // Rows saved before the vision switch existed: infer vision-capability
  // from what the row already proves (a recorded pair, or the old
  // filename-derived type) rather than leaving the toggle invisible.
  const supportsVision =
    typeof v.supportsVision === "boolean"
      ? v.supportsVision
      : projector !== undefined || type === "vision";

  return {
    id: v.id,
    name: v.name,
    author: typeof v.author === "string" ? v.author : "Unknown",
    description: typeof v.description === "string" ? v.description : "",
    origin,
    type,
    files,
    supportsVision,
    ...(typeof v.visionEnabled === "boolean"
      ? { visionEnabled: v.visionEnabled }
      : {}),
    ...(projectorCandidates !== undefined && projectorCandidates.length > 0
      ? { projectorCandidates }
      : {}),
    ...(projector !== undefined ? { projector } : {}),
    providerType: v.providerType === "openrouter" || v.providerType === "custom_openai" || v.providerType === "local_gguf"
      ? v.providerType
      : undefined,
    baseUrl: typeof v.baseUrl === "string" ? v.baseUrl : undefined,
    apiKey: typeof v.apiKey === "string" ? v.apiKey : undefined,
    modelName: typeof v.modelName === "string" ? v.modelName : undefined,
    localPath: typeof v.localPath === "string" ? v.localPath : undefined,
    downloadStatus: live,
    downloadProgress: live === "idle" ? 0 : asNumber(v.downloadProgress, 0),
    downloadedBytes: live === "idle" ? 0 : asNumber(v.downloadedBytes, 0),
    totalBytes: asNumber(v.totalBytes, 0),
    error: undefined,
    params: typeof v.params === "number" && Number.isFinite(v.params) ? v.params : undefined,
    capabilities: Array.isArray(v.capabilities)
      ? v.capabilities.filter((c): c is string => typeof c === "string")
      : undefined,
    reasoning: typeof v.reasoning === "boolean" ? v.reasoning : undefined,
    ggufMetadata: sanitizeGgufMetadata(v.ggufMetadata),
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

/** Upgrade a persisted caps map; drops malformed entries.
 *  C7: capability fields survive ONLY alongside the model they describe —
 *  unkeyed fields could not be trusted — and invalid values drop. */
export function upgradeRemoteCaps(raw: unknown): Record<string, RemoteCaps> {
  const v = asRecord(raw);
  if (!v) return {};
  const out: Record<string, RemoteCaps> = {};
  for (const [key, entry] of Object.entries(v)) {
    const r = asRecord(entry);
    if (!r || typeof r.reachable !== "boolean") continue;
    const model = typeof r.model === "string" ? r.model : undefined;
    const contextLength = positiveFinite(r.contextLength);
    // 06b: finite numeric entries only; anything else drops — a
    // malformed defaults map is display data, not something to repair.
    const rawDefaults = asRecord(r.samplerDefaults);
    const samplerDefaults = rawDefaults
      ? Object.fromEntries(
          Object.entries(rawDefaults).filter(
            (entry): entry is [string, number] => {
              const value: unknown = entry[1];
              return typeof value === "number" && Number.isFinite(value);
            },
          ),
        )
      : undefined;
    out[key] = {
      reachable: r.reachable,
      checkedAt: asNumber(r.checkedAt, 0),
      ...(model !== undefined
        ? {
            model,
            ...(contextLength !== undefined ? { contextLength } : {}),
            ...(typeof r.supportsVision === "boolean"
              ? { supportsVision: r.supportsVision }
              : {}),
            ...(samplerDefaults !== undefined &&
            Object.keys(samplerDefaults).length > 0
              ? { samplerDefaults }
              : {}),
          }
        : {}),
    };
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
      // Persisted garbage must not arm a timer: the rule lives once, in
      // lib/guards (remote-engine re-exports it as normalizeTimeoutMs);
      // unset falls back to the default.
      timeoutMs: positiveFinite(v.timeoutMs),
    });
  }
  return out;
}
