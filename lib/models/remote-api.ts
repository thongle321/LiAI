/** Remote (OpenAI-compatible) API source: validation + spec builder.
 *
 * Plain functions — no strategy interface. The store calls these directly.
 * Spec id stays stable for persisted-state upgrades: remote-<providerId>.
 */

import type {
  ModelSpec,
  RemoteApiProvider,
  RemoteCaps,
} from "../../types/models";
import { asRecord, positiveFinite } from "../guards.ts";

/** Capability fields a /props probe can report (everything but the
 *  reachability bookkeeping the store owns). */
export type RemoteCapsFields = Pick<RemoteCaps, "contextLength" | "supportsVision">;

/** Fire-and-forget probe: bounded tighter than the 10s validation
 *  timeout, PocketPal's PROPS_TIMEOUT_MS rationale — a probe must
 *  neither inherit the connection default nor a user-set timeout. */
const PROBE_TIMEOUT_MS = 5000;

/** Fetch a llama.cpp-family server's GET /props for ONE provider.
 *
 *  NEVER THROWS: a timeout, a 401, a non-2xx, a malformed body or a
 *  fetch that throws synchronously all resolve to no fields — a failure
 *  is never evidence of absence, so it can never blank a capability the
 *  store already knows ("unknown", never "unsupported").
 *
 *  `/props` is llama.cpp-specific (PocketPal asks profileFor(type).hasProps);
 *  here the server type is the only discriminator, so only
 *  `custom_openai` is probed — a hosted OpenRouter endpoint never gets
 *  the request. The URL is scoped `?model=<modelName>` because a
 *  multi-model router answers the bare form with a placeholder
 *  (model_path "none", n_ctx 0) that describes no loaded model; such a
 *  body is discarded, not believed.
 *
 *  Key names verified against live llama.cpp builds (PocketPal props.ts):
 *  context window is `default_generation_settings.n_ctx` with top-level
 *  `n_ctx` as the older-build fallback; vision is `modalities.vision` —
 *  and only read when the body actually REPORTS modalities, so silence
 *  stays unknown instead of becoming a confident `false`. */
export async function probeRemoteCaps(
  provider: RemoteApiProvider,
  fetchImpl: typeof fetch = fetch,
): Promise<RemoteCapsFields> {
  if (provider.providerType !== "custom_openai") return {};
  try {
    const baseUrl = provider.baseUrl.replace(/\/$/, "");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (provider.apiKey && provider.apiKey !== "not-required") {
      headers.Authorization = `Bearer ${provider.apiKey}`;
    }
    const response = await fetchImpl(
      `${baseUrl}/props?model=${encodeURIComponent(provider.modelName)}`,
      { method: "GET", headers, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) },
    );
    if (!response.ok) return {};
    const body = asRecord(await response.json());
    if (!body) return {};

    const caps: RemoteCapsFields = {};
    const defaults = asRecord(body["default_generation_settings"]);
    const nCtx = defaults ? defaults["n_ctx"] : undefined;
    const rawCtx = nCtx !== undefined ? nCtx : body["n_ctx"];
    const contextLength = positiveFinite(rawCtx);
    if (contextLength !== undefined) caps.contextLength = contextLength;

    const modelPath = body["model_path"];
    const describesModel =
      (typeof modelPath === "string" && modelPath !== "" && modelPath !== "none") ||
      caps.contextLength !== undefined;
    if (!describesModel) return {};

    const modalities = asRecord(body["modalities"]);
    if (modalities) caps.supportsVision = modalities["vision"] === true;
    return caps;
  } catch {
    return {};
  }
}

/** Field-wise merge of a fresh validation/probe result into stored caps.
 *
 *  Reported fields win; ABSENT fields keep what was known — a failed or
 *  /props-less probe must never blank a measured capability. Model-level
 *  fields survive only when they describe the SAME model: caps are keyed
 *  per model, never per server, so a model switch starts fresh. */
export function mergeRemoteCaps(
  previous: RemoteCaps | undefined,
  next: RemoteCaps,
): RemoteCaps {
  const prior =
    previous !== undefined && previous.model === next.model
      ? previous
      : undefined;
  const caps: RemoteCaps = { ...next };
  if (caps.contextLength === undefined && prior?.contextLength !== undefined) {
    caps.contextLength = prior.contextLength;
  }
  if (caps.supportsVision === undefined && prior?.supportsVision !== undefined) {
    caps.supportsVision = prior.supportsVision;
  }
  return caps;
}

/** Drop the measured (identity-keyed) fields, keep the reachability
 *  bookkeeping — used when the provider's identity changes (its model OR
 *  its server), so numbers measured for another identity are never
 *  believed. The store's updateRemoteApi applies it on edit. */
export function stripMeasuredCaps(caps: RemoteCaps): RemoteCaps {
  return { reachable: caps.reachable, checkedAt: caps.checkedAt };
}

export async function validateRemoteApi(
  provider: RemoteApiProvider,
): Promise<boolean> {
  try {
    const baseUrl = provider.baseUrl.replace(/\/$/, "");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (provider.apiKey && provider.apiKey !== "not-required") {
      headers.Authorization = `Bearer ${provider.apiKey}`;
    }

    // Try to list models or make a simple completion request
    const response = await fetch(`${baseUrl}/v1/models`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      return true;
    }

    // Fallback: try a simple completion
    const testResponse = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: provider.modelName,
        messages: [{ role: "user", content: "test" }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(10000),
    });

    return testResponse.ok || testResponse.status === 400; // 400 means endpoint works but request was invalid
  } catch {
    return false;
  }
}

export function buildRemoteModelSpec(provider: RemoteApiProvider): ModelSpec {
  return {
    id: `remote-${provider.id}`,
    name: provider.name,
    author: provider.providerType === "openrouter" ? "OpenRouter" : "Custom",
    description: `${provider.providerType} provider: ${provider.modelName}`,
    origin: "remote_api",
    type: "llm",
    files: [],
    providerType: provider.providerType,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    modelName: provider.modelName,
    downloadStatus: "completed", // Remote APIs don't download
    downloadProgress: 100,
    downloadedBytes: 0,
    totalBytes: 0,
  };
}
