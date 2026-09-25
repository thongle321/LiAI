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

export const INFERENCE_KEY = "liai_inference_v1";

export const MIN_CONTEXT = 512;
export const MAX_GPU_LAYERS = 99;
export const MAX_BATCH = 4096;
export const MAX_THREADS = 16;

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
};

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
    Math.min(MAX_BATCH, Math.max(1, Math.round(num(k, fallback))));
  const cache = (k: string, fallback: CacheType): CacheType =>
    CACHE_TYPES.includes(v[k] as CacheType) ? (v[k] as CacheType) : fallback;
  return {
    nCtx: Math.max(MIN_CONTEXT, Math.round(num("nCtx", DEFAULT_INFERENCE.nCtx))),
    nGpuLayers: Math.min(
      MAX_GPU_LAYERS,
      Math.max(0, Math.round(num("nGpuLayers", DEFAULT_INFERENCE.nGpuLayers))),
    ),
    useMlock: flag("useMlock", DEFAULT_INFERENCE.useMlock),
    useMmap: flag("useMmap", DEFAULT_INFERENCE.useMmap),
    nBatch: clampBatch("nBatch", DEFAULT_INFERENCE.nBatch),
    nUbatch: clampBatch("nUbatch", DEFAULT_INFERENCE.nUbatch),
    nThreads: Math.min(
      MAX_THREADS,
      Math.max(1, Math.round(num("nThreads", DEFAULT_INFERENCE.nThreads))),
    ),
    flashAttn:
      v.flashAttn === "auto" || v.flashAttn === "on" || v.flashAttn === "off"
        ? v.flashAttn
        : DEFAULT_INFERENCE.flashAttn,
    cacheK: cache("cacheK", DEFAULT_INFERENCE.cacheK),
    cacheV: cache("cacheV", DEFAULT_INFERENCE.cacheV),
    speculativeEnabled: flag("speculativeEnabled", DEFAULT_INFERENCE.speculativeEnabled),
    specDraftGpuLayers: Math.min(
      MAX_GPU_LAYERS,
      Math.max(0, Math.round(num("specDraftGpuLayers", DEFAULT_INFERENCE.specDraftGpuLayers))),
    ),
    specDraftCacheK: cache("specDraftCacheK", DEFAULT_INFERENCE.specDraftCacheK),
    specDraftCacheV: cache("specDraftCacheV", DEFAULT_INFERENCE.specDraftCacheV),
    thinkingEnabled: flag("thinkingEnabled", DEFAULT_INFERENCE.thinkingEnabled),
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
          }),
        );
      } catch {
        // Non-critical prefs; the running values still apply.
      }
    }

    return {
      ...DEFAULT_INFERENCE,
      loaded: false,
      load: async () => {
        set({ ...parseInferenceParams(await storage.getItem(INFERENCE_KEY)), loaded: true });
      },
      setNCtx: (n) => {
        set({ nCtx: Math.max(MIN_CONTEXT, Math.round(n)) });
        void persist();
      },
      setNGpuLayers: (n) => {
        set({ nGpuLayers: Math.min(MAX_GPU_LAYERS, Math.max(0, Math.round(n))) });
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
        set({ nBatch: Math.min(MAX_BATCH, Math.max(1, Math.round(n))) });
        void persist();
      },
      setNUbatch: (n) => {
        set({ nUbatch: Math.min(MAX_BATCH, Math.max(1, Math.round(n))) });
        void persist();
      },
      setNThreads: (n) => {
        set({ nThreads: Math.min(MAX_THREADS, Math.max(1, Math.round(n))) });
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
        set({ specDraftGpuLayers: Math.min(MAX_GPU_LAYERS, Math.max(0, Math.round(n))) });
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
