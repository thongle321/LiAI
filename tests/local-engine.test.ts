/** Local llama engine: thin wrapper over a llama.rn context (TDD).
 * Run: node --test frontend/tests/local-engine.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createLocalEngine,
  releaseLocalEngine,
  type LlamaCompletionParams,
  type LlamaContextLike,
  type LlamaTokenData,
} from "../lib/inference/local-engine.ts";

function fakeContext(
  over: Partial<LlamaContextLike> = {},
): LlamaContextLike & { stopped: boolean; released: boolean } {
  const ctx: LlamaContextLike & { stopped: boolean; released: boolean } = {
    stopped: false,
    released: false,
    completion: async (_params, onToken) => {
      onToken?.({ content: "he", token: "he" });
      onToken?.({ content: "llo", token: "llo" });
      return {
        text: "hello",
        content: "hello",
        tool_calls: [],
        tokens_predicted: 2,
        tokens_evaluated: 5,
      };
    },
    stopCompletion: async () => {
      ctx.stopped = true;
    },
    release: async () => {
      ctx.released = true;
    },
  };
  return Object.assign(ctx, over);
}

describe("createLocalEngine", () => {
  it("streams content deltas and maps usage", async () => {
    const engine = createLocalEngine(fakeContext());
    const tokens: string[] = [];
    const out = await engine.completion(
      { messages: [{ role: "user", content: "hi" }] },
      { onToken: (t) => tokens.push(t) },
    );
    assert.deepEqual(tokens, ["he", "llo"]);
    assert.equal(out.text, "hello");
    assert.equal(out.promptTokens, 5);
    assert.equal(out.completionTokens, 2);
    assert.deepEqual(out.toolCalls, []);
  });

  it("projects native tool calls with fallback ids", async () => {
    const ctx = fakeContext({
      completion: async (_params: LlamaCompletionParams, _onToken?: (data: LlamaTokenData) => void) => ({
        text: "",
        content: "",
        tool_calls: [
          { type: "function", function: { name: "calculate", arguments: "{}" } },
          {
            id: "c9",
            type: "function",
            function: { name: "datetime", arguments: "{}" },
          },
        ],
        tokens_predicted: 1,
        tokens_evaluated: 1,
      }),
    });
    const engine = createLocalEngine(ctx);
    const out = await engine.completion(
      { messages: [{ role: "user", content: "x" }] },
      { onToken: () => {} },
    );
    assert.equal(out.toolCalls.length, 2);
    assert.equal(out.toolCalls[0].name, "calculate");
    assert.ok(out.toolCalls[0].id.length > 0);
    assert.equal(out.toolCalls[1].id, "c9");
  });

  it("forwards enableThinking as enable_thinking, omits when unset", async () => {
    const seen: LlamaCompletionParams[] = [];
    const ctx = fakeContext({
      completion: async (params: LlamaCompletionParams) => {
        seen.push(params);
        return { text: "t", content: "t", tool_calls: [], tokens_predicted: 1, tokens_evaluated: 1 };
      },
    });
    const engine = createLocalEngine(ctx);
    await engine.completion(
      { messages: [{ role: "user", content: "x" }], enableThinking: false },
      { onToken: () => {} },
    );
    await engine.completion({ messages: [{ role: "user", content: "y" }] }, { onToken: () => {} });
    assert.equal(seen[0].enable_thinking, false);
    assert.equal("enable_thinking" in seen[1], false);
  });

  it("forwards stop and release to the native context", async () => {
    const ctx = fakeContext();
    const engine = createLocalEngine(ctx);
    await engine.stopCompletion();
    assert.equal(ctx.stopped, true);
    await releaseLocalEngine(ctx);
    assert.equal(ctx.released, true);
  });

  it("surfaces native failures as errors", async () => {
    const ctx = fakeContext({
      completion: async () => {
        throw new Error("context_was_released");
      },
    });
    const engine = createLocalEngine(ctx);
    await assert.rejects(
      engine.completion({ messages: [{ role: "user", content: "x" }] }, { onToken: () => {} }),
      /context_was_released/,
    );
  });
});
