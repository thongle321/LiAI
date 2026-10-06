/** GGUF header → ModelSpec.ggufMetadata (pure, no device, no native).
 *
 * Run: node --test tests/gguf-metadata.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  ggufMetadataFromHeader,
  maxContextLength,
} from "../lib/models/gguf-metadata.ts";
import {
  estimateModelMemory,
  toMemoryMetadata,
} from "../lib/models/memoryEstimator.ts";
import { makeFitStatusFor } from "../lib/models/context-fit.ts";

describe("maxContextLength", () => {
  it("resolves the architecture-prefixed key", () => {
    const header = {
      "general.architecture": "qwen3",
      "qwen3.context_length": 40960,
      // A sibling architecture's value must not leak in.
      "llama.context_length": 8192,
    };
    assert.equal(maxContextLength(header), 40960);
  });

  it("coerces a value that arrives as a string", () => {
    assert.equal(
      maxContextLength({
        "general.architecture": "llama",
        "llama.context_length": "131072",
      }),
      131072,
    );
  });

  it("returns nothing rather than guessing", () => {
    // No architecture: every key is unaddressable, so there is no answer.
    assert.equal(maxContextLength({ "llama.context_length": 8192 }), undefined);
    // Architecture known, key absent: an unknown maximum, not a default.
    assert.equal(
      maxContextLength({ "general.architecture": "llama" }),
      undefined,
    );
    // Nonsense values read as absent, never coerced to a number.
    for (const bad of ["", "abc", 0, -1, null, {}]) {
      assert.equal(
        maxContextLength({
          "general.architecture": "llama",
          "llama.context_length": bad,
        }),
        undefined,
        `context_length=${JSON.stringify(bad)}`,
      );
    }
  });
});

describe("ggufMetadataFromHeader", () => {
  // A trimmed-down llama-architecture header, values as the format
  // actually delivers them (some stringified).
  const HEADER = {
    "general.architecture": "llama",
    "llama.block_count": "32",
    "llama.embedding_length": 4096,
    "llama.attention.head_count": 32,
    "llama.attention.head_count_kv": 8,
    "llama.vocab_size": 128256,
    "llama.context_length": 131072,
    // Head dims are omitted exactly as llama.cpp omits them when they
    // match n_embd / n_head.
    "llama.attention.sliding_window": 4096,
  };

  it("flattens the prefixed keys into what the readers read", () => {
    assert.deepEqual(ggufMetadataFromHeader(HEADER), {
      architecture: "llama",
      context_length: 131072,
      n_layers: 32,
      n_embd: 4096,
      n_head: 32,
      n_head_kv: 8,
      n_vocab: 128256,
      // Derived, not read: the header does not carry them.
      n_embd_head_k: 128,
      n_embd_head_v: 128,
      sliding_window: 4096,
    });
  });

  it("keeps explicit head dims ahead of the derived ones", () => {
    const out = ggufMetadataFromHeader({
      ...HEADER,
      "llama.attention.key_length": 64,
      "llama.attention.value_length": 96,
    });
    assert.equal(out?.n_embd_head_k, 64);
    assert.equal(out?.n_embd_head_v, 96);
  });

  it("yields nothing for a header with no architecture", () => {
    assert.equal(ggufMetadataFromHeader({ "llama.context_length": 8192 }), undefined);
  });

  it("carries only numbers, so nothing huge is ever persisted", () => {
    // A real header carries tokenizer.ggml.tokens — a ~256k-entry string
    // array. Persisting the header verbatim would bloat AsyncStorage.
    const out = ggufMetadataFromHeader({
      ...HEADER,
      "tokenizer.ggml.tokens": ["a", "b"],
      "general.file_data": "AAAA",
    });
    for (const value of Object.values(out ?? {})) {
      if (typeof value !== "string") continue;
      assert.ok(value.length < 64, "only the architecture is stored as a string");
    }
    assert.ok(!("tokenizer.ggml.tokens" in (out ?? {})));
  });
});

describe("a read header makes the memory estimate mean something", () => {
  // Sized for hand arithmetic, not for realism.
  const HEADER = {
    "general.architecture": "llama",
    "llama.block_count": 2,
    "llama.embedding_length": 8,
    "llama.attention.head_count": 4,
    "llama.attention.head_count_kv": 2,
    "llama.vocab_size": 10,
    "llama.context_length": 1000,
  };
  const CTX = { cacheK: "f16", cacheV: "f16", nUbatch: 10 };
  const SIZE = 1_000_000;
  const at = (nCtx: number) =>
    estimateModelMemory(
      { size: SIZE, gguf: toMemoryMetadata(ggufMetadataFromHeader(HEADER)) },
      undefined,
      undefined,
      { ...CTX, nCtx },
    );

  it("grows with context instead of tracking file size alone", () => {
    // KV per token = layers × head_kv × (k + v) × 2 bytes = 2×2×4×2 = 32.
    // Compute buffer = (10 + 8) × 10 × 4 = 720.
    // nCtx 100:  1_000_000 + 3_200 + 720      = 1_003_920 → ×1.1 = 1_104_312
    // nCtx 1000: 1_000_000 + 32_000 + 720     = 1_032_720 → ×1.1 = 1_135_992
    for (const [nCtx, expected] of [
      [100, 1_104_312],
      [1000, 1_135_992],
    ] as const) {
      assert.ok(
        Math.abs(at(nCtx) - expected) < 1,
        `n_ctx ${nCtx}: expected ${expected}, got ${at(nCtx)}`,
      );
    }
  });

  it("separates candidate sizes the fit classifier once agreed on", () => {
    // Without the header both sizes classified alike — the fallback is a
    // flat multiple of file size. With it, the ceiling between them bites.
    const fit = makeFitStatusFor({
      memBytesFor: at,
      ceiling: 1_120_000,
      totalMemory: 8 * 1024 * 1024 * 1024,
    });
    assert.equal(fit(100), "fits");
    assert.equal(fit(1000), "tight");
  });
});

const ROOT = path.join(import.meta.dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("store wiring", () => {
  // Source assertion, not a behaviour test: these hooks live in the model
  // store, a zustand singleton wired to expo-file-system and llama.rn, so
  // it cannot be built outside React Native. The behaviour reachable
  // without a device — key resolution, coercion, the estimate — is tested
  // for real above; what is pinned here is that the read is actually
  // hooked, and hooked only where it should be.

  it("reads the header when a download completes", () => {
    assert.match(
      read("store/models/downloads.ts"),
      /refreshGgufMetadata\(downloadJob\.modelId\)/,
      "download completion must read the header",
    );
  });

  it("reads the header when a model already on disk is reconciled", () => {
    const src = read("store/models/downloads.ts");
    // The completed-model branch, not the partial-file branch: a whole
    // file on disk gains its metadata without being re-fetched.
    assert.match(
      src,
      /downloadStatus === "completed"\)[\s\S]{0,400}refreshGgufMetadata\(spec\.id\)/,
      "reconcile must backfill already-downloaded models",
    );
  });

  it("reads the header on local import", () => {
    assert.match(
      read("store/models/catalog.ts"),
      /addModel\(buildLocalModelSpec[\s\S]{0,200}refreshGgufMetadata\(id\)/,
      "an imported model must gain its metadata too",
    );
  });

  it("leaves remote models alone", () => {
    // Their context length is the server's configured setting — a
    // different fact from a trained maximum, and never written as one.
    assert.match(
      read("store/models/downloads.ts"),
      /origin === "remote_api"\s*\|\|\s*spec\.ggufMetadata/,
    );
  });

  it("does not re-read on every start", () => {
    // reconcileInterrupted runs on every load, so the guard that makes
    // the read once-only is the one that matters: a row already carrying
    // metadata is skipped before the native call.
    const body = read("store/models/downloads.ts").split(
      "refreshGgufMetadata: async (specId) => {",
    )[1]?.split("\n  },")[0];
    assert.ok(body, "the action must exist");
    assert.match(body, /spec\.ggufMetadata/);
    assert.match(body, /return;/);
  });

  it("cannot throw into a download or a load", () => {
    const src = read("lib/models/gguf-header.ts");
    assert.match(src, /catch \{[\s\S]*?\}\n\s*return undefined;/);
    assert.match(src, /loadLlamaModelInfo/, "reads via llama.rn's own loader");
  });
});
