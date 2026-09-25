/** On-device engine seam: file resolution + source selection (pure).
 * Run: node --test frontend/tests/engine.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  resolveLocalFile,
  selectEngineSource,
} from "../lib/inference/engine.ts";
import type { ModelSpec, RemoteApiProvider } from "../types/models.ts";

function spec(over: Partial<ModelSpec> = {}): ModelSpec {
  return {
    id: "preset-smollm-135m-SmolLM-135M-Q4_K_M.gguf",
    name: "SmolLM-135M-Q4_K_M.gguf",
    author: "HuggingFaceTB",
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
