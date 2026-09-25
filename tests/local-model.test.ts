/** Local import helper tests. Run: node --test frontend/tests/local-model.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildLocalModelSpec,
  inferLocalModelType,
  numberedFileName,
} from "../lib/local-model.ts";

describe("inferLocalModelType", () => {
  it("detects vision/projection files, defaults to llm", () => {
    assert.equal(inferLocalModelType("llama-3-8b-q4.gguf"), "llm");
    assert.equal(inferLocalModelType("mmproj-f16.gguf"), "vision");
    assert.equal(inferLocalModelType("model.CLIP.gguf"), "vision");
    assert.equal(inferLocalModelType("qwen2-vision-7b.gguf"), "vision");
  });
});

describe("buildLocalModelSpec", () => {
  it("registers an immediately-ready local model", () => {
    const spec = buildLocalModelSpec({ id: "local-1", fileName: "m.gguf", size: 100 });
    assert.equal(spec.origin, "local");
    assert.equal(spec.author, "Local");
    assert.equal(spec.downloadStatus, "completed");
    assert.equal(spec.downloadProgress, 100);
    assert.equal(spec.localPath, "models/local/m.gguf");
    assert.deepEqual(spec.files, [{ name: "m.gguf", size: 100, downloadUrl: "" }]);
  });
});

describe("numberedFileName", () => {
  it("inserts (n) before the extension", () => {
    assert.equal(numberedFileName("m.gguf", 2), "m (2).gguf");
    assert.equal(numberedFileName("noext", 2), "noext (2)");
  });
});
