/** useModelReady must match the engine's real gate, not just a non-null id.
 *
 * The bug it locks: a persisted activeModelId whose GGUF was deleted (or
 * that never finished downloading) rehydrates as non-null. A naive
 * `activeModelId !== null` check then lights the voice/vision mic while
 * selectEngineSource returns null and the turn dies on "no model active" —
 * a tap that looks live and does nothing. useModelReady therefore asks
 * selectEngineSource itself.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { selectEngineSource } from "../lib/inference/engine.ts";
import { pickableModels } from "../lib/chat/models.ts";
import { buildRemoteModelSpec } from "../lib/models/remote-api.ts";
import type { RemoteApiProvider } from "../types/models.ts";

const completedModel = {
  id: "gemma-3-1b",
  name: "Gemma 3 1B",
  author: "ggml-org",
  description: "Test fixture",
  type: "llm" as const,
  params: 1_000_000_000,
  files: [
    {
      name: "gemma-3-1b.gguf",
      size: 999_000_000,
      downloadUrl: "https://example.com/gemma-3-1b.gguf",
    },
  ],
  downloadStatus: "completed" as const,
  downloadProgress: 100,
  downloadedBytes: 999_000_000,
  totalBytes: 999_000_000,
  origin: "huggingface" as const,
  createdAt: 0,
};

function ready(input: Parameters<typeof selectEngineSource>[0]): boolean {
  return selectEngineSource(input) !== null;
}

describe("useModelReady gate matches the engine", () => {
  it("is ready for a completed local model", () => {
    assert.equal(
      ready({
        activeModelId: "gemma-3-1b",
        activeProviderType: "local",
        models: [completedModel],
        remoteApis: [],
      }),
      true,
    );
  });

  it("is NOT ready for a dangling id whose file is gone (the mic bug)", () => {
    // id is set, but the model is no longer in the list.
    assert.equal(
      ready({
        activeModelId: "gemma-3-1b",
        activeProviderType: "local",
        models: [],
        remoteApis: [],
      }),
      false,
    );
  });

  it("is NOT ready for a model still downloading", () => {
    assert.equal(
      ready({
        activeModelId: "gemma-3-1b",
        activeProviderType: "local",
        models: [{ ...completedModel, downloadStatus: "downloading" }],
        remoteApis: [],
      }),
      false,
    );
  });

  it("is NOT ready with no active model", () => {
    assert.equal(
      ready({
        activeModelId: null,
        activeProviderType: null,
        models: [completedModel],
        remoteApis: [],
      }),
      false,
    );
  });
});

/** The two readiness readers disagreed, and the composer lost.
 *
 * A remote provider is written into `models` as a spec with
 * `origin: "remote_api"`, `files: []` and `downloadStatus: "completed"`
 * (lib/models/remote-api.ts) — it has to be, because that spec is the only
 * thing that marks a remote model active in the header.
 *
 * `pickableModels` scanned `models` for `downloadStatus === "completed"`
 * with no `origin` and no `files` check, so it offered that spec as a LOCAL
 * model. The header then named it, and chat.tsx's `target.host ===
 * undefined` handed its `remote-…` id to `setActiveModel(id, "local")` —
 * after which `selectEngineSource` returned null forever and the composer
 * read "Model not loaded." under a header still showing the model name.
 *
 * The fix is one predicate both readers call, so they cannot drift again.
 */
describe("a remote provider's spec is never a local model", () => {
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

  it("sanity: the fixture is the completed-but-file-less shape", () => {
    assert.equal(remoteSpec.origin, "remote_api");
    assert.equal(remoteSpec.downloadStatus, "completed");
    assert.deepEqual(remoteSpec.files, []);
  });

  it("is not offered as a pickable local model", () => {
    assert.deepEqual(pickableModels([remoteSpec], [], null), []);
  });

  it("is still offered once, as the remote provider it is", () => {
    // Not `active: true` — remote rows match on `p.id` while the store holds
    // `remote-<providerId>`, so that flag has never lit. Pre-existing and
    // out of scope here; this test only pins that the spec is not
    // double-offered, once as local and once as remote.
    const pickable = pickableModels([remoteSpec], [provider], null);
    assert.equal(pickable.length, 1);
    assert.equal(pickable[0].id, provider.id);
    assert.equal(pickable[0].host, "api.example.com");
  });

  it("cannot satisfy the engine as a local source", () => {
    assert.equal(
      ready({
        activeModelId: remoteSpec.id,
        activeProviderType: "local",
        models: [remoteSpec],
        remoteApis: [provider],
      }),
      false,
    );
  });

  it("keeps a real local model offered alongside a remote spec", () => {
    const pickable = pickableModels([remoteSpec, completedModel], [], null);
    assert.deepEqual(
      pickable.map((m) => m.id),
      ["gemma-3-1b"],
    );
  });
});
