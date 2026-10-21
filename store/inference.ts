/** On-device inference init params: persisted, applied at context load.
 *
 * Persisted with Zustand's `persist` middleware over AsyncStorage.
 * `skipHydration` keeps cold-start discipline (manual `rehydrate()`).
 * No version/migrate: breaking changes bump INFERENCE_KEY.
 */

import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "@/services/storage/storage";
import { dedupedStorage, toStateStorage } from "@/services/storage/persist-helpers";
import {
  DEFAULT_SAMPLER,
  parseSampler,
  type SamplerParams,
} from "@/services/inference/sampler.ts";
import { isEffortLevel, type EffortLevel } from "@/utils/reasoning-capability.ts";

export const INFERENCE_KEY = "liai_inference";

export const MIN_CONTEXT = 512;
export const MAX_GPU_LAYERS = 99;
export const MAX_BATCH = 4096;
export const MAX_THREADS = 16;
/** PocketPal's range for the vision budget: 256-512 is faster, up to 4096
 *  keeps maximum detail. */
export const MIN_IMAGE_TOKENS = 256;
export const MAX_IMAGE_TOKENS = 4096;

export type FlashAttn = "auto" | "on" | "off";
export type CacheType = "f16" | "q8_0" | "q4_0";

export const CACHE_TYPES: CacheType[] = ["f16", "q8_0", "q4_0"];

export interface InferenceParams {
  nCtx: number;
  nGpuLayers: number;
  useMlock: boolean;
  useMmap: boolean;
  nBatch: number;
  nUbatch: number;
  nThreads: number;
  flashAttn: FlashAttn;
  cacheK: CacheType;
  cacheV: CacheType;
  speculativeEnabled: boolean;
  specDraftGpuLayers: number;
  specDraftCacheK: CacheType;
  specDraftCacheV: CacheType;
  thinkingEnabled: boolean;
  /** Per-model user overrides (C6): modelId → on/off. An explicit
   *  override beats the spec's detected capability; its setter
   *  merge-patches like every setter here, so a plain settings save
   *  (which serializes current state) cannot clobber the map. */
  thinkingOverrides: Record<string, boolean>;
  /** Per-model graded-reasoning effort (PocketPal axis 2): modelId →
   *  one of EFFORT_LEVELS. Sent to the engine as
   *  chat_template_kwargs.reasoning_effort, which only models whose
   *  jinja template reads it (gpt-oss-style) act on it — a template
   *  that ignores the kwarg is unaffected, never broken. Typed as the
   *  level union so no consumer needs a cast; the string world stops at
   *  asEffortOverrides below. */
  effortOverrides: Record<string, EffortLevel>;
  jinjaEnabled: boolean;
  /** Sampling params, nested so one setter covers the whole group. */
  sampler: SamplerParams;
  /** Opt into Android's Hexagon NPU. False leaves `devices` unset, which
   *  llama.rn reads as "platform default". */
  useHexagonNpu: boolean;
  /** UI name for the inverted no_extra_bufts flag. */
  useWeightRepacking: boolean;
  /** Vision budget, applied when the projector loads. */
  imageMaxTokens: number;
  /** Id of a separate draft GGUF for MTP speculative decoding. */
  draftModelId: string | null;
  /** Release the model when the app backgrounds, instead of holding a
   *  multi-GB GGUF resident. Default on: that is the point of the setting,
   *  and a phone that re-loads a model on the next message is fine while
   *  one that never releases it gets killed for memory. */
  autoOffload: boolean;
  /** The local model this app auto-released when it backgrounded, or null.
   *  Persisted so the next launch can warm it back up before the first
   *  message (PocketParity: wasAutoReleased + lastAutoReleasedModelId,
   *  ModelStore.ts:1127). A null id IS "nothing was auto-released". */
  autoReleasedModelId: string | null;
}

