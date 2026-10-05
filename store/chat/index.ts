/** Chat store: local Store-owned sessions, on-device turns.
 *
 * Composed from focused slices; the public path stays `../store/chat`
 * (that file re-exports this). The factory takes injectable session/turn
 * seams so tests inject memory fakes.
 *
 * There is no storage seam: sessions, the active-session pointer and
 * drafts all live in the local Store (ADR-0012), reached through
 * getStore(). AsyncStorage is gone from this slice entirely.
 */

import { create } from "zustand";

import type { SearchAuth } from "../../types/api.ts";
import { useSearch } from "../search.ts";
import { createSendSlice } from "./send.ts";
import { createSessionsSlice } from "./sessions.ts";
import { createDraftSlice } from "./draft.ts";
import type { ChatCtx, ChatDeps, ChatState, TurnRunner } from "./types.ts";
import { selectEngineSource, type EngineSource } from "../../lib/inference/engine.ts";
import { EngineManager } from "../../lib/inference/manager.ts";
import { resolveSampler, type SamplerParams } from "../../lib/inference/sampler.ts";
import { resolveThinking } from "../../lib/inference/thinking.ts";
import {
  getAvailableDevices,
  resolveComputeDevices,
} from "../../lib/inference/deviceSelection.ts";
import { createRemoteEngine } from "../../lib/inference/remote-engine.ts";
import { createTurnRunner } from "../../lib/chat/turn.ts";
import { holdScreen, releaseScreen } from "../../lib/chat/keep-awake.ts";
import type { SessionStore } from "../../lib/chat/session-store.ts";

/** Default BYOK resolver: consent-gated key from SecureStore, never KV.
 * Short-circuits before touching SecureStore when consent is absent. */
async function defaultSearchAuth(): Promise<SearchAuth | null> {
  const search = useSearch.getState();
  if (!search.hasConsented) return null;
  const key = await search.getProviderKey(search.activeProviderId);
  if (!key) return null;
  return { provider: search.activeProviderId, key, count: search.resultCount };
}

/** Default engine source: live models store (no keys needed to pick). */
async function defaultEngineSource(): Promise<EngineSource | null> {
  try {
    const { useModelStore } = await import("../modelStore.ts");
    const m = useModelStore.getState();
    return selectEngineSource({
      activeModelId: m.activeModelId,
      activeProviderType: m.activeProviderType,
      models: m.models,
      remoteApis: m.remoteApis,
    });
  } catch {
    return null;
  }
}

/** Default session store: the local Store + its SQLite persister.
 * ponytail: lazy import keeps expo-sqlite (a native module) out of
 * plain-Node tests; Metro still bundles it statically for the app.
 * Exported so the Generation settings sheet can reach the session's
 * sampler override; it is not part of ChatState on purpose, since a
 * component needs one field, not the whole store. */
export async function defaultGetStore(): Promise<SessionStore | null> {
  try {
    const { getSessionStore } = await import("../../lib/tinybase.ts");
    return await getSessionStore();
  } catch {
    return null;
  }
}

/** One process-wide engine slot (local context cached by file). */
let manager: EngineManager | null = null;

