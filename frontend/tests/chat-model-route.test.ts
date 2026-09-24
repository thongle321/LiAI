/** Chat model routing tests: active model -> model_id/byok (pure).
 * Run: node --test frontend/tests/chat-model-route.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveChatModel } from "../lib/chat/model-route.ts";
import { buildPresetModelSpec, getPresets } from "../lib/models/huggingface.ts";
import type { ModelSpec, RemoteApiProvider } from "../types/models.ts";

const PROVIDER: RemoteApiProvider = {
  id: "api-1",
  name: "P",
  providerType: "custom_openai",
  baseUrl: "https://llm.example/v1",
  apiKey: "",
  modelName: "user-model",
};

async function localSpec(status: ModelSpec["downloadStatus"]): Promise<ModelSpec> {
  const [preset] = await getPresets();
  return { ...buildPresetModelSpec(preset, preset.files[0]), downloadStatus: status };
}

describe("resolveChatModel", () => {
  it("returns null with no active model", async () => {
    assert.equal(
      await resolveChatModel({
        activeModelId: null,
        activeProviderType: null,
        models: [],
        remoteApis: [],
        readKey: async () => "k",
      }),
      null,
    );
  });

  it("maps a completed local model to its backend filename", async () => {
    const spec = await localSpec("completed");
    assert.deepEqual(
      await resolveChatModel({
        activeModelId: spec.id,
        activeProviderType: "local",
        models: [spec],
        remoteApis: [],
        readKey: async () => "k",
      }),
      { model_id: spec.files[0].name },
    );
  });

  it("returns null for incomplete or missing local specs", async () => {
    const spec = await localSpec("idle");
    const base = {
      activeProviderType: "local" as const,
      models: [spec],
      remoteApis: [],
      readKey: async () => "k",
    };
    assert.equal(await resolveChatModel({ ...base, activeModelId: spec.id }), null);
    assert.equal(await resolveChatModel({ ...base, activeModelId: "ghost" }), null);
  });

  it("maps an active remote provider to model_id + byok", async () => {
    assert.deepEqual(
      await resolveChatModel({
        activeModelId: "remote-api-1",
        activeProviderType: "remote",
        models: [],
        remoteApis: [PROVIDER],
        readKey: async (id) => (id === "api-1" ? "secret" : null),
      }),
      {
        model_id: "remote-api-1",
        byok: {
          provider: "custom_openai",
          base_url: "https://llm.example/v1",
          api_key: "secret",
          model: "user-model",
        },
      },
    );
  });

  it("returns null when the remote provider or key is gone", async () => {
    const base = {
      activeModelId: "remote-api-1",
      activeProviderType: "remote" as const,
      models: [],
    };
    assert.equal(
      await resolveChatModel({ ...base, remoteApis: [], readKey: async () => "k" }),
      null,
    );
    assert.equal(
      await resolveChatModel({
        ...base,
        remoteApis: [PROVIDER],
        readKey: async () => null,
      }),
      null,
    );
  });
});
