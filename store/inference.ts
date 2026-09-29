/** On-device inference init params: persisted, applied at context load.
 *
 * Factory takes storage so tests inject memory (see modelsUi pattern).
 * Only params the llama.rn bridge in lib/inference/local-engine.ts forwards
 * are stored here — no dead knobs. Changing params busts the engine cache
 * because the manager folds them into its slot key.
 */

import { create } from "zustand";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import type { KeyValueStorage } from "../lib/storage";
import {
  DEFAULT_SAMPLER,
  parseSampler,
  type SamplerParams,
} from "../lib/inference/sampler.ts";

export const INFERENCE_KEY = "liai_inference_v1";

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
  /** Patch any subset; each value is clamped by the sampler module. */
  setSampler: (patch: Partial<SamplerParams>) => void;
  setUseHexagonNpu: (on: boolean) => void;
  setUseWeightRepacking: (on: boolean) => void;
  setImageMaxTokens: (n: number) => void;
  setDraftModelId: (id: string | null) => void;
  setAutoOffload: (on: boolean) => void;
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
  sampler: { ...DEFAULT_SAMPLER },
  useHexagonNpu: false,
  // Repacking on by default, matching PocketPal's Android default: it makes
  // prompt processing faster for a small memory cost.
  useWeightRepacking: true,
  imageMaxTokens: 512,
  draftModelId: null,
  autoOffload: true,
};

/** Single clamp every numeric param flows through (persist/restore + setters). */
function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
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

export function createInferenceStore(storage: KeyValueStorage) {
  return create<InferenceState>()((set, get) => {
    async function persist(): Promise<void> {
      const {
        nCtx,
        nGpuLayers,
        useMlock,
        useMmap,
        nBatch,
        nUbatch,
        nThreads,
        flashAttn,
        cacheK,
        cacheV,
        speculativeEnabled,
        specDraftGpuLayers,
        specDraftCacheK,
        specDraftCacheV,
        thinkingEnabled,
        sampler,
        useHexagonNpu,
        useWeightRepacking,
        imageMaxTokens,
        draftModelId,
        autoOffload,
      } = get();
      try {
        await storage.setItem(
          INFERENCE_KEY,
          JSON.stringify({
            nCtx,
            nGpuLayers,
            useMlock,
            useMmap,
            nBatch,
            nUbatch,
            nThreads,
            flashAttn,
            cacheK,
            cacheV,
            speculativeEnabled,
            specDraftGpuLayers,
            specDraftCacheK,
            specDraftCacheV,
            thinkingEnabled,
            sampler,
            useHexagonNpu,
            useWeightRepacking,
            imageMaxTokens,
            draftModelId,
            autoOffload,
          }),
        );
      } catch {
        // Non-critical prefs; the running values still apply.
      }
    }

    /** In-flight hydration, so concurrent callers share one read. */
    let hydrating: Promise<void> | null = null;

    return {
      ...DEFAULT_INFERENCE,
      loaded: false,
      load: async () => {
        // Single-flight, and it has to be. The settings screen mounts three
        // cards that each call this on open, so an unguarded read did the same
        // AsyncStorage fetch and parse three times on first mount and again on
        // every visit — and, worse, a read resolving after the user changed a
        // setting would write the stored value back over their change. The
        // store is the in-memory source of truth once hydrated and nothing
        // writes INFERENCE_KEY from outside this store, so a repeat call has
        // nothing left to fetch. `hydrating` is cleared in `finally` so a
        // failed read does not poison every later attempt.
        if (get().loaded) return;
        hydrating ??= (async () => {
          set({
            ...parseInferenceParams(await storage.getItem(INFERENCE_KEY)),
            loaded: true,
          });
        })().finally(() => {
          hydrating = null;
        });
        await hydrating;
      },
      setNCtx: (n) => {
        set({ nCtx: clampInt(n, MIN_CONTEXT, Number.MAX_SAFE_INTEGER) });
        void persist();
      },
      setNGpuLayers: (n) => {
        set({ nGpuLayers: clampInt(n, 0, MAX_GPU_LAYERS) });
        void persist();
      },
      setUseMlock: (on) => {
        set({ useMlock: on });
        void persist();
      },
      setUseMmap: (on) => {
        set({ useMmap: on });
        void persist();
      },
      setNBatch: (n) => {
        set({ nBatch: clampInt(n, 1, MAX_BATCH) });
        void persist();
      },
      setNUbatch: (n) => {
        set({ nUbatch: clampInt(n, 1, MAX_BATCH) });
        void persist();
      },
      setNThreads: (n) => {
        set({ nThreads: clampInt(n, 1, MAX_THREADS) });
        void persist();
      },
      setFlashAttn: (v) => {
        set({ flashAttn: v });
        void persist();
      },
      setCacheK: (v) => {
        set({ cacheK: v });
        void persist();
      },
      setCacheV: (v) => {
        set({ cacheV: v });
        void persist();
      },
      setSpeculativeEnabled: (on) => {
        set({ speculativeEnabled: on });
        void persist();
      },
      setSpecDraftGpuLayers: (n) => {
        set({ specDraftGpuLayers: clampInt(n, 0, MAX_GPU_LAYERS) });
        void persist();
      },
      setSpecDraftCacheK: (v) => {
        set({ specDraftCacheK: v });
        void persist();
      },
      setSpecDraftCacheV: (v) => {
        set({ specDraftCacheV: v });
        void persist();
      },
      setThinkingEnabled: (on) => {
        set({ thinkingEnabled: on });
        void persist();
      },
      setSampler: (patch) => {
        set({ sampler: parseSampler({ ...get().sampler, ...patch }) });
        void persist();
      },
      setUseHexagonNpu: (on) => {
        set({ useHexagonNpu: on });
        void persist();
      },
      setUseWeightRepacking: (on) => {
        set({ useWeightRepacking: on });
        void persist();
      },
      setImageMaxTokens: (n) => {
        set({ imageMaxTokens: clampInt(n, MIN_IMAGE_TOKENS, MAX_IMAGE_TOKENS) });
        void persist();
      },
      setDraftModelId: (id) => {
        set({ draftModelId: id });
        void persist();
      },
      setAutoOffload: (on) => {
        set({ autoOffload: on });
        void persist();
      },
    };
  });
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
