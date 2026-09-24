/** Session usage aggregate (pure). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { formatTokens, sumUsage } from "../lib/chat/usage.ts";
import type { ChatMessage } from "../types/chat.ts";

function assistant(text: string, usage?: ChatMessage["usage"]): ChatMessage {
  return { id: text, role: "assistant", text, at: 0, usage };
}

describe("sumUsage", () => {
  it("totals finished assistant turns, skipping user and usage-less turns", () => {
    const out = sumUsage([
      { id: "q", role: "user", text: "hi", at: 0 },
      assistant("a", { promptTokens: 10, completionTokens: 20, totalTokens: 30 }),
      assistant("streaming-stub"),
      assistant("b", { promptTokens: 5, completionTokens: 7, totalTokens: 12 }),
    ]);
    assert.deepEqual(out, { turns: 2, promptTokens: 15, completionTokens: 27 });
  });

  it("reports zero turns on an empty conversation", () => {
    assert.deepEqual(sumUsage([]), {
      turns: 0,
      promptTokens: 0,
      completionTokens: 0,
    });
  });
});

describe("formatTokens", () => {
  it("compacts thousands, leaves small counts raw", () => {
    assert.equal(formatTokens(999), "999");
    assert.equal(formatTokens(1200), "1.2k");
    assert.equal(formatTokens(150000), "150k");
  });
});
