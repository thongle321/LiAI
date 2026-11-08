/** Engine manager: slot reuse, switch release, remote factory. */


import { EngineManager } from "../manager";
import type { CompletionEngine } from "../engine";
import type { RemoteApiProvider } from "@/types/models";

function fakeEngine(): CompletionEngine & { stops: number } {
  const engine = {
    stops: 0,
    completion: async () => ({
      text: "x",
      toolCalls: [],
      promptTokens: 0,
      completionTokens: 0,
      stoppedEarly: false,
    }),
    stopCompletion: async () => {
      engine.stops += 1;
    },
  };
  return engine;
}

function provider(): RemoteApiProvider {
  return {
    id: "api-1",
    name: "Mine",
    providerType: "custom_openai",
    baseUrl: "http://localhost:11434",
    apiKey: "",
    modelName: "qwen",
    isActive: false,
  };
}
describe("EngineManager", () => {
  it("reuses the slot when the source key matches", async () => {
    let loads = 0;
    const engine = fakeEngine();
    const manager = new EngineManager(
      {
        loadLocal: async () => {
          loads += 1;
          return { engine, release: async () => {} };
        },
        createRemote: () => fakeEngine(),
      },
      async () => null,
    );
    const first = await manager.ensure({ kind: "local", fileName: "a.gguf" });
    const second = await manager.ensure({ kind: "local", fileName: "a.gguf" });
    expect(first).toEqual(second);
    expect(loads).toEqual(1);
  });

  it("stops and releases the old slot on switch", async () => {
    const first = fakeEngine();
    let released = 0;
    const second = fakeEngine();
    const manager = new EngineManager(
      {
        loadLocal: async (file) => ({
          engine: file === "a.gguf" ? first : second,
          release: async () => {
            released += 1;
          },
        }),
        createRemote: () => fakeEngine(),
      },
      async () => null,
    );
    await manager.ensure({ kind: "local", fileName: "a.gguf" });
    await manager.ensure({ kind: "local", fileName: "b.gguf" });
    expect(first.stops).toEqual(1);
    expect(released).toEqual(1);
  });

  it("builds remote engines with a per-provider key reader", async () => {
    let seenId = "";
    const remote = fakeEngine();
    const manager = new EngineManager(
      {
        loadLocal: async () => ({ engine: fakeEngine(), release: async () => {} }),
        createRemote: (p, getKey) => {
          seenId = p.id;
          void getKey;
          return remote;
        },
      },
      async (id) => (id === "api-1" ? "sk-live" : null),
    );
    const engine = await manager.ensure({ kind: "remote", provider: provider() });
    expect(engine).toEqual(remote);
    expect(seenId).toEqual("api-1");
  });

  it("keys the slot on the projector (vision-series 02)", async () => {
    let loads = 0;
    const seen: (string | undefined)[] = [];
    const manager = new EngineManager(
      {
        loadLocal: async (_f, mmprojPath) => {
          loads += 1;
          seen.push(mmprojPath);
          return { engine: fakeEngine(), release: async () => {} };
        },
        createRemote: () => fakeEngine(),
      },
      async () => null,
    );
    const source = { kind: "local", fileName: "a.gguf" } as const;
    await manager.ensure(source, "mm/a.gguf");
    await manager.ensure(source, "mm/a.gguf");
    expect(loads).toEqual(1);
    await manager.ensure(source, undefined);
    expect(loads).toEqual(2);
    expect(seen).toEqual(["mm/a.gguf", undefined]);
  });

  it("keys the slot on EVERY init field the loader reads", async () => {
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
    const source = { kind: "local", fileName: "a.gguf" } as const;
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
    // Four fields the loader reads but the old key ignored — each one is a
    // real setting the user can change, so each must reload the context.
    await manager.ensure(source, undefined, { ...base, devices: ["HTP:0"] });
    expect(loads).toEqual(2);
    await manager.ensure(source, undefined, { ...base, devices: ["HTP:0"], no_extra_bufts: false });
    expect(loads).toEqual(3);
    await manager.ensure(
      source,
      undefined,
      { ...base, devices: ["HTP:0"], no_extra_bufts: false, model_draft: "/m/draft.gguf" },
    );
    expect(loads).toEqual(4);
    await manager.ensure(
      source,
      undefined,
      {
        ...base,
        devices: ["HTP:0"],
        no_extra_bufts: false,
        model_draft: "/m/draft.gguf",
        image_max_tokens: 512,
      },
    );
    expect(loads).toEqual(5);
  });

  it("releaseAll drops the slot so the next ensure reloads", async () => {
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
    await manager.ensure({ kind: "local", fileName: "a.gguf" });
    await manager.releaseAll();
    await manager.ensure({ kind: "local", fileName: "a.gguf" });
    expect(loads).toEqual(2);
  });
});

