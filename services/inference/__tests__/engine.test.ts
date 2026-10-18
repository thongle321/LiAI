/** On-device engine seam: file resolution + source selection. */


import {
  resolveLocalFile,
  selectEngineSource,
} from "../engine";
import type { ModelSpec, RemoteApiProvider } from "@/types/models";

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
describe("selectEngineSource", () => {
  it("selects local when a completed GGUF is active", () => {
    const out = selectEngineSource({
      activeModelId: spec().id,
      activeProviderType: "local",
      models: [spec()],
      remoteApis: [],
    });
    expect(out).toEqual({ kind: "local", fileName: spec().files[0].name });
  });

  it("selects remote when a provider row is active", () => {
    const out = selectEngineSource({
      activeModelId: "remote-api-1",
      activeProviderType: "remote",
      models: [],
      remoteApis: [provider()],
    });
    expect(out).toEqual({
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
    expect(out).toEqual(null);
  });

  it("returns null when nothing is active", () => {
    expect(selectEngineSource({
        activeModelId: null,
        activeProviderType: null,
        models: [spec()],
        remoteApis: [],
      })).toEqual(null);
  });
});

describe("resolveLocalFile", () => {
  it("joins the models dir without touching the network", () => {
    expect(resolveLocalFile("/docs", "a.gguf")).toEqual("/docs/models/a.gguf");
  });

  it("strips directory tricks from the file name", () => {
    expect(resolveLocalFile("/docs", "../evil.gguf")).toEqual("/docs/models/evil.gguf");
    expect(resolveLocalFile("/docs", "sub/a.gguf")).toEqual("/docs/models/a.gguf");
  });
});
