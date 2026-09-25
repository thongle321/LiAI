/** Inference params store + engine key tests. Run: node --test tests/inference-settings.test.ts */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  createInferenceStore,
  DEFAULT_INFERENCE,
  INFERENCE_KEY,
  MIN_CONTEXT,
  parseInferenceParams,
} from "../store/inference.ts";
import { EngineManager } from "../lib/inference/manager.ts";
import { memoryStorage } from "./fakes.ts";

describe("inference store", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it("starts at defaults and marks loaded", async () => {
    const useStore = createInferenceStore(storage);
    await useStore.getState().load();
    const s = useStore.getState();
    assert.deepEqual(
      {
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
      },
      { ...DEFAULT_INFERENCE },
    );
    assert.equal(s.loaded, true);
  });

  it("clamps context and gpu layers into range", async () => {
    const useStore = createInferenceStore(storage);
    await useStore.getState().load();
    useStore.getState().setNCtx(1);
    useStore.getState().setNGpuLayers(500);
    assert.equal(useStore.getState().nCtx, MIN_CONTEXT);
    assert.equal(useStore.getState().nGpuLayers, 99);
    useStore.getState().setNGpuLayers(-4);
    assert.equal(useStore.getState().nGpuLayers, 0);
  });

  it("clamps batch, threads, and draft layers into range", async () => {
    const useStore = createInferenceStore(storage);
    await useStore.getState().load();
    useStore.getState().setNBatch(0);
    useStore.getState().setNUbatch(99999);
    useStore.getState().setNThreads(99);
    useStore.getState().setSpecDraftGpuLayers(-1);
    assert.equal(useStore.getState().nBatch, 1);
    assert.equal(useStore.getState().nUbatch, 4096);
    assert.equal(useStore.getState().nThreads, 16);
    assert.equal(useStore.getState().specDraftGpuLayers, 0);
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
    assert.equal(s.flashAttn, "off");
    assert.equal(s.cacheK, "f16");
    assert.equal(s.cacheV, "q4_0");
    assert.equal(s.speculativeEnabled, true);
    assert.equal(s.specDraftCacheK, "f16");
    assert.equal(s.thinkingEnabled, false);

    const raw = storage.data[INFERENCE_KEY];
    const useStore2 = createInferenceStore(memoryStorage({ [INFERENCE_KEY]: raw }));
    await useStore2.getState().load();
    assert.equal(useStore2.getState().flashAttn, "off");
    assert.equal(useStore2.getState().thinkingEnabled, false);
  });

  it("persists and restores across loads", async () => {
    const useStore = createInferenceStore(storage);
    await useStore.getState().load();
    useStore.getState().setNCtx(8192);
    useStore.getState().setUseMlock(true);
    await new Promise((r) => setTimeout(r, 0));

    const raw = storage.data[INFERENCE_KEY];
    assert.ok(raw);
    const useStore2 = createInferenceStore(memoryStorage({ [INFERENCE_KEY]: raw }));
    await useStore2.getState().load();
    assert.equal(useStore2.getState().nCtx, 8192);
    assert.equal(useStore2.getState().useMlock, true);
  });

  it("falls back to defaults on corrupt payloads", () => {
    assert.deepEqual(parseInferenceParams("not json"), { ...DEFAULT_INFERENCE });
    assert.deepEqual(parseInferenceParams(null), { ...DEFAULT_INFERENCE });
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
    };
    await manager.ensure(source, undefined, base);
    await manager.ensure(source, undefined, base);
    assert.equal(loads, 1);
    await manager.ensure(source, undefined, { ...base, n_ctx: 8192 });
    assert.equal(loads, 2);
    await manager.ensure(source, undefined, { ...base, n_ctx: 8192, n_batch: 1024 });
    assert.equal(loads, 3);
    await manager.ensure(source, undefined, { ...base, n_ctx: 8192, n_batch: 1024, speculative: true });
    assert.equal(loads, 4);
  });
});