describe("EngineManager serialization", () => {
  /** Loader counting loads and per-file releases, for serialization cases.
   *  With a `started` signal, resolves it when the first load begins —
   *  so a test can interleave while that load is still unresolved. */
  function countingLoader(started?: () => void) {
    const engines = new Map<string, ReturnType<typeof fakeEngine>>();
    const released: string[] = [];
    let loads = 0;
    let fired = false;
    const loader = {
      loadLocal: async (file: string) => {
        loads += 1;
        if (started && !fired) {
          fired = true;
          started();
        }
        const engine = fakeEngine();
        engines.set(file, engine);
        return {
          engine,
          release: async () => {
            released.push(file);
          },
        };
      },
      createRemote: () => fakeEngine(),
    };
    return { engines, released, loader, loadsCount: () => loads };
  }

  it("two overlapping ensures for different models yield one switch", async () => {
    const { engines, released, loader, loadsCount } = countingLoader();
    const manager = new EngineManager(loader, async () => null);
    const first = manager.ensure({ kind: "local", fileName: "a.gguf" });
    const second = manager.ensure({ kind: "local", fileName: "b.gguf" });
    const [engineA, engineB] = await Promise.all([first, second]);
    expect(engineA).toBe(engines.get("a.gguf"));
    expect(engineB).toBe(engines.get("b.gguf"));
    // One switch: B torn its predecessor down exactly once, not raced over it.
    expect(released).toEqual(["a.gguf"]);
    expect(engines.get("a.gguf")?.stops).toEqual(1);
    expect(loadsCount()).toEqual(2);
    // The winner's engine is what a subsequent caller receives — no reload.
    const again = await manager.ensure({ kind: "local", fileName: "b.gguf" });
    expect(again).toBe(engineB);
    expect(loadsCount()).toEqual(2);
  });

  it("a release arriving mid-ensure waits and clears the installed slot", async () => {
    let markStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const { released, loader, loadsCount } = countingLoader(markStarted);
    const manager = new EngineManager(loader, async () => null);
    // Invoke the release while the ensure's load is still unresolved.
    const ensurePromise = manager.ensure({ kind: "local", fileName: "a.gguf" });
    await started;
    const releasePromise = manager.releaseAll();
    await Promise.all([ensurePromise, releasePromise]);
    // The queued release ran after ensure completed: it tore the installed
    // context down and left the slot empty — not a no-op against nothing.
    expect(released).toEqual(["a.gguf"]);
    await manager.ensure({ kind: "local", fileName: "a.gguf" });
    expect(loadsCount()).toEqual(2);
  });

  it("a rejecting teardown does not break the queue", async () => {
    let loads = 0;
    const manager = new EngineManager(
      {
        loadLocal: async (file) => {
          loads += 1;
          if (file === "bad.gguf") throw new Error("load failed");
          return { engine: fakeEngine(), release: async () => {} };
        },
        createRemote: () => fakeEngine(),
      },
      async () => null,
    );
    const failing = manager.ensure({ kind: "local", fileName: "bad.gguf" });
    const queued = manager.ensure({ kind: "local", fileName: "b.gguf" });
    await expect(failing).rejects.toThrow("load failed");
    // The queued ensure still runs — and still swaps the slot to its model.
    await expect(queued).resolves.toBeTruthy();
    const again = await manager.ensure({ kind: "local", fileName: "b.gguf" });
    expect(loads).toEqual(2); // the queued load happened exactly once
    expect(again).toBeTruthy();
  });

  it("release after release is a no-op against the empty slot", async () => {
    const { released, loader } = countingLoader();
    const manager = new EngineManager(loader, async () => null);
    await manager.ensure({ kind: "local", fileName: "a.gguf" });
    await manager.releaseAll();
    await manager.releaseAll();
    expect(released).toEqual(["a.gguf"]); // one native teardown, not two
  });
});
