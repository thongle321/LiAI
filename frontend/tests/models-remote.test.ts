/** Remote slice tests: provider deletion clears stale active refs.
 * Run: node --test frontend/tests/models-remote.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { create } from "zustand";

import { createRemoteSlice } from "../store/models/remote.ts";
import type { ModelStore } from "../store/models/types.ts";
import type { RemoteApiProvider } from "../types/models.ts";

const PROVIDER: RemoteApiProvider = {
  id: "api-1",
  name: "P",
  providerType: "custom_openai",
  baseUrl: "https://llm.example/v1",
  apiKey: "",
  modelName: "user-model",
};

function testStore(seed: Partial<ModelStore>) {
  const initial = {
    models: [],
    remoteApis: [],
    remoteCaps: {},
    activeModelId: null,
    activeProviderType: null,
    privacyAcknowledged: false,
    ...seed,
  };
  // SAFETY: the remote slice only reads/writes its own keys plus the active
  // fields above; the rest of ModelStore is never touched in these tests.
  return create<ModelStore>()((...a) => ({
    ...(initial as ModelStore),
    ...createRemoteSlice(...a),
  }));
}

describe("removeRemoteApi", () => {
  it("clears the active model when its provider is removed", async () => {
    const useStore = testStore({
      remoteApis: [PROVIDER],
      activeModelId: "remote-api-1",
      activeProviderType: "remote",
    });
    await useStore.getState().removeRemoteApi("api-1");
    const state = useStore.getState();
    assert.deepEqual(state.remoteApis, []);
    assert.equal(state.activeModelId, null);
    assert.equal(state.activeProviderType, null);
  });

  it("keeps an unrelated active model", async () => {
    const useStore = testStore({
      remoteApis: [PROVIDER],
      activeModelId: "remote-other",
      activeProviderType: "remote",
    });
    await useStore.getState().removeRemoteApi("api-1");
    const state = useStore.getState();
    assert.deepEqual(state.remoteApis, []);
    assert.equal(state.activeModelId, "remote-other");
    assert.equal(state.activeProviderType, "remote");
  });
});
