/** Per-file download state mapping (preset cards). Run: node --test tests/file-state.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isPresetDownloaded, presetCardState, presetFileState } from "../lib/models/file-state.ts";
import type { ModelSpec, PresetModel } from "../types/models.ts";

const PRESET: PresetModel = {
  id: "qwen3-0.6b",
  name: "Qwen3-0.6B",
  author: "lmstudio-community",
  description: "",
  repo: "lmstudio-community/Qwen3-0.6B-GGUF",
  type: "llm",
  files: [
    { name: "Qwen3-0.6B-Q4_K_M.gguf", size: 10, downloadUrl: "u1", quantization: "Q4_K_M" },
    { name: "Qwen3-0.6B-Q8_0.gguf", size: 20, downloadUrl: "u2", quantization: "Q8_0" },
  ],
};

function spec(over: Partial<ModelSpec>): ModelSpec {
  return {
    id: "x",
    name: "x",
    author: "x",
    description: "",
    origin: "preset",
    type: "llm",
    files: [],
    downloadStatus: "idle",
    downloadProgress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    ...over,
  };
}

describe("presetFileState", () => {
  it("is idle per file when nothing stored", () => {
    for (const f of PRESET.files) {
      assert.deepEqual(presetFileState([], PRESET.id, f), {
        status: "idle",
        progress: 0,
        downloaded: 0,
        total: 0,
      });
    }
  });

  it("isolates state per file: one downloading leaves the other idle", () => {
    const models = [
      spec({
        id: "preset-qwen3-0.6b-Qwen3-0.6B-Q4_K_M.gguf",
        downloadStatus: "downloading",
        downloadProgress: 37,
        downloadedBytes: 37,
        totalBytes: 100,
      }),
    ];
    assert.deepEqual(presetFileState(models, PRESET.id, PRESET.files[0]), {
      status: "downloading",
      progress: 37,
      downloaded: 37,
      total: 100,
    });
    assert.deepEqual(presetFileState(models, PRESET.id, PRESET.files[1]), {
      status: "idle",
      progress: 0,
      downloaded: 0,
      total: 0,
    });
  });

  it("attaches the error to the failing file only", () => {
    const models = [
      spec({
        id: "preset-qwen3-0.6b-Qwen3-0.6B-Q8_0.gguf",
        downloadStatus: "failed",
        error: "HTTP 401",
      }),
    ];
    assert.deepEqual(presetFileState(models, PRESET.id, PRESET.files[1]), {
      status: "failed",
      progress: 0,
      downloaded: 0,
      total: 0,
      error: "HTTP 401",
    });
    assert.deepEqual(presetFileState(models, PRESET.id, PRESET.files[0]), {
      status: "idle",
      progress: 0,
      downloaded: 0,
      total: 0,
    });
  });

  it("passes live speed through to the downloading file only", () => {
    const models = [
      spec({
        id: "preset-qwen3-0.6b-Qwen3-0.6B-Q4_K_M.gguf",
        downloadStatus: "downloading",
        downloadProgress: 37,
        downloadedBytes: 37,
        totalBytes: 100,
        speedBytesPerSec: 1_048_576,
      }),
    ];
    assert.deepEqual(presetFileState(models, PRESET.id, PRESET.files[0]), {
      status: "downloading",
      progress: 37,
      downloaded: 37,
      total: 100,
      speed: 1_048_576,
    });
    assert.deepEqual(presetFileState(models, PRESET.id, PRESET.files[1]), {
      status: "idle",
      progress: 0,
      downloaded: 0,
      total: 0,
    });
  });
});

describe("isPresetDownloaded", () => {
  it("is false with nothing stored", () => {
    assert.equal(isPresetDownloaded([], PRESET), false);
  });

  it("is false when only one file finished", () => {
    const models = [
      spec({
        id: "preset-qwen3-0.6b-Qwen3-0.6B-Q4_K_M.gguf",
        downloadStatus: "completed",
      }),
    ];
    assert.equal(isPresetDownloaded(models, PRESET), false);
  });

  it("is true when every file finished", () => {
    const models = PRESET.files.map((f) =>
      spec({
        id: `preset-qwen3-0.6b-${f.name}`,
        downloadStatus: "completed",
      }),
    );
    assert.equal(isPresetDownloaded(models, PRESET), true);
  });
});

describe("presetCardState", () => {
  it("idle with no stored specs", () => {
    assert.equal(presetCardState([], PRESET).status, "idle");
  });

  it("prefers the downloading file's progress", () => {
    const models = [
      spec({
        id: "preset-qwen3-0.6b-Qwen3-0.6B-Q4_K_M.gguf",
        downloadStatus: "downloading",
        downloadProgress: 50,
        downloadedBytes: 5,
        totalBytes: 10,
      }),
    ];
    const card = presetCardState(models, PRESET);
    assert.equal(card.status, "downloading");
    assert.equal(card.progress, 50);
  });

  it("completed only when every file is downloaded", () => {
    const one = [
      spec({
        id: "preset-qwen3-0.6b-Qwen3-0.6B-Q4_K_M.gguf",
        downloadStatus: "completed",
      }),
    ];
    assert.equal(presetCardState(one, PRESET).status, "idle");
    const both = [
      ...one,
      spec({
        id: "preset-qwen3-0.6b-Qwen3-0.6B-Q8_0.gguf",
        downloadStatus: "completed",
      }),
    ];
    assert.equal(presetCardState(both, PRESET).status, "completed");
  });
});
