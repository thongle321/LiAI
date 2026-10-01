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
