
/** Inference params store + engine key tests. */


import {
  createInferenceStore,
  DEFAULT_INFERENCE,
  INFERENCE_KEY,
  MIN_CONTEXT,
  parseInferenceParams,
} from "../inference";
import { DEFAULT_SAMPLER } from "../../services/inference/sampler";
import { EngineManager } from "../../services/inference/manager";
import { memoryStorage } from "../../jest/storage";

describe("inference store", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it("starts at defaults and marks loaded", async () => {
    const useStore = createInferenceStore(storage);
    await useStore.getState().load();
    const s = useStore.getState();
    expect({
        nCtx: s.nCtx,
        nGpuLayers: s.nGpuLayers,
        useMlock: s.useMlock,
        useMmap: s.useMmap,
        nBatch: s.nBatch,
        nUbatch: s.nUbatch,
        nThreads: s.nThreads,
        flashAttn: s.flashAttn,
        cacheK: s.cacheK,
        cacheV: s.cacheV,
        speculativeEnabled: s.speculativeEnabled,
        specDraftGpuLayers: s.specDraftGpuLayers,
        specDraftCacheK: s.specDraftCacheK,
        specDraftCacheV: s.specDraftCacheV,
        thinkingEnabled: s.thinkingEnabled,
        thinkingOverrides: s.thinkingOverrides,
        // Axis 2 (PocketParity): the per-model effort map rides the same
        // defaults/persist round trip as the thinking overrides.
        effortOverrides: s.effortOverrides,
        jinjaEnabled: s.jinjaEnabled,
        sampler: s.sampler,
        useHexagonNpu: s.useHexagonNpu,
        useWeightRepacking: s.useWeightRepacking,
        imageMaxTokens: s.imageMaxTokens,
        draftModelId: s.draftModelId,
        autoOffload: s.autoOffload,
      }).toEqual({ ...DEFAULT_INFERENCE });
    expect(s.loaded).toEqual(true);
  });

  it("patches the sampler, clamps it, and survives a reload", async () => {
    const useStore = createInferenceStore(storage);
    await useStore.getState().load();
    useStore.getState().setSampler({ temperature: 0.15, topP: 9 });
    await new Promise((r) => setTimeout(r, 0));
    const s = useStore.getState();
    expect(s.sampler.temperature).toEqual(0.15);
    expect(s.sampler.topP).toEqual(1);

    const raw = storage.data[INFERENCE_KEY];
    expect(raw).toBeTruthy();
    const reloaded = createInferenceStore(memoryStorage({ [INFERENCE_KEY]: raw }));
    await reloaded.getState().load();
    expect(reloaded.getState().sampler.temperature).toEqual(0.15);
    expect(reloaded.getState().sampler.topP).toEqual(1);
  });

  it("fills a missing or corrupt sampler from an older save", () => {
    const noSampler = parseInferenceParams(JSON.stringify({ nCtx: 8192 }));
    expect(noSampler.nCtx).toEqual(8192);
    expect(noSampler.sampler).toEqual(DEFAULT_SAMPLER);
    const badSampler = parseInferenceParams(
      JSON.stringify({ sampler: { temperature: "hot" } }),
    );
    expect(badSampler.sampler.temperature).toEqual(DEFAULT_SAMPLER.temperature);
  });

  it("clamps context and gpu layers into range", async () => {
    const useStore = createInferenceStore(storage);
    await useStore.getState().load();
    useStore.getState().setNCtx(1);
    useStore.getState().setNGpuLayers(500);
    expect(useStore.getState().nCtx).toEqual(MIN_CONTEXT);
    expect(useStore.getState().nGpuLayers).toEqual(99);
    useStore.getState().setNGpuLayers(-4);
    expect(useStore.getState().nGpuLayers).toEqual(0);
  });

  it("clamps batch, threads, and draft layers into range", async () => {
    const useStore = createInferenceStore(storage);
    await useStore.getState().load();
    useStore.getState().setNBatch(0);
    useStore.getState().setNUbatch(99999);
    useStore.getState().setNThreads(99);
    useStore.getState().setSpecDraftGpuLayers(-1);
    expect(useStore.getState().nBatch).toEqual(1);
    expect(useStore.getState().nUbatch).toEqual(4096);
    expect(useStore.getState().nThreads).toEqual(16);
    expect(useStore.getState().specDraftGpuLayers).toEqual(0);
  });

  it("toggles attention, cache, speculative, and thinking prefs", async () => {
    const useStore = createInferenceStore(storage);
    await useStore.getState().load();
    useStore.getState().setFlashAttn("off");
    useStore.getState().setCacheK("f16");
    useStore.getState().setCacheV("q4_0");
    useStore.getState().setSpeculativeEnabled(true);
    useStore.getState().setSpecDraftCacheK("f16");
    useStore.getState().setThinkingEnabled(false);
    await new Promise((r) => setTimeout(r, 0));
    const s = useStore.getState();
    expect(s.flashAttn).toEqual("off");
    expect(s.cacheK).toEqual("f16");
    expect(s.cacheV).toEqual("q4_0");
    expect(s.speculativeEnabled).toEqual(true);
    expect(s.specDraftCacheK).toEqual("f16");
    expect(s.thinkingEnabled).toEqual(false);

    const raw = storage.data[INFERENCE_KEY];
    const useStore2 = createInferenceStore(memoryStorage({ [INFERENCE_KEY]: raw }));
    await useStore2.getState().load();
    expect(useStore2.getState().flashAttn).toEqual("off");
    expect(useStore2.getState().thinkingEnabled).toEqual(false);
  });

  it("persists and restores across loads", async () => {
    const useStore = createInferenceStore(storage);
    await useStore.getState().load();
    useStore.getState().setNCtx(8192);
    useStore.getState().setUseMlock(true);
    await new Promise((r) => setTimeout(r, 0));

    const raw = storage.data[INFERENCE_KEY];
    expect(raw).toBeTruthy();
    const useStore2 = createInferenceStore(memoryStorage({ [INFERENCE_KEY]: raw }));
    await useStore2.getState().load();
    expect(useStore2.getState().nCtx).toEqual(8192);
    expect(useStore2.getState().useMlock).toEqual(true);
  });

  it("falls back to defaults on corrupt payloads", () => {
    expect(parseInferenceParams("not json")).toEqual({ ...DEFAULT_INFERENCE });
    expect(parseInferenceParams(null)).toEqual({ ...DEFAULT_INFERENCE });
  });
});

