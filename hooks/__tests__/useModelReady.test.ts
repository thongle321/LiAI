/** useModelReady must match the engine's real gate, not a non-null id.
 *
 * The bug it locks: a persisted activeModelId whose GGUF was deleted (or
 * that never finished downloading) rehydrates as non-null. A naive
 * `activeModelId !== null` check then lights the voice/vision mic while
 * selectEngineSource returns null and the turn dies on "no model active" —
 * a tap that looks live and does nothing.
 */

import { act, renderHook } from "@testing-library/react-native";

import { useModelReady } from "../useModelReady.ts";
import { useModelStore, type ModelStore } from "../../store/modelStore.ts";
import { buildRemoteModelSpec } from "../../services/models/remote-api.ts";
import type { ModelSpec, RemoteApiProvider } from "../../types/models.ts";

function completedModel(over: Partial<ModelSpec> = {}): ModelSpec {
  return {
    id: "gemma-3-1b",
    name: "Gemma 3 1B",
    author: "ggml-org",
    description: "Test fixture",
    origin: "huggingface",
    type: "llm",
    files: [
      {
        name: "gemma-3-1b.gguf",
        size: 999_000_000,
        downloadUrl: "https://example.com/gemma-3-1b.gguf",
      },
    ],
    downloadStatus: "completed",
    downloadProgress: 100,
    downloadedBytes: 999_000_000,
    totalBytes: 999_000_000,
    ...over,
  };
}

function seed(over: Partial<ModelStore>): void {
  useModelStore.setState({
    models: [],
    activeModelId: null,
    activeProviderType: null,
    remoteApis: [],
    ...over,
  });
}

afterEach(() => {
  seed({});
});

describe("the gate matches the engine's", () => {
  it("is ready for a completed local model", () => {
    seed({
      activeModelId: "gemma-3-1b",
      activeProviderType: "local",
      models: [completedModel()],
    });
    expect(renderHook(() => useModelReady()).result.current).toBe(true);
  });

  it("is NOT ready for a dangling id whose file is gone (the mic bug)", () => {
    // The id is set, but the model is no longer in the list.
    seed({ activeModelId: "gemma-3-1b", activeProviderType: "local" });
    expect(renderHook(() => useModelReady()).result.current).toBe(false);
  });

  it("is NOT ready for a model still downloading", () => {
    seed({
      activeModelId: "gemma-3-1b",
      activeProviderType: "local",
      models: [completedModel({ downloadStatus: "downloading", downloadProgress: 40 })],
    });
    expect(renderHook(() => useModelReady()).result.current).toBe(false);
  });

  it("is NOT ready with no active model", () => {
    seed({ models: [completedModel()] });
    expect(renderHook(() => useModelReady()).result.current).toBe(false);
  });

  it("follows the store live, with no remount", () => {
    seed({ models: [completedModel()] });
    const { result } = renderHook(() => useModelReady());
    expect(result.current).toBe(false);

    act(() => {
      useModelStore.setState({
        activeModelId: "gemma-3-1b",
        activeProviderType: "local",
      });
    });
    expect(result.current).toBe(true);

    // The file disappearing under the active id must un-light the mic too.
    act(() => {
      useModelStore.setState({ models: [] });
    });
    expect(result.current).toBe(false);
  });
});

describe("a remote provider satisfies the gate only as itself", () => {
  const provider: RemoteApiProvider = {
    id: "my-server",
    name: "My Server",
    providerType: "custom_openai",
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    modelName: "qwen3-8b",
    isActive: false,
  };
  const remoteSpec = buildRemoteModelSpec(provider);

  it("is ready when the remote provider is active", () => {
    seed({
      activeModelId: remoteSpec.id,
      activeProviderType: "remote",
      models: [remoteSpec],
      remoteApis: [provider],
    });
    expect(renderHook(() => useModelReady()).result.current).toBe(true);
  });

  it("cannot be satisfied by a remote spec marked as the LOCAL model", () => {
    // The spec is `origin: "remote_api"`, `files: []`, "completed" — it has
    // to be in `models` so the header can name it, and that shape must
    // never read as a loadable local model.
    seed({
      activeModelId: remoteSpec.id,
      activeProviderType: "local",
      models: [remoteSpec],
      remoteApis: [provider],
    });
    expect(renderHook(() => useModelReady()).result.current).toBe(false);
  });

  it("is NOT ready when the remote provider behind the id is gone", () => {
    seed({
      activeModelId: remoteSpec.id,
      activeProviderType: "remote",
      models: [remoteSpec],
    });
    expect(renderHook(() => useModelReady()).result.current).toBe(false);
  });
});
