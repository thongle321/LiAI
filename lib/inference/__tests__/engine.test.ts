/** On-device engine seam: file resolution + source selection (pure).
 * Run: node --test frontend/tests/engine.test.ts */


import {
  resolveLocalFile,
  selectEngineSource,
} from "../engine";
import type { ModelSpec, RemoteApiProvider } from "../../../types/models";

function spec(over: Partial<ModelSpec> = {}): ModelSpec {
  return {
    id: "preset-smollm-135m-SmolLM-135M-Q4_K_M.gguf",
    name: "SmolLM-135M-Q4_K_M.gguf",
    author: "HuggingFaceTB",
    description: "Test fixture",
    origin: "preset",
    type: "llm",
    downloadStatus: "completed",
    downloadProgress: 100,
    downloadedBytes: 1,
    totalBytes: 1,
    files: [
      {
        name: "SmolLM-135M-Q4_K_M.gguf",
        size: 1,
        downloadUrl: "https://example.com/a.gguf",
      },
    ],
    ...over,
  };
}

function provider(over: Partial<RemoteApiProvider> = {}): RemoteApiProvider {
  return {
    id: "api-1",
    name: "Mine",
    providerType: "custom_openai",
    baseUrl: "http://localhost:11434",
    apiKey: "",
    modelName: "qwen",
    isActive: false,
    ...over,
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

describe("selectEngineSource", () => {
  it("selects local when a completed GGUF is active", () => {
    const out = selectEngineSource({
      activeModelId: spec().id,
      activeProviderType: "local",
      models: [spec()],
      remoteApis: [],
    });
    assert.deepEqual(out, { kind: "local", fileName: spec().files[0].name });
  });

  it("selects remote when a provider row is active", () => {
    const out = selectEngineSource({
      activeModelId: "remote-api-1",
      activeProviderType: "remote",
      models: [],
      remoteApis: [provider()],
    });
    assert.deepEqual(out, {
      kind: "remote",
      provider: provider(),
    });
  });

  it("returns null when the active model is not downloaded", () => {
    const out = selectEngineSource({
      activeModelId: spec().id,
      activeProviderType: "local",
      models: [spec({ downloadStatus: "downloading" })],
      remoteApis: [],
    });
    assert.equal(out, null);
  });

  it("returns null when nothing is active", () => {
    assert.equal(
      selectEngineSource({
        activeModelId: null,
        activeProviderType: null,
        models: [spec()],
        remoteApis: [],
      }),
      null,
    );
  });
});

describe("resolveLocalFile", () => {
  it("joins the models dir without touching the network", () => {
    assert.equal(
      resolveLocalFile("/docs", "a.gguf"),
      "/docs/models/a.gguf",
    );
  });

  it("strips directory tricks from the file name", () => {
    assert.equal(resolveLocalFile("/docs", "../evil.gguf"), "/docs/models/evil.gguf");
    assert.equal(resolveLocalFile("/docs", "sub/a.gguf"), "/docs/models/a.gguf");
  });
});