describe("engine manager init key", () => {
  function fakeEngine() {
    return {
      completion: async () => ({ text: "ok", toolCalls: [], promptTokens: 0, completionTokens: 0, stoppedEarly: false }),
      stopCompletion: async () => {},
    };
  }

  it("reloads the local slot when init params change", async () => {
    let loads = 0;
    const manager = new EngineManager(
      {
        loadLocal: async () => {
          loads += 1;
          return { engine: fakeEngine(), release: async () => {} };
        },
        createRemote: () => fakeEngine(),
      },
      async () => null,
    );
    const source = { kind: "local", fileName: "model.gguf" } as const;
    const base = {
      n_ctx: 4096,
      n_gpu_layers: 99,
      use_mlock: false,
      use_mmap: true,
      n_batch: 512,
      n_ubatch: 512,
      n_threads: 4,
      flash_attn_type: "auto" as const,
      cache_type_k: "q8_0" as const,
      cache_type_v: "q8_0" as const,
      speculative: false,
      spec_draft_n_gpu_layers: 99,
      spec_draft_cache_type_k: "q8_0" as const,
      spec_draft_cache_type_v: "q8_0" as const,
      no_extra_bufts: true,
    };
    await manager.ensure(source, undefined, base);
    await manager.ensure(source, undefined, base);
    expect(loads).toEqual(1);
    await manager.ensure(source, undefined, { ...base, n_ctx: 8192 });
    expect(loads).toEqual(2);
    await manager.ensure(source, undefined, { ...base, n_ctx: 8192, n_batch: 1024 });
    expect(loads).toEqual(3);
    await manager.ensure(source, undefined, { ...base, n_ctx: 8192, n_batch: 1024, speculative: true });
    expect(loads).toEqual(4);
  });
});
