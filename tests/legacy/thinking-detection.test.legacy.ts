/** Thinking-capability detection (PocketPal parity).
 *
 * The composer shows the thinking toggle only for models that actually
 * think, and resolveThinking sends `enable_thinking` only for those — so
 * this detector is what makes both true in practice. It asks llama.cpp
 * (which knows 25+ model families) rather than matching names.
 *
 * The three-valued contract is the part worth pinning: `undefined` must
 * never become `false`, or one failed probe would permanently hide the
 * toggle from a real reasoner.
 *
 * Run: node --test tests/thinking-detection.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  detectThinkingCapability,
  readingFromFormattedChat,
} from "../lib/inference/thinking-detection.ts";

function probe(result: unknown, fail = false) {
  const calls: Array<{ messages: unknown; params: unknown }> = [];
  return {
    calls,
    ctx: {
      getFormattedChat: async (
        messages: Array<{ role: string; content: string }>,
        _template: string | null | undefined,
        params?: { jinja?: boolean; enable_thinking?: boolean },
      ) => {
        calls.push({ messages, params });
        if (fail) throw new Error("probe failed");
        return result;
      },
    },
  };
}

describe("readingFromFormattedChat", () => {
  it("reads a thinking model from the start tag jinja reports", () => {
    assert.equal(
      readingFromFormattedChat({ thinking_start_tag: "<think>" }),
      true,
    );
  });

  it("reads a non-thinking model from the tag's absence", () => {
    assert.equal(readingFromFormattedChat({ thinking_start_tag: "" }), false);
    assert.equal(readingFromFormattedChat({ chat_format: 2 }), false);
  });

  it("refuses to guess at a shape it does not recognise", () => {
    // undefined, NOT false: an unreadable answer is "could not tell".
    assert.equal(readingFromFormattedChat(null), undefined);
    assert.equal(readingFromFormattedChat("nope"), undefined);
    assert.equal(readingFromFormattedChat({ thinking_start_tag: 7 }), undefined);
  });
});

describe("detectThinkingCapability", () => {
  it("probes with jinja + thinking on, and reports the verdict", async () => {
    const { ctx, calls } = probe({ thinking_start_tag: "<think>" });
    assert.equal(await detectThinkingCapability(ctx), true);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].params, { jinja: true, enable_thinking: true });
    assert.deepEqual(calls[0].messages, [{ role: "user", content: "test" }]);
  });

  it("reports a non-thinking model without guessing", async () => {
    const { ctx } = probe({ thinking_start_tag: "" });
    assert.equal(await detectThinkingCapability(ctx), false);
  });

  it("returns undefined when the probe throws — never downgrades a model", async () => {
    const { ctx } = probe(null, true);
    assert.equal(await detectThinkingCapability(ctx), undefined);
  });

  it("returns undefined when the build has no probe API at all", async () => {
    // An older llama.rn / partial native build: absence of the API is not
    // evidence the model cannot think.
    assert.equal(await detectThinkingCapability({}), undefined);
  });
});