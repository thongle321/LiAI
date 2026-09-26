/** Model spec id tests. Run: node --test frontend/tests/model-spec.test.ts
 *
 * Guards the invariant the download-id bug violated: a stored spec's id is
 * preset-<presetId>-<fileName> / hf-<modelId>-<fileName>, NOT the raw
 * preset/HF id the UI passes to startDownload.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildHfModelSpec,
  buildPresetModelSpec,
  hfRefFromId,
} from "../lib/models/huggingface.ts";

describe("buildPresetModelSpec", () => {
  it("ids the spec by preset + file and keeps the download url", () => {
    const spec = buildPresetModelSpec(
      {
        id: "smollm-135m",
        name: "SmolLM",
        author: "HF",
        description: "",
        repo: "HuggingFaceTB/SmolLM-135M",
        type: "llm",
        files: [],
      },
      {
        name: "SmolLM-135M-Q4_K_M.gguf",
        size: 92_000_000,
        downloadUrl: "https://hf/u",
        quantization: "Q4_K_M",
      },
    );
    assert.equal(spec.id, "preset-smollm-135m-SmolLM-135M-Q4_K_M.gguf");
    assert.equal(spec.origin, "preset");
    assert.equal(spec.files[0].downloadUrl, "https://hf/u");
  });
});

describe("buildHfModelSpec", () => {
  it("ids by hf-<modelId>-<file> and keeps the resolved url", () => {
    const url = "https://huggingface.co/Qwen/Qwen2.5-0.5B/resolve/main/m.gguf";
    const spec = buildHfModelSpec(hfRefFromId("Qwen/Qwen2.5-0.5B"), {
      name: "m.gguf",
      size: 10,
      path: "m.gguf",
      downloadUrl: url,
    });
    assert.equal(spec.id, "hf-Qwen/Qwen2.5-0.5B-m.gguf");
    assert.equal(spec.origin, "huggingface");
    assert.equal(spec.files[0].downloadUrl, url);
  });
});