export interface InferenceState extends InferenceParams {
  loaded: boolean;
  load: () => Promise<void>;
  setNCtx: (n: number) => void;
  setNGpuLayers: (n: number) => void;
  setUseMlock: (on: boolean) => void;
  setUseMmap: (on: boolean) => void;
  setNBatch: (n: number) => void;
  setNUbatch: (n: number) => void;
  setNThreads: (n: number) => void;
  setFlashAttn: (v: FlashAttn) => void;
  setCacheK: (v: CacheType) => void;
  setCacheV: (v: CacheType) => void;
  setSpeculativeEnabled: (on: boolean) => void;
  setSpecDraftGpuLayers: (n: number) => void;
  setSpecDraftCacheK: (v: CacheType) => void;
  setSpecDraftCacheV: (v: CacheType) => void;
  setThinkingEnabled: (on: boolean) => void;
  /** Record the user's explicit per-model thinking choice. */
  setThinkingOverride: (modelId: string, on: boolean) => void;
  /** Record a per-model effort level, or clear it with null. */
  setEffortOverride: (modelId: string, effort: string | null) => void;
  setJinjaEnabled: (on: boolean) => void;
  /** Patch any subset; each value is clamped by the sampler module. */
  setSampler: (patch: Partial<SamplerParams>) => void;
  setUseHexagonNpu: (on: boolean) => void;
  setUseWeightRepacking: (on: boolean) => void;
  setImageMaxTokens: (n: number) => void;
  setDraftModelId: (id: string | null) => void;
  setAutoOffload: (on: boolean) => void;
  /** Record (or clear) the model this app auto-released. */
  setAutoReleasedModelId: (id: string | null) => Promise<void>;
}

export const DEFAULT_INFERENCE: InferenceParams = {
  nCtx: 4096,
  nGpuLayers: 99,
  useMlock: false,
  useMmap: true,
  nBatch: 512,
  nUbatch: 512,
  nThreads: 4,
  flashAttn: "auto",
  cacheK: "q8_0",
  cacheV: "q8_0",
  speculativeEnabled: false,
  specDraftGpuLayers: 99,
  specDraftCacheK: "q8_0",
  specDraftCacheV: "q8_0",
  thinkingEnabled: true,
  thinkingOverrides: {},
  effortOverrides: {},
  jinjaEnabled: true,
  sampler: { ...DEFAULT_SAMPLER },
  useHexagonNpu: false,
  // Repacking on by default, matching PocketPal's Android default: it makes
  // prompt processing faster for a small memory cost.
  useWeightRepacking: true,
  imageMaxTokens: 512,
  draftModelId: null,
  autoOffload: true,
  autoReleasedModelId: null,
};

/** Single clamp every numeric param flows through (persist/restore + setters). */
function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Override map: only string keys with boolean values survive. */
function asOverrides(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

/** Effort map: only canonical levels survive (PocketPal's EFFORT_LEVELS).
 *  This is the ONE place the persisted string world meets the union. */
function asEffortOverrides(value: unknown): Record<string, EffortLevel> {
  const out: Record<string, EffortLevel> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isEffortLevel(v)) out[k] = v;
  }
  return out;
}

function asParams(value: unknown): InferenceParams {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_INFERENCE };
  }
  const v = value as Record<string, unknown>;
  const num = (k: string, fallback: number) =>
    typeof v[k] === "number" && Number.isFinite(v[k]) ? (v[k] as number) : fallback;
  const flag = (k: string, fallback: boolean) =>
    typeof v[k] === "boolean" ? (v[k] as boolean) : fallback;
  const clampBatch = (k: string, fallback: number) =>
    clampInt(num(k, fallback), 1, MAX_BATCH);
  const cache = (k: string, fallback: CacheType): CacheType =>
    CACHE_TYPES.includes(v[k] as CacheType) ? (v[k] as CacheType) : fallback;
  return {
    nCtx: clampInt(num("nCtx", DEFAULT_INFERENCE.nCtx), MIN_CONTEXT, Number.MAX_SAFE_INTEGER),
    nGpuLayers: clampInt(num("nGpuLayers", DEFAULT_INFERENCE.nGpuLayers), 0, MAX_GPU_LAYERS),
    useMlock: flag("useMlock", DEFAULT_INFERENCE.useMlock),
    useMmap: flag("useMmap", DEFAULT_INFERENCE.useMmap),
    nBatch: clampBatch("nBatch", DEFAULT_INFERENCE.nBatch),
    nUbatch: clampBatch("nUbatch", DEFAULT_INFERENCE.nUbatch),
    nThreads: clampInt(num("nThreads", DEFAULT_INFERENCE.nThreads), 1, MAX_THREADS),
    flashAttn:
      v.flashAttn === "auto" || v.flashAttn === "on" || v.flashAttn === "off"
        ? v.flashAttn
        : DEFAULT_INFERENCE.flashAttn,
    cacheK: cache("cacheK", DEFAULT_INFERENCE.cacheK),
    cacheV: cache("cacheV", DEFAULT_INFERENCE.cacheV),
    speculativeEnabled: flag("speculativeEnabled", DEFAULT_INFERENCE.speculativeEnabled),
    specDraftGpuLayers: clampInt(
      num("specDraftGpuLayers", DEFAULT_INFERENCE.specDraftGpuLayers),
      0,
      MAX_GPU_LAYERS,
    ),
    specDraftCacheK: cache("specDraftCacheK", DEFAULT_INFERENCE.specDraftCacheK),
    specDraftCacheV: cache("specDraftCacheV", DEFAULT_INFERENCE.specDraftCacheV),
    thinkingEnabled: flag("thinkingEnabled", DEFAULT_INFERENCE.thinkingEnabled),
    thinkingOverrides: asOverrides(v.thinkingOverrides),
    effortOverrides: asEffortOverrides(v.effortOverrides),
    jinjaEnabled: flag("jinjaEnabled", DEFAULT_INFERENCE.jinjaEnabled),
    sampler: parseSampler(v.sampler),
    useHexagonNpu: flag("useHexagonNpu", DEFAULT_INFERENCE.useHexagonNpu),
    useWeightRepacking: flag("useWeightRepacking", DEFAULT_INFERENCE.useWeightRepacking),
    imageMaxTokens: clampInt(
      num("imageMaxTokens", DEFAULT_INFERENCE.imageMaxTokens),
      MIN_IMAGE_TOKENS,
      MAX_IMAGE_TOKENS,
    ),
    draftModelId: typeof v.draftModelId === "string" ? v.draftModelId : null,
    autoOffload: flag("autoOffload", DEFAULT_INFERENCE.autoOffload),
    autoReleasedModelId:
      typeof v.autoReleasedModelId === "string" ? v.autoReleasedModelId : null,
  };
}

export function parseInferenceParams(raw: string | null): InferenceParams {
  if (!raw) return { ...DEFAULT_INFERENCE };
  try {
    return asParams(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_INFERENCE };
  }
}

interface InferenceStoreApi {
  persist: { rehydrate: () => void | Promise<void> };
  getState: () => InferenceState;
  setState: (partial: Partial<InferenceState>) => void;
}

const PARAM_KEYS: (keyof InferenceParams)[] = [
  "nCtx",
  "nGpuLayers",
  "useMlock",
  "useMmap",
  "nBatch",
  "nUbatch",
  "nThreads",
  "flashAttn",
  "cacheK",
  "cacheV",
  "speculativeEnabled",
  "specDraftGpuLayers",
  "specDraftCacheK",
  "specDraftCacheV",
  "thinkingEnabled",
  "thinkingOverrides",
  "effortOverrides",
  "jinjaEnabled",
  "sampler",
  "useHexagonNpu",
  "useWeightRepacking",
  "imageMaxTokens",
  "draftModelId",
  "autoOffload",
  "autoReleasedModelId",
];

