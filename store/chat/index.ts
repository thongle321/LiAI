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

import type { SearchAuth } from "@/types/api.ts";
import { useSearch } from "../search.ts";
import { createSendSlice } from "./send.ts";
import { multimodalAvailable } from "@/services/inference/mmproj.ts";
import { createSessionsSlice } from "./sessions.ts";
import { createDraftSlice } from "./draft.ts";
import type { ChatCtx, ChatDeps, ChatState, TurnRunner } from "./types.ts";
import { createToolTokenCounter } from "@/services/chat/tool-token-count.ts";
import { selectEngineSource, type EngineSource } from "@/services/inference/engine.ts";
import { EngineManager } from "@/services/inference/manager.ts";
import type { LlamaInitParams } from "@/services/inference/local-engine.ts";
import { projectorPathForFileName } from "@/services/inference/mmproj.ts";
import { resolveSampler, type SamplerParams } from "@/services/inference/sampler.ts";
import { resolveThinking } from "@/services/inference/thinking.ts";
import {
  resolveEffort,
  type EffortLevel,
} from "@/utils/reasoning-capability.ts";
import type { ThinkingChatProbe } from "@/services/inference/thinking-detection.ts";
import type { ToolSupportProbe } from "@/services/inference/tool-support.ts";
import {
  getAvailableDevices,
  resolveComputeDevices,
} from "@/services/inference/deviceSelection.ts";
import { createRemoteEngine } from "@/services/inference/remote-engine.ts";
import { resolveImage } from "@/services/storage/images.ts";
import { createTurnRunner, type TurnDeps } from "@/services/chat/turn.ts";
import { holdScreen, releaseScreen } from "@/services/chat/keep-awake.ts";
import type { SessionStore, SessionOverride } from "@/services/chat/session-store.ts";
import type { ModelStore } from "../model-store.ts";
import type { ModelSpec } from "@/types/models.ts";
import type { Companion } from "@/types/companion.ts";
import { generateFinalSystemPrompt } from "@/utils/companion-template.ts";

/** Default BYOK resolver: consent-gated key from SecureStore, never KV.
 * Short-circuits before touching SecureStore when consent is absent. */
async function defaultSearchAuth(): Promise<SearchAuth | null> {
  const search = useSearch.getState();
  // Self-heal: the startup gate hydrates this, but a deep link can reach a
  // turn without it, and consent is persisted - reading the default `false`
  // would tell the user search is off when they turned it on.
  if (!search.loaded) await search.load();
  if (!useSearch.getState().hasConsented) return null;
  const { activeProviderId, getProviderKey, resultCount } = useSearch.getState();
  const key = await getProviderKey(activeProviderId);
  if (!key) return null;
  return { provider: activeProviderId, key, count: resultCount };
}

/** Default engine source: live models store (no keys needed to pick). */
async function defaultEngineSource(): Promise<EngineSource | null> {
  try {
    const { useModelStore } = await import("../model-store.ts");
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
    const { getSessionStore } = await import("../../services/chat/tinybase.ts");
    return await getSessionStore();
  } catch {
    return null;
  }
}

/** Reload the local model at the CURRENT inference settings, now.
 *
 *  `EngineManager.ensure()` keys the slot on n_ctx, so changing nCtx alone
 *  would reload on the NEXT turn — which is the wrong moment to discover
 *  that the new size cannot be loaded. The context ladder calls this right
 *  after setting the size, so a failure is caught while the user is still
 *  looking at the sheet.
 *
 *  Throws on a failed load, and leaves the slot EMPTY in that case (ensure()
 *  drops it before loading), which is why the caller re-initialises. */
export async function reloadLocalEngine(): Promise<void> {
  const source = await defaultEngineSource();
  // No source means no model is selected — nothing to reload, and the
  // caller's try/catch must not fire over a state it cannot fix.
  if (!source) return;
  await getManager().ensure(
    source,
    source.kind === "local"
      ? await projectorPathForFileName(source.fileName)
      : undefined,
    // The init MUST ride along: without it the key stays on "default",
    // ensure() returns the warm context, and this function — the
    // context-full banner's whole recovery — reloads nothing (finding 1).
    source.kind === "local" ? await resolveInit() : undefined,
  );
}

/** The init params a local load runs with — the ONE source for both the
 *  loader and EngineManager's slot key.
 *
 *  Why this function exists (audit finding 1): ensure() only reloads
 *  when its key changes, and the key is the `init` argument. The loader
 *  used to hand-build these params while BOTH production ensure() call
 *  sites passed no init at all, so every inference-settings change
 *  (context size, GPU layers, cache types, draft model…) was ignored
 *  while the model stayed warm, and the context-full banner's
 *  "smaller window + reload" reloaded nothing. One resolver, consumed
 *  by both sides, is the whole fix. */
async function resolveInit(): Promise<LlamaInitParams> {
  const [fs, engine, inference] = await Promise.all([
    import("expo-file-system/legacy"),
    import("../../services/inference/engine.ts"),
    import("../inference.ts"),
  ]);
  const params = inference.useInference.getState();
  const docsDir = fs.documentDirectory ?? "";
  // A separate draft GGUF, if one is chosen and still downloaded.
  let modelDraft: string | undefined;
  if (params.draftModelId) {
    try {
      const { useModelStore } = await import("../model-store.ts");
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
  // semantics). This now runs on every ensure() — it is the key's
  // input — so it must stay the cheap native query it always was.
  const compute = resolveComputeDevices(
    params.useHexagonNpu,
    params.nGpuLayers,
    await getAvailableDevices(),
  );
  return {
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
  };
}

/** One process-wide engine slot (local context cached by file). */
let manager: EngineManager | null = null;

function getManager(): EngineManager {
  if (!manager) {
    manager = new EngineManager(
      {
        loadLocal: async (fileName, mmprojPath) => {
          const [fs, engine, local] = await Promise.all([
            import("expo-file-system/legacy"),
            import("../../services/inference/engine.ts"),
            import("../../services/inference/local-engine.ts"),
          ]);
          // The SAME resolveInit() that feeds ensure()'s slot key: what
          // the key claims is what actually loads, always.
          const ctx = await local.loadLlamaContext(
            engine.resolveLocalFile(fs.documentDirectory ?? "", fileName),
            mmprojPath,
            await resolveInit(),
          );
          // Thinking capability (PocketParity: updateModelThinkingCapabilities,
            // ModelStore.ts:3280): probe once per load and persist the verdict.
            // Off the critical path — never delays the first turn.
            void recordThinkingCapability(fileName, ctx);
          // Tool support, same shape and same reason: the verdict is read
          // HERE because the manager keeps only the CompletionEngine, not
          // the raw context this probe needs.
          void recordToolSupport(fileName, ctx);
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
          const { useModelStore } = await import("../model-store.ts");
          const { readSecret } = await import("../models/storage.ts");
          const { providerKeySS } = await import("../../services/auth/secrets.ts");
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

/** The model row a freshly loaded file belongs to, and the store that owns it.
 *
 *  Both capability probes (thinking, tool support) answer the same two
 *  questions first: which model is this file, and where do I write the
 *  verdict. The answer is the same for both, so it lives here once.
 *
 *  The model store is reached by dynamic import, like everywhere else in
 *  this file: it pulls in native pieces a plain-Node test cannot resolve. */
async function modelForFile(
  fileName: string,
): Promise<{ m: ModelStore; spec: ModelSpec } | null> {
  const { useModelStore } = await import("../model-store.ts");
  const m = useModelStore.getState();
  const spec = m.models.find((model) => model.files[0]?.name === fileName);
  if (!spec) return null;
  return { m, spec };
}

/** Probe a freshly loaded context for thinking support and record it
 *  (PocketParity: `updateModelThinkingCapabilities`, ModelStore.ts:3280).
 *
 *  Runs ONCE per load, off the critical path — the probe is a template
 *  format, not generation, so a slow or failing probe must never delay the
 *  first turn. `undefined` (could not tell) writes nothing: downgrading an
 *  unprobeable model to `reasoning: false` would hide the thinking toggle
 *  from a real reasoner forever.
 *
 *  Precedence: a per-model user override always wins, so detection never
 *  overwrites one. */
async function recordThinkingCapability(
  fileName: string,
  ctx: { getFormattedChat?: ThinkingChatProbe["getFormattedChat"] },
): Promise<void> {
  try {
    const { detectThinkingCapability } = await import(
      "../../services/inference/thinking-detection.ts"
    );
    const verdict = await detectThinkingCapability(ctx);
    if (verdict === undefined) return;
    const found = await modelForFile(fileName);
    if (!found) return;
    const { useInference } = await import("../inference.ts");
    if (useInference.getState().thinkingOverrides[found.spec.id] !== undefined)
      return;
    if (found.spec.reasoning === verdict) return;
    found.m.updateModel(found.spec.id, { reasoning: verdict });
  } catch {
    // Detection is a nicety; the model works without it.
  }
}

/** Probe a freshly loaded context for tool support and record it.
 *
 *  PocketPal parity: `pocketpal-ai/src/screens/ChatScreen/ChatScreen.tsx:148`
 *  reads `model.chatTemplates.jinja` off the live context to decide
 *  whether a companion's talents can be called at all.
 *
 *  Runs ONCE per load, off the critical path, and only writes when the
 *  verdict CHANGES: the probe runs on every load, and a load that
 *  rewrites the catalog to disk is a load that thrashes AsyncStorage.
 *
 *  "Could not tell" writes nothing — a context that reported no model
 *  must not permanently mark a tool-capable model as incapable.
 *
 *  Local models only: `loadLocal` is the local loader, and a remote
 *  provider's tool support is the server's business (we never probe it). */
async function recordToolSupport(
  fileName: string,
  ctx: { model?: ToolSupportProbe["model"] },
): Promise<void> {
  try {
    const { hasToolSupport } = await import(
      "../../services/inference/tool-support.ts"
    );
    const verdict = hasToolSupport(ctx);
    if (verdict === undefined) return;
    const found = await modelForFile(fileName);
    if (!found) return;
    if (found.spec.supportsTools === verdict) return;
    found.m.updateModel(found.spec.id, { supportsTools: verdict });
  } catch {
    // Detection is a nicety; the model works without it.
  }
}

/** The ACTIVE model's companion-bound persona for THIS conversation, or null.
 *  The session's binding wins; a staged (not-yet-sent) session has none. */
async function sessionCompanion(sessionId: string | null): Promise<Companion | null> {
  try {
    if (!sessionId) return null;
    const store = await defaultGetStore();
    if (!store) return null;
    const companionId = await store.getSessionCompanion(sessionId).catch(() => null);
    if (!companionId) return null;
    const { useCompanions } = await import("../companions.ts");
    return useCompanions.getState().getCompanion(companionId) ?? null;
  } catch {
    return null;
  }
}

/** The session's OWN override layer — read ONLY when the session
 *  flipped to 'custom'. With source 'companion' (the default) the session
 *  follows the companion-resolved base and its stale override must not leak
 *  into a turn (PocketPal's settings_source gate). */
async function sessionCustomOverride(
  sessionId: string | null,
): Promise<SessionOverride | null> {
  try {
    if (!sessionId) return null;
    const store = await defaultGetStore();
    if (!store) return null;
    const source = await store
      .getSessionSettingsSource(sessionId)
      .catch(() => null);
    if (source !== "custom") return null;
    return await store.getSessionOverride(sessionId).catch(() => null);
  } catch {
    return null;
  }
}

/** Pact talent names for THIS conversation (tool gating). Always from
 *  the session's companion, regardless of settings source: the pact is the
 *  source of truth for tool availability, exactly like PocketPal — a
 *  custom-settings session keeps its persona's tools. */
async function defaultTalentNames(sessionId: string | null): Promise<string[]> {
  try {
    const companion = await sessionCompanion(sessionId);
    return companion?.pact?.talents.map((t) => t.name) ?? [];
  } catch {
    return [];
  }
}

/** Resolved thinking state for THIS turn (C6 + session override).
 *
 *  Chain: session override (only when 'custom') → per-model user
 *  override → the spec's detected capability → the global preference.
 *  An unclassified model gets the global flag, exactly as before. */
async function defaultThinking(
  sessionId: string | null,
): Promise<boolean | undefined> {
  try {
    const custom = await sessionCustomOverride(sessionId);
    if (custom?.thinking !== undefined) return custom.thinking;
    const { useInference } = await import("../inference.ts");
    const { useModelStore } = await import("../model-store.ts");
    const inf = useInference.getState();
    const m = useModelStore.getState();
    // Remote engines have no enable_thinking flag (the toggle is local
    // only); resolving with a null id keeps them on the template default.
    const local = m.activeProviderType === "local";
    const spec =
      local && m.activeModelId !== null
        ? m.models.find((model) => model.id === m.activeModelId)
        : undefined;
    return resolveThinking({
      modelId: local && m.activeModelId !== null ? m.activeModelId : null,
      reasoning: spec?.reasoning,
      overrides: inf.thinkingOverrides,
    }).enabled;
  } catch {
    // Unknown sends nothing: see resolveThinking's contract.
    return undefined;
  }
}

/** Graded effort for THIS turn (PocketPal axis-2 parity + session
 *  override).
 *
 *  Axis 1 gates the send: with "Reasoning model" OFF the kwarg is not
 *  sent at all — a kwarg the model ignores would otherwise ride along on
 *  every turn of a model the user told us does not think. An explicit
 *  session effort ('custom' source) beats the gate the same way it beats
 *  the per-model map: it is the most specific choice that exists. */
async function defaultEffort(
  sessionId: string | null,
): Promise<EffortLevel | undefined> {
  try {
    const custom = await sessionCustomOverride(sessionId);
    const { useInference } = await import("../inference.ts");
    const { useModelStore } = await import("../model-store.ts");
    const m = useModelStore.getState();
    const id = m.activeModelId;
    const spec = id === null ? undefined : m.models.find((model) => model.id === id);
    // The active model's supported effort levels gate the resolved effort
    // (PocketPal #1002): a stored effort can outlive the model it was saved
    // against, so the override is clamped into the model's own set.
    const supported = spec?.effortValues;
    if (custom?.effort !== undefined) return resolveEffort(custom.effort, supported);
    if (id === null) return undefined;
    const thinkingOn = resolveThinking({
      modelId: id,
      reasoning: spec?.reasoning,
      overrides: useInference.getState().thinkingOverrides,
    }).enabled;
    if (thinkingOn !== true) return undefined;
    return resolveEffort(useInference.getState().effortOverrides[id], supported);
  } catch {
    return undefined;
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
      import("../model-store.ts"),
      defaultGetStore(),
    ]);
    if (useModelStore.getState().activeProviderType === "remote") return null;
    const global = useInference.getState().sampler;
    if (!sessionStore || !sessionId) return global;
    const override = await sessionCustomOverride(sessionId);
    return resolveSampler(global, override?.sampler ?? null);
  } catch {
    return null;
  }
}

/** Per-model system prompt override; absent stays absent. WITH a bound
 *  companion the persona WINS: the companion's prompt (Mustache-rendered with its
 *  parameters) is the conversation's identity, and settings_source does
 *  not gate it — that only governs generation settings (PocketPal's
 *  resolveSystemPrompt: companion → model → none). */
async function defaultSystemPrompt(
  sessionId: string | null,
): Promise<string | undefined> {
  try {
    const companion = await sessionCompanion(sessionId);
    if (companion?.systemPrompt && companion.systemPrompt.trim() !== "") {
      if (companion.parameters && Object.keys(companion.parameters).length > 0) {
        return generateFinalSystemPrompt(companion.systemPrompt, companion.parameters);
      }
      return companion.systemPrompt;
    }
    const { useModelStore } = await import("../model-store.ts");
    const m = useModelStore.getState();
    if (!m.activeModelId) return undefined;
    const prompt = m.getModelSettings(m.activeModelId).systemPrompt;
    return prompt && prompt.trim() !== "" ? prompt : undefined;
  } catch {
    return undefined;
  }
}

/** Per-model stop words plus the EOS token when enabled (PocketPal parity:
 *  the configured EOS string joins the stop list). */
async function defaultStopWords(): Promise<string[]> {
  try {
    const { useModelStore } = await import("../model-store.ts");
    const m = useModelStore.getState();
    if (!m.activeModelId) return [];
    const s = m.getModelSettings(m.activeModelId);
    const words = s.stopWords.map((w) => w.trim()).filter((w) => w !== "");
    if (s.addEosToken && s.eosToken.trim() !== "") {
      words.push(s.eosToken.trim());
    }
    return words;
  } catch {
    return [];
  }
}

/** Per-model chat-template override; "" keeps the model default. */
async function defaultChatTemplate(): Promise<string> {
  try {
    const { useModelStore } = await import("../model-store.ts");
    const m = useModelStore.getState();
    if (!m.activeModelId) return "";
    return m.getModelSettings(m.activeModelId).chatTemplate;
  } catch {
    return "";
  }
}

/** Per-model add-generation-prompt override; undefined keeps default. */
async function defaultAddGenerationPrompt(): Promise<boolean | undefined> {
  try {
    const { useModelStore } = await import("../model-store.ts");
    const m = useModelStore.getState();
    if (!m.activeModelId) return undefined;
    // Tri-state passthrough: true AND false are both user choices that must
    // reach the engine (llama.cpp defaults to true, so a coerced false
    // would silently strip every model's assistant cue).
    return m.getModelSettings(m.activeModelId).addGenerationPrompt;
  } catch {
    return undefined;
  }
}

/** Default on-device turn: engine slot + agent loop + persisted turns. */
async function resolveTurnInputs(sessionId: string | null): Promise<import("@/services/chat/turn.ts").TurnInputs> {
  const sid = sessionId ?? null;
  return {
    engineSource: await defaultEngineSource().catch(() => null),
    store: await defaultGetStore().catch(() => null),
    search: null,
    systemPrompt: await defaultSystemPrompt(sid ?? "").catch(() => undefined),
    talentNames: (await defaultTalentNames(sid).catch(() => [])) ?? [],
    thinking: await defaultThinking(sid ?? "").catch(() => undefined),
    effort: await defaultEffort(sid ?? "").catch(() => undefined),
    jinja: (await defaultJinja().catch(() => false)) ?? false,
    sampler: await defaultSampler(sid).catch(() => null),
    stopWords: (await defaultStopWords().catch(() => [])) ?? [],
    chatTemplate: (await defaultChatTemplate().catch(() => "")) ?? "",
    addGenerationPrompt: await defaultAddGenerationPrompt().catch(() => undefined),
  };
}

/** The live engine/prompt/media deps every real turn shares (chat send
 *  and the vision tab's ephemeral runner alike — one owner each for the
 *  projector-aware ensure, the consolidated input resolver, and the
 *  attachment resolver). */
function liveTurnDeps(): Omit<TurnDeps, "store"> {
  return {
    engine: {
      ensureEngine: async (source: EngineSource) =>
        // The projector rides the same resolution the image gate uses
        // (services/inference//mmproj.ts): the slot key includes it, so a model
        // whose pair arrived mid-session cannot reuse the blind context.
        getManager().ensure(
          source,
          source.kind === "local"
            ? await projectorPathForFileName(source.fileName)
            : undefined,
          // Same resolver as the loader: a settings change makes a new
          // key, the warm context misses, and the next turn reloads at
          // the settings the user just chose (finding 1).
          source.kind === "local" ? await resolveInit() : undefined,
        ),
      getEngineSource: () => defaultEngineSource(),
    },
    prompt: {
      getTurnInputs: (sid) => resolveTurnInputs(sid),
    },
    media: {
      // Attachment → file for the engine. Lives in services/storage/images
      // so the borrowed-path pass-through and the legacy data-uri decode
      // have one owner (D5-4).
      resolveImage,
    },
  };
}

function defaultRunTurn(getSearch: () => Promise<SearchAuth | null>): TurnRunner {
  return (text, paths, onToken, onReasoning, onToolStart, onToolDelta) => {
    const runTurn = createTurnRunner({
      ...liveTurnDeps(),
      store: {
        getStore: () => defaultGetStore(),
        getSearch: async () => {
          const auth = await getSearch().catch(() => null);
          return auth ? { provider: auth.provider, key: auth.key, count: auth.count } : null;
        },
      },
    });
    return runTurn(text, paths, onToken, onReasoning, onToolStart, onToolDelta);
  };
}

/** The vision tab's turn runner: the full chat pipeline, STORE-LESS.
 *
 *  A live-camera Q&A must leave no chat session behind (no minted row,
 *  no active-pointer move, no history append). `getStore` returning null
 *  makes that true by construction — services/chat/turn.ts skips every
 *  persistence best-effort — while the engine (projector-aware ensure),
 *  prompt resolution and attachment handling stay the shared live ones.
 *  The search auth is nulled too: a vision glance runs no web talents.
 */
export function createVisionTurnRunner(over: Partial<TurnDeps> = {}): TurnRunner {
  return (text, paths, onToken, onReasoning, onToolStart, onToolDelta) => {
    const live = liveTurnDeps();
    const runTurn = createTurnRunner({
      engine: over.engine ?? live.engine,
      prompt: over.prompt ?? live.prompt,
      media: over.media ?? live.media,
      store: over.store ?? {
        getStore: async () => null,
        getSearch: async () => null,
      },
    });
    return runTurn(text, paths, onToken, onReasoning, onToolStart, onToolDelta);
  };
}

export function createChatStore(deps?: ChatDeps) {
  const getSearchAuth = deps?.getSearchAuth ?? defaultSearchAuth;
  const ctx: ChatCtx = {
    getStore: deps?.getStore ?? defaultGetStore,
    getSearchAuth,
    getEngineSource: deps?.getEngineSource ?? defaultEngineSource,
    runTurn: deps?.runTurn ?? defaultRunTurn(getSearchAuth),
    multimodalAvailable: deps?.multimodalAvailable ?? multimodalAvailable,
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
    stoppingGen: null,
    toolTokens: createToolTokenCounter(),
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
