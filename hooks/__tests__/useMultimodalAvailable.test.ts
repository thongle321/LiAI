/**
 * The composer's image gate must be the SAME verdict the send path uses.
 *
 * This locks the store wiring only: the one capability rule itself is tested
 * in `services/inference/__tests__/mmproj.test.ts`. The interesting hook failure
 * is a composer that disagrees with the engine gate, so the tests seed the
 * active state and read the hook's answer live.
 */

import { act, renderHook } from "@testing-library/react-native";

import { useModelStore, type ModelStore } from "@/store/model-store.ts";
import { useMultimodalAvailable } from "../useMultimodalAvailable.ts";
import type { ModelSpec } from "@/types/models.ts";

function visionModel(over: Partial<ModelSpec> = {}): ModelSpec {
  return {
    id: "gemma-3-4b",
    name: "Gemma 3 4B",
    author: "ggml-org",
    description: "Test fixture",
    origin: "preset",
    type: "vision",
    files: [
      {
        name: "gemma-3-4b.gguf",
        size: 999_000_000,
        downloadUrl: "https://example.com/gemma-3-4b.gguf",
      },
    ],
    projector: {
      name: "mmproj-model-f16.gguf",
      size: 999_000_000,
      downloadUrl: "https://example.com/mmproj.gguf",
    },
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
    remoteCaps: {},
    activeModelId: null,
    activeProviderType: null,
    ...over,
  });
}

afterEach(() => {
  seed({});
});

describe("useMultimodalAvailable composer gate", () => {
  it("is true for a completed local model with a paired projector", () => {
    seed({
      activeModelId: "gemma-3-4b",
      activeProviderType: "local",
      models: [visionModel()],
    });
    expect(renderHook(() => useMultimodalAvailable()).result.current).toBe(true);
  });

  it("is false when visionEnabled is off, even with a projector on disk", () => {
    seed({
      activeModelId: "gemma-3-4b",
      activeProviderType: "local",
      models: [visionModel({ visionEnabled: false })],
    });
    expect(renderHook(() => useMultimodalAvailable()).result.current).toBe(false);
  });

  it("is true only when the active remote provider probed vision", () => {
    seed({
      activeModelId: "remote-my-server",
      activeProviderType: "remote",
      remoteCaps: {
        "my-server": {
          reachable: true,
          checkedAt: 1,
          supportsVision: true,
        },
      },
    });
    expect(renderHook(() => useMultimodalAvailable()).result.current).toBe(true);
  });

  it("is false when the remote probe is absent, not merely incomplete", () => {
    seed({
      activeModelId: "remote-my-server",
      activeProviderType: "remote",
      remoteCaps: {
        "my-server": {
          reachable: true,
          checkedAt: 1,
        },
      },
    });
    expect(renderHook(() => useMultimodalAvailable()).result.current).toBe(false);
  });

  it("follows a live model switch without remounting", () => {
    seed({
      activeModelId: "gemma-3-4b",
      activeProviderType: "local",
      models: [visionModel()],
    });
    const { result } = renderHook(() => useMultimodalAvailable());
    expect(result.current).toBe(true);
    act(() => {
      useModelStore.setState({
        activeModelId: null,
        activeProviderType: null,
        models: [],
      });
    });
    expect(result.current).toBe(false);
  });
});