export function createInferenceStore(storage: KeyValueStorage) {
  let hydrating: Promise<void> | null = null;
  let api: InferenceStoreApi | null = null;

  const created = create<InferenceState>()(
    persist(
      (set, get) => {
        return {
          ...DEFAULT_INFERENCE,
          loaded: false,
          load: async () => {
            if (get().loaded) return;
            hydrating ??= (async () => {
              if (!api) return;
              await api.persist.rehydrate();
            })().finally(() => {
              hydrating = null;
            });
            await hydrating;
          },
          setNCtx: (n) => {
            set({ nCtx: clampInt(n, MIN_CONTEXT, Number.MAX_SAFE_INTEGER) });
          },
          setNGpuLayers: (n) => {
            set({ nGpuLayers: clampInt(n, 0, MAX_GPU_LAYERS) });
          },
          setUseMlock: (on) => {
            set({ useMlock: on });
          },
          setUseMmap: (on) => {
            set({ useMmap: on });
          },
          setNBatch: (n) => {
            set({ nBatch: clampInt(n, 1, MAX_BATCH) });
          },
          setNUbatch: (n) => {
            set({ nUbatch: clampInt(n, 1, MAX_BATCH) });
          },
          setNThreads: (n) => {
            set({ nThreads: clampInt(n, 1, MAX_THREADS) });
          },
          setFlashAttn: (v) => {
            set({ flashAttn: v });
          },
          setCacheK: (v) => {
            set({ cacheK: v });
          },
          setCacheV: (v) => {
            set({ cacheV: v });
          },
          setSpeculativeEnabled: (on) => {
            set({ speculativeEnabled: on });
          },
          setSpecDraftGpuLayers: (n) => {
            set({ specDraftGpuLayers: clampInt(n, 0, MAX_GPU_LAYERS) });
          },
          setSpecDraftCacheK: (v) => {
            set({ specDraftCacheK: v });
          },
          setSpecDraftCacheV: (v) => {
            set({ specDraftCacheV: v });
          },
          setThinkingEnabled: (on) => {
            set({ thinkingEnabled: on });
          },
          setThinkingOverride: (modelId, on) => {
            set({
              thinkingOverrides: { ...get().thinkingOverrides, [modelId]: on },
            });
          },
          setEffortOverride: (modelId, effort) => {
            set((s) => {
              const next = { ...s.effortOverrides };
              if (effort === null) delete next[modelId];
              else if (isEffortLevel(effort)) next[modelId] = effort;
              return { effortOverrides: next };
            });
          },
          setJinjaEnabled: (on) => {
            set({ jinjaEnabled: on });
          },
          setSampler: (patch) => {
            set({ sampler: parseSampler({ ...get().sampler, ...patch }) });
          },
          setUseHexagonNpu: (on) => {
            set({ useHexagonNpu: on });
          },
          setUseWeightRepacking: (on) => {
            set({ useWeightRepacking: on });
          },
          setImageMaxTokens: (n) => {
            set({ imageMaxTokens: clampInt(n, MIN_IMAGE_TOKENS, MAX_IMAGE_TOKENS) });
          },
          setDraftModelId: (id) => {
            set({ draftModelId: id });
          },
          setAutoOffload: (on) => {
            set({ autoOffload: on });
          },
          setAutoReleasedModelId: async (id) => {
            set({ autoReleasedModelId: id });
            // Ensure the record lands on disk before the caller frees the engine.
            try {
              const state: Record<string, unknown> = {};
              const cur = get();
              for (const k of PARAM_KEYS) state[k] = cur[k];
              await storage.setItem(INFERENCE_KEY, JSON.stringify({ state, version: 0 }));
            } catch {
              // best effort
            }
          },
        };
      },
      {
        name: INFERENCE_KEY,
        // Deduped: the middleware writes on every state change, and publishing
        // `loaded` writes the same bytes it just wrote.
        storage: createJSONStorage(() => toStateStorage(dedupedStorage(storage))),
        skipHydration: true,
        partialize: (state: InferenceState) => {
          const out: Record<string, unknown> = {};
          for (const k of PARAM_KEYS) {
            out[k] = state[k];
          }
          return out;
        },
        merge: (persistedState, currentState) => {
          const validated = asParams(persistedState);
          return {
            ...currentState,
            ...validated,
            loaded: currentState.loaded,
          };
        },
        onRehydrateStorage: () => (state, error) => {
          // Published through the store so subscribers re-render; an in-place
          // mutation would leave them on a stale `loaded`.
          if (state && !error) api?.setState({ loaded: true });
        },
      },
    ),
  );

  api = created as unknown as InferenceStoreApi;
  return created;
}

async function rnStorage(): Promise<AsyncStorageStatic> {
  const mod = await import("@react-native-async-storage/async-storage");
  // SAFETY: the module's default export is the AsyncStorage instance; the
  // interop shim can surface it under `.default` or on the namespace itself.
  return (mod.default ?? mod) as unknown as AsyncStorageStatic;
}

/** App singleton backed by on-device AsyncStorage. */
export const useInference = createInferenceStore({
  getItem: async (key) => (await rnStorage()).getItem(key),
  setItem: async (key, value) => {
    await (await rnStorage()).setItem(key, value);
  },
  removeItem: async (key) => {
    await (await rnStorage()).removeItem(key);
  },
});