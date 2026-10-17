/** Model fakes shared by the models tests (jest/fixtures — the harness's home
 *  for shared fakes, per AGENTS.md).
 *
 *  Factories, not constants: a preset's file list is the thing these tests
 *  disagree about (a one-file catalog preset vs a multi-file stand-in), so
 *  each caller states its own. */

import type { ModelSpec, PresetModel } from "@/types/models.ts";

/** A catalog preset with two quantization files, the shape the catalog's
 *  grouping rules are written against. */
export function makePreset(over: Partial<PresetModel> = {}): PresetModel {
  return {
    id: "qwen3-0.6b",
    name: "Qwen3-0.6B",
    author: "lmstudio-community",
    description: "",
    repo: "lmstudio-community/Qwen3-0.6B-GGUF",
    type: "llm",
    files: [
      {
        name: "Qwen3-0.6B-Q4_K_M.gguf",
        size: 10,
        downloadUrl: "u1",
        quantization: "Q4_K_M",
      },
      {
        name: "Qwen3-0.6B-Q8_0.gguf",
        size: 20,
        downloadUrl: "u2",
        quantization: "Q8_0",
      },
    ],
    ...over,
  };
}

/** A store row. Defaults to the preset spec id so a caller only has to state
 *  the fields it is actually about. */
export function makeSpec(over: Partial<ModelSpec> = {}): ModelSpec {
  return {
    id: "preset-qwen3-0.6b-Qwen3-0.6B-Q4_K_M.gguf",
    name: "Qwen3-0.6B (Qwen3-0.6B-Q4_K_M.gguf)",
    author: "lmstudio-community",
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
