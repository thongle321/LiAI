/** Engine manager: slot reuse, switch release, remote factory (TDD).
 * Run: node --test frontend/tests/inference-manager.test.ts */


import { EngineManager } from "../manager";
import type { CompletionEngine } from "../engine";
import type { RemoteApiProvider } from "../../../types/models";

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

const assert: any = {
  ok: (v: unknown, msg?: string) => expect(v).toBeTruthy(),
  equal: (a: unknown, b: unknown, msg?: string) => expect(a).toEqual(b),
  deepEqual: (a: unknown, b: unknown, msg?: string) => expect(a).toEqual(b),
  strictEqual: (a: unknown, b: unknown, msg?: string) => expect(a).toBe(b),
  notEqual: (a: unknown, b: unknown, msg?: string) => expect(a).not.toEqual(b),
  notDeepEqual: (a: unknown, b: unknown, msg?: string) => expect(a).not.toEqual(b),
  match: (value: string, re: RegExp | string, msg?: string) => expect(value).toMatch(re as any),
  doesNotMatch: (value: string, re: RegExp | string, msg?: string) => expect(value).not.toMatch(re as any),
  throws: (fn: () => void, re?: RegExp | string, msg?: string) => expect(fn).toThrow(re as any),
  doesNotThrow: (fn: () => void, msg?: string) => expect(fn).not.toThrow(),
  rejects: async (input: any, expected?: any, msg?: string) => {
    const p = typeof input === "function" ? input() : input;
    let err: unknown;
    try {
      await p;
    } catch (e) {
      err = e;
    }
    if (err === undefined) {
      throw new Error("Expected promise to reject, but it resolved");
    }
    if (expected === undefined) return;
    if (typeof expected === "function") {
      if (expected.prototype) {
        if (!(err instanceof expected)) {
          throw new Error(msg ?? "rejected value not instance of expected constructor");
        }
      } else if (!expected(err)) {
        throw new Error(msg ?? "rejected value did not satisfy validator");
      }
    } else if (expected instanceof RegExp) {
      if (!expected.test(String((err as Error)?.message ?? err))) {
        throw new Error(msg ?? "rejected message did not match");
      }
    } else if (typeof expected === "string") {
      if (!String((err as Error)?.message ?? err).includes(expected)) {
        throw new Error(msg ?? "rejected message did not include expected text");
      }
    } else if (expected instanceof Error) {
      if (((err as Error)?.message ?? String(err)) !== expected.message) {
        throw new Error(msg ?? "rejected message did not match");
      }
    }
  },
};

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
    assert.equal(first, second);
    assert.equal(loads, 1);
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
    assert.equal(first.stops, 1);
    assert.equal(released, 1);
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
    assert.equal(engine, remote);
    assert.equal(seenId, "api-1");
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
    assert.equal(loads, 1, "same model + same projector reuses the slot");
    await manager.ensure(source, undefined);
    assert.equal(loads, 2, "detaching the projector must NOT reuse the stale context");
    assert.deepEqual(seen, ["mm/a.gguf", undefined]);
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
    assert.equal(loads, 1, "identical init reuses the slot");
    // Four fields the loader reads but the old key ignored — each one is a
    // real setting the user can change, so each must reload the context.
    await manager.ensure(source, undefined, { ...base, devices: ["HTP:0"] });
    assert.equal(loads, 2, "devices change must reload");
    await manager.ensure(source, undefined, { ...base, devices: ["HTP:0"], no_extra_bufts: false });
    assert.equal(loads, 3, "weight-repacking change must reload");
    await manager.ensure(
      source,
      undefined,
      { ...base, devices: ["HTP:0"], no_extra_bufts: false, model_draft: "/m/draft.gguf" },
    );
    assert.equal(loads, 4, "draft-model change must reload");
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
    assert.equal(loads, 5, "image budget change must reload");
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
    assert.equal(loads, 2);
  });
});