function getManager(): EngineManager {
  if (!manager) {
    manager = new EngineManager(
      {
        loadLocal: async (fileName, mmprojPath) => {
          const [fs, engine, local, inference] = await Promise.all([
            import("expo-file-system/legacy"),
            import("../../lib/inference/engine.ts"),
            import("../../lib/inference/local-engine.ts"),
            import("../inference.ts"),
          ]);
          const docsDir = fs.documentDirectory ?? "";
          const params = inference.useInference.getState();
          // A separate draft GGUF, if one is chosen and still downloaded.
          let modelDraft: string | undefined;
          if (params.draftModelId) {
            try {
              const { useModelStore } = await import("../modelStore.ts");
              const draft = useModelStore
                .getState()
                .models.find(
                  (m) =>
                    m.id === params.draftModelId &&
                    m.downloadStatus === "completed",
                );
              const file = draft?.files[0];
              if (file) {
                modelDraft = engine.resolveLocalFile(docsDir, file.name);
              }
            } catch {
              // No draft is fine; embedded MTP still applies.
            }
          }
          // Compute devices resolved against what the phone actually
          // reports: the raw "HTP*" wildcard is never passed through,
          // and CPU-only phones init n_gpu_layers 0 (PocketPal's CPU
          // semantics). A live query is fine here — this path is
          // already async.
          const compute = resolveComputeDevices(
            params.useHexagonNpu,
            params.nGpuLayers,
            await getAvailableDevices(),
          );
            const ctx = await local.loadLlamaContext(
            engine.resolveLocalFile(docsDir, fileName),
            mmprojPath,
            {
              n_ctx: params.nCtx,
              n_gpu_layers: compute.nGpuLayers,
              use_mlock: params.useMlock,
              use_mmap: params.useMmap,
              n_batch: params.nBatch,
              n_ubatch: params.nUbatch,
              n_threads: params.nThreads,
              flash_attn_type: params.flashAttn,
              cache_type_k: params.cacheK,
              cache_type_v: params.cacheV,
              speculative: params.speculativeEnabled,
              spec_draft_n_gpu_layers: params.specDraftGpuLayers,
              spec_draft_cache_type_k: params.specDraftCacheK,
              spec_draft_cache_type_v: params.specDraftCacheV,
              // The UI says "enable repacking"; llama.cpp wants the inverse.
              no_extra_bufts: !params.useWeightRepacking,
              // Omitted unless a real HTP device resolved above, because
              // a missing `devices` is "platform default" and [] is a
              // different instruction.
              ...(compute.devices ? { devices: compute.devices } : {}),
              ...(modelDraft ? { model_draft: modelDraft } : {}),
              image_max_tokens: params.imageMaxTokens,
            },
          );
          return {
            engine: local.createLocalEngine(ctx),
            release: () => local.releaseLocalEngine(ctx),
          };
        },
        createRemote: (provider, getKey) =>
          createRemoteEngine(provider, getKey, { timeoutMs: provider.timeoutMs }),
      },
      async (providerId: string) => {
        try {
          const { useModelStore } = await import("../modelStore.ts");
          const { readSecret } = await import("../models/storage.ts");
          const { providerKeySS } = await import("../../lib/secrets.ts");
          const m = useModelStore.getState();
          const provider = m.remoteApis.find((p) => p.id === providerId);
          if (!provider) return null;
          return await readSecret(providerKeySS(provider.id));
        } catch {
          return null;
        }
      },
    );
  }
  return manager;
}

/** Data-uri JPEG → temp file for multimodal turns; null = text-only. */
async function defaultSaveImage(dataUri: string): Promise<string | null> {
  try {
    const match = /^data:image\/\w+;base64,(.*)$/.exec(dataUri);
    if (!match) return null;
    const FS = await import("expo-file-system/legacy");
    const dir = `${FS.documentDirectory ?? ""}chat-images/`;
    await FS.makeDirectoryAsync(dir, { intermediates: true });
    const path = `${dir}${Date.now()}.jpg`;
    type WriteOptions = Parameters<typeof FS.writeAsStringAsync>[2];
    // SAFETY: "base64" is the legacy EncodingType.Base64 literal; the
    // options bag is structural so the literal needs only this bridge.
    await FS.writeAsStringAsync(path, match[1], {
      encoding: "base64",
    } as WriteOptions);
    return path;
  } catch {
    return null;
  }
}

/** Resolved thinking state for the ACTIVE model (C6): a user
 *  override, then the spec's detected capability, then the global
 *  preference. An unclassified model gets the global flag, exactly as
 *  before this ticket. */
async function defaultThinking(): Promise<boolean> {
  try {
    const { useInference } = await import("../inference.ts");
    const { useModelStore } = await import("../modelStore.ts");
    const inf = useInference.getState();
    const m = useModelStore.getState();
    // Remote engines have no enable_thinking flag (the toggle is local
    // only); resolving with a null id keeps the global as their default.
    const local = m.activeProviderType === "local";
    const spec =
      local && m.activeModelId !== null
        ? m.models.find((model) => model.id === m.activeModelId)
        : undefined;
    return resolveThinking({
      modelId: local && m.activeModelId !== null ? m.activeModelId : null,
      reasoning: spec?.reasoning,
      overrides: inf.thinkingOverrides,
      globalEnabled: inf.thinkingEnabled,
    }).enabled;
  } catch {
    return true;
  }
}

/** Local-only jinja preference from the inference store. */
async function defaultJinja(): Promise<boolean> {
  try {
    const { useInference } = await import("../inference.ts");
    return useInference.getState().jinjaEnabled;
  } catch {
    return true;
  }
}

/** Resolved sampling params for one conversation, or null for a remote
 *  engine (an OpenAI-compatible endpoint keeps its own defaults and has no
 *  equivalent for typical-p, XTC or mirostat, so sending ours would be
 *  sending knobs the server silently ignores).
 *
 *  Takes the session id rather than reading the active pointer: the turn
 *  that mints a new session writes to THAT id and only adopts it as the
 *  pointer afterwards, so reading the pointer here would resolve the
 *  previous conversation's tuning — or none at all.
 *
 *  Precedence is session override, then the global preset — a conversation
 *  that never overrode anything follows the preset. */
async function defaultSampler(sessionId: string | null): Promise<SamplerParams | null> {
  try {
    const [{ useInference }, { useModelStore }, sessionStore] = await Promise.all([
      import("../inference.ts"),
      import("../modelStore.ts"),
      defaultGetStore(),
    ]);
    if (useModelStore.getState().activeProviderType === "remote") return null;
    const global = useInference.getState().sampler;
    if (!sessionStore || !sessionId) return global;
    return resolveSampler(
      global,
      await sessionStore.getSessionSampler(sessionId).catch(() => null),
    );
  } catch {
    return null;
  }
}

/** Per-model system prompt override; absent stays absent. */
async function defaultSystemPrompt(): Promise<string | undefined> {
  try {
    const { useModelStore } = await import("../modelStore.ts");
    const m = useModelStore.getState();
    if (!m.activeModelId) return undefined;
    const prompt = m.getModelSettings(m.activeModelId).systemPrompt;
    return prompt && prompt.trim() !== "" ? prompt : undefined;
  } catch {
    return undefined;
  }
}

/** Default on-device turn: engine slot + agent loop + persisted turns. */
function defaultRunTurn(getSearch: () => Promise<SearchAuth | null>): TurnRunner {
  return (text, paths, onToken) => {
    const runTurn = createTurnRunner({
      ensureEngine: async (source: EngineSource) => getManager().ensure(source),
      getEngineSource: () => defaultEngineSource(),
      getStore: () => defaultGetStore(),
      getSearch: async () => {
        const auth = await getSearch().catch(() => null);
        return auth ? { provider: auth.provider, key: auth.key, count: auth.count } : null;
      },
      getSystemPrompt: () => defaultSystemPrompt(),
      getThinking: () => defaultThinking(),
      getJinja: () => defaultJinja(),
    getSampler: (sid) => defaultSampler(sid),
      saveImage: (uri: string) => defaultSaveImage(uri),
    });
    return runTurn(text, paths, onToken);
  };
}

export function createChatStore(deps?: ChatDeps) {
  const getSearchAuth = deps?.getSearchAuth ?? defaultSearchAuth;
  const ctx: ChatCtx = {
    getStore: deps?.getStore ?? defaultGetStore,
    getSearchAuth,
    getEngineSource: deps?.getEngineSource ?? defaultEngineSource,
    runTurn: deps?.runTurn ?? defaultRunTurn(getSearchAuth),
    stopEngine: () => {
      void getManager().stopActive();
    },
releaseEngine: () => {
      void getManager().releaseAll();
    },
    keepAwake:
      deps?.keepAwake ??
      ((on: boolean) => {
        if (on) void holdScreen();
        else releaseScreen();
      }),
    active: { handle: null },
    streamGen: 0,
  };
  return create<ChatState>()((set, get) => ({
    messages: [],
    connection: "unknown",
    ...createSessionsSlice(set, get, ctx),
    ...createSendSlice(set, get, ctx),
    ...createDraftSlice(set, get, ctx),

    // Engine readiness (not network): a resolvable model means the app
    // can answer; a store failure surfaces per-action instead.
    checkHealth: async () => {
      try {
        const source = await ctx.getEngineSource();
        set({ connection: source ? "up" : "down" });
      } catch {
        set({ connection: "down" });
      }
    },
    releaseEngine: () => {
      ctx.releaseEngine();
    },
  }));
}

export const useChatStore = createChatStore();

export type { ChatDeps, ChatState, ChatCtx, Connection } from "./types.ts";
