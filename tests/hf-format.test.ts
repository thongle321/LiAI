import { test, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  extractHFModelTitle,
  formatNumber,
  hfSortParams,
  isLegacyQuantization,
  isVisionModel,
  nextPageFromLink,
  timeAgo,
  visionSizeBreakdown,
} from "../lib/models/hf-format.ts";

// Ported from PocketPal (utils/index.ts, formatters.ts, modelSettings.ts,
// HFStore.getSortParams) so the HF flow reads identically. Expected
// values are taken from those implementations, not from this code.

test("extractHFModelTitle strips the -GGUF suffix and the owner", () => {
  assert.equal(extractHFModelTitle("lmstudio-community/Qwen3-0.6B-GGUF"), "Qwen3-0.6B");
  assert.equal(extractHFModelTitle("ggml-org/gemma-3-1b-it-GGUF"), "gemma-3-1b-it");
  assert.equal(extractHFModelTitle("bartowski/Model_GGUF"), "Model");
  assert.equal(extractHFModelTitle("gpt2"), "gpt2");
  assert.equal(extractHFModelTitle("a/b/c"), "b/c");
});

test("formatNumber compacts to k/M/B with trailing zeros stripped", () => {
  assert.equal(formatNumber(999), "999");
  assert.equal(formatNumber(1000), "1K");
  assert.equal(formatNumber(1500), "1.5K");
  assert.equal(formatNumber(1_500_000), "1.5M");
  assert.equal(formatNumber(2_000_000_000), "2B");
  // fractionDigits 0 → whole units, as the detail chips use.
  assert.equal(formatNumber(15_300, 0), "15K");
  assert.equal(formatNumber(1500, 2, true, true), "1.5 K");
  assert.equal(formatNumber(1500, 2, false), "1.5k");
});

test("timeAgo floors the largest whole unit, both wordings", () => {
  const now = Date.UTC(2026, 0, 10);
  const days = (n: number) => now - n * 86_400_000;
  assert.equal(timeAgo(now - 30_000, now), "just now");
  assert.equal(timeAgo(now - 30_000, now, true), "Updated just now");
  assert.equal(timeAgo(days(3), now), "3 days ago");
  assert.equal(timeAgo(days(3), now, true), "Updated 3 days ago");
  assert.equal(timeAgo(days(45), now), "1 month ago");
  assert.equal(timeAgo(days(400), now), "1 year ago");
  assert.equal(timeAgo(now - 59 * 60_000, now), "59 minutes ago");
  assert.equal(timeAgo(now - 2 * 86_400_000, now), "2 days ago");
});

test("isLegacyQuantization flags the K-quants with half attention", () => {
  assert.equal(isLegacyQuantization("model-Q4_0_4_8.gguf"), true);
  assert.equal(isLegacyQuantization("model-q4_0_4_4.gguf"), true);
  assert.equal(isLegacyQuantization("MODEL-Q4_0_8_8.gguf"), true);
  assert.equal(isLegacyQuantization("model-Q4_K_M.gguf"), false);
  assert.equal(isLegacyQuantization("model-Q5_K_S.gguf"), false);
});

test("hfSortParams maps relevance to no sort, everything else descending", () => {
  assert.deepEqual(hfSortParams("relevance"), {});
  assert.deepEqual(hfSortParams("downloads"), { sort: "downloads", direction: "-1" });
  assert.deepEqual(hfSortParams("lastModified"), { sort: "lastModified", direction: "-1" });
  assert.deepEqual(hfSortParams("likes"), { sort: "likes", direction: "-1" });
});

test("nextPageFromLink reads the rel=next URL or nothing", () => {
  const url = "https://huggingface.co/api/models?search=q&limit=10";
  assert.equal(
    nextPageFromLink(`<${url}>; rel="next"`),
    url,
  );
  assert.equal(nextPageFromLink(""), null);
  assert.equal(nextPageFromLink(null), null);
  assert.equal(nextPageFromLink(`<${url}>; rel="last"`), null);
});

test("visionSizeBreakdown pairs an LLM with its family's mmproj", () => {
  const siblings = [
    { name: "Qwen3-0.6B-Q4_K_M.gguf", size: 400 },
    { name: "mmproj-Qwen3-0.6B-f16.gguf", size: 90 },
    { name: "mmproj-Other-2B-f16.gguf", size: 500 },
  ];
  const llm = { name: "Qwen3-0.6B-Q4_K_M.gguf", size: 400 };
  // Family match: the mmproj sharing the LLM's prefix, not the bigger one.
  assert.deepEqual(visionSizeBreakdown(llm, siblings), {
    llmSize: 400,
    mmprojSize: 90,
    total: 490,
    isVision: true,
  });
  // An unrelated mmproj is the fallback (smallest), never a huge one.
  assert.deepEqual(visionSizeBreakdown({ name: "other.gguf", size: 10 }, siblings), {
    llmSize: 10,
    mmprojSize: 90,
    total: 100,
    isVision: true,
  });
  // No mmproj in the repo at all: plain size, not vision.
  assert.deepEqual(visionSizeBreakdown({ name: "plain.gguf", size: 10 }, [llm]), {
    llmSize: 10,
    mmprojSize: null,
    total: 10,
    isVision: false,
  });
});
describe("isVisionModel", () => {
  it("reads the Hub tags", () => {
    assert.equal(isVisionModel(["gguf", "vision"], []), true);
    assert.equal(isVisionModel(["gguf", "multimodal"], []), true);
    assert.equal(isVisionModel(["gguf", "image-text-to-text"], []), true);
    assert.equal(isVisionModel(["gguf", "conversational"], []), false);
  });

  it("falls back to a projector file when the repo is untagged", () => {
    assert.equal(isVisionModel([], ["mmproj-model-f16.gguf"]), true);
    assert.equal(isVisionModel([], ["model-Q4_K_M.gguf"]), false);
  });
});
