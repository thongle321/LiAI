/** Engine manager: slot reuse, switch release, remote factory (TDD).
 * Run: node --test frontend/tests/inference-manager.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { EngineManager } from "../lib/inference/manager.ts";
import type { CompletionEngine } from "../lib/inference/engine.ts";
import type { RemoteApiProvider } from "../types/models.ts";

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
