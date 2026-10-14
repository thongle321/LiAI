/** Local agent loop: stream → dispatch talents → feed back (TDD).
 * Run: node --test frontend/tests/local-agent-run.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runLocalAgent } from "../lib/agent/runner.ts";
import {
  allowReadUrls,
  isReadUrlAllowed,
  resetReadUrlAllowlist,
} from "../lib/agent/allowlist.ts";
import type {
  CompletionEngine,
  EngineToolCall,
} from "../lib/inference/engine.ts";

function toolCall(id: string, name: string, args: string): EngineToolCall {
  return { id, name, arguments: args };
}

/** Scripted engine: first completion emits the tool call, second answers. */
function scriptedEngine(calls: EngineToolCall[] = []): CompletionEngine {
  let n = 0;
  return {
    completion: async (request, cbs) => {
      n += 1;
      const toolTexts = request.messages
        .filter((m) => m.role === "tool")
        .map((m) => m.content);
      if (n === 1 && toolTexts.length === 0 && calls.length > 0) {
        // Model asks for the tool: no text yet, calls ride the outcome.
        cbs.onToken("");
        cbs.onToolCalls?.(calls);
        return {
          text: "",
          toolCalls: calls,
          promptTokens: 3,
          completionTokens: 1,
          stoppedEarly: false,
        };
      }
      // Direct answer (no tools) or follow-up: tool results are in history.
      const answer = toolTexts.length > 0 ? `got ${toolTexts.join("|")}` : "got hi";
      cbs.onToken(answer);
      return {
        text: answer,
        toolCalls: [],
        promptTokens: 5,
        completionTokens: 2,
        stoppedEarly: false,
      };
    },
    stopCompletion: async () => {},
  };
}

const NO_SEARCH = { fetchImpl: fetch, search: null };

describe("runLocalAgent", () => {
  it("answers directly when the model calls no tools", async () => {
    const events: string[] = [];
    const tokens: string[] = [];
    const result = await runLocalAgent({
      engine: scriptedEngine([]),
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      fetchImpl: fetch,
      search: null,
      onEvent: (e) => {
        events.push(e.type);
        if (e.type === "token") tokens.push(e.text);
      },
    });
    assert.deepEqual(events, ["run_started", "token", "run_finished"]);
    assert.ok(tokens.join("").includes("got "));
    assert.equal(result.hitMaxTurns, false);
    assert.deepEqual(result.steps, []);
  });

  it("reports occupancy as the last step's figure, never a sum across steps", async () => {
    // C3: promptTokens is tokens HELD against the window (KV residency).
    // Every agent step shares that window, so `+=` would multiply-count
    // it — step 1's 3 plus step 2's 5 must not become 8. Completion
    // tokens are genuinely per-step work, so those still add up.
    const result = await runLocalAgent({
      engine: scriptedEngine([toolCall("c1", "calculate", '{"expression":"2 + 3"}')]),
      messages: [{ role: "user", content: "add?" }],
      tools: [
        {
          type: "function",
          function: { name: "calculate", description: "", parameters: {} },
        },
      ],
      ...NO_SEARCH,
      onEvent: () => {},
    });
    assert.equal(result.promptTokens, 5, "last step's residency is the thread's");
    assert.equal(result.completionTokens, 3, "generated tokens still accumulate");
  });

  it("dispatches a talent and feeds the result back", async () => {
    const seen: string[] = [];
    const result = await runLocalAgent({
      engine: scriptedEngine([toolCall("c1", "calculate", '{"expression":"2 + 3"}')]),
      messages: [{ role: "user", content: "add?" }],
      tools: [
        {
          type: "function",
          function: { name: "calculate", description: "", parameters: {} },
        },
      ],
      ...NO_SEARCH,
      onEvent: (e) => seen.push(e.type),
    });
    assert.ok(seen.includes("tool_call_started"));
    assert.ok(seen.includes("tool_call_finished"));
    assert.ok(result.text.includes("2 + 3 = 5"));
    assert.equal(result.steps.length, 1);
    assert.equal(result.steps[0].tool, "calculate");
    assert.equal(result.steps[0].status, "done");
  });

  it("clears the read_url allowlist when a run starts", async () => {
    // The allowlist is process-global. Production never called the reset
    // (only tests did), so a URL found in conversation A stayed readable
    // from conversation B for the whole app session — a cross-chat leak
    // that also grew without bound (audit finding 4). A run begins by
    // forgetting everything earlier runs approved.
    resetReadUrlAllowlist();
    allowReadUrls(["https://stale.example/from-last-conversation"]);
    assert.equal(isReadUrlAllowed("https://stale.example/from-last-conversation"), true);

    await runLocalAgent({
      engine: scriptedEngine([]),
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      fetchImpl: fetch,
      search: null,
      onEvent: () => {},
    });

    assert.equal(
      isReadUrlAllowed("https://stale.example/from-last-conversation"),
      false,
      "a fresh run must not inherit the previous run's readable URLs",
    );
  });

  it("rejects talents outside the advertised set", async () => {
    const result = await runLocalAgent({
      engine: scriptedEngine([toolCall("c9", "evil", "{}")]),
      messages: [{ role: "user", content: "x" }],
      tools: [],
      ...NO_SEARCH,
      onEvent: () => {},
    });
    assert.equal(result.steps.length, 1);
    assert.match(result.steps[0].result ?? "", /not enabled/i);
  });

  it("forces a final answer when the turn budget runs out", async () => {
    const looping: CompletionEngine = {
      completion: async (_req, cbs) => {
        cbs.onToken("");
        return {
          text: "",
          toolCalls: [toolCall("c1", "calculate", '{"expression":"1+1"}')],
          promptTokens: 1,
          completionTokens: 1,
          stoppedEarly: false,
        };
      },
      stopCompletion: async () => {},
    };
    const result = await runLocalAgent({
      engine: looping,
      messages: [{ role: "user", content: "loop" }],
      tools: [
        {
          type: "function",
          function: { name: "calculate", description: "", parameters: {} },
        },
      ],
      ...NO_SEARCH,
      maxTurns: 2,
      onEvent: () => {},
    });
    assert.equal(result.hitMaxTurns, true);
    assert.equal(result.steps.length, 2);
  });

  it("surfaces engine failures as run_failed, never a throw", async () => {
    const failing: CompletionEngine = {
      completion: async () => {
        throw new Error("native crash");
      },
      stopCompletion: async () => {},
    };
    const types: string[] = [];
    const result = await runLocalAgent({
      engine: failing,
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      ...NO_SEARCH,
      onEvent: (e) => types.push(e.type),
    });
    assert.ok(types.includes("run_failed"));
    assert.equal(result.text, "");
  });
});
