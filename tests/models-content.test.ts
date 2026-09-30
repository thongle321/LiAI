import { test } from "node:test";
import assert from "node:assert/strict";

import {
  downloadablePresets,
  modelsContentIsEmpty,
} from "../lib/models/models-content.ts";
import type { ModelSpec, PresetModel } from "../types/models.ts";

// Regression for the blank Models screen: two stale persisted filter
// flags (downloadedOnly + hfOnly) with nothing downloaded made BOTH
// sections hide themselves, leaving a blank body with no explanation.

const base = {
  readyVisible: true,
  availableVisible: true,
  downloadedOnly: false,
  downloadedCount: 0,
  remoteCount: 0,
  downloadableCount: 3,
};

test("a screen with downloadable presets is not empty", () => {
  assert.equal(modelsContentIsEmpty(base), false);
});

test("downloaded-only with nothing downloaded IS empty (the repro)", () => {
  assert.equal(
    modelsContentIsEmpty({ ...base, downloadableCount: 3, downloadedOnly: true }),
    true,
  );
});

test("a downloaded model alone makes the screen non-empty", () => {
  assert.equal(
    modelsContentIsEmpty({ ...base, downloadableCount: 0, downloadedCount: 1 }),
    false,
  );
});

test("a remote provider alone makes the screen non-empty", () => {
  assert.equal(
    modelsContentIsEmpty({ ...base, downloadableCount: 0, remoteCount: 1 }),
    false,
  );
});

test("hiding both sections is empty even with rows behind them", () => {
  assert.equal(
    modelsContentIsEmpty({
      ...base,
      downloadableCount: 5,
      downloadedCount: 2,
      readyVisible: false,
      availableVisible: false,
    }),
    true,
  );
});

const PRESET: PresetModel = {
  id: "qwen3-0.6b",
  name: "Qwen3-0.6B",
  author: "lmstudio-community",
  description: "",
  repo: "lmstudio-community/Qwen3-0.6B-GGUF",
  type: "llm",
  files: [{ name: "Q4_K_M.gguf", size: 400_000_000, downloadUrl: "u" }],
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

test("a fully downloaded preset moves out of Available (it lives in Ready)", () => {
  const finished = spec({
    id: "preset-qwen3-0.6b-Q4_K_M.gguf",
    downloadStatus: "completed",
  });
  assert.deepEqual(downloadablePresets([PRESET], [finished]), []);
  assert.equal(downloadablePresets([PRESET], []).length, 1);
});