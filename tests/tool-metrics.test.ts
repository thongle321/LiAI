/** Per-tool-call token/time cost (C15).
 * Run: node --test tests/tool-metrics.test.ts
 *
 * PocketPal's ToolMetricsFooter semantics: `1,500 tokens · 35s`
 * beneath a tool result, where tokens are the generation tokens the
 * model spent producing the call and duration is that turn's
 * wall-clock. Renders NOTHING when tokens are 0 — absence of metrics
 * is itself the cue (older persisted calls).
 *
 * Covers: the pure formatter, the runner's per-step attachment, the
 * turn-level step map (which must also stop dropping ok/data — see the
 * turn-mapping test), the TinyBase column round-trip with legacy rows
 * reading as no metrics, and the render wiring in both placements.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createStore } from "tinybase";

import { formatToolMetrics } from "../lib/format.ts";
import { runLocalAgent } from "../lib/agent/runner.ts";
import { TinyBaseSessionStore } from "../lib/chat/tinybase-store.ts";
import type { CompletionEngine, EngineToolCall, ToolDefinition } from "../lib/inference/engine.ts";

const ROOT = path.join(import.meta.dirname, "..");
function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("formatToolMetrics (C15)", () => {
  it("formats tokens and seconds like PocketPal", () => {
    assert.equal(
      formatToolMetrics({ tokens: 1500, durationMs: 35000 }),
      "1,500 tokens · 35s",
    );
    assert.equal(
      formatToolMetrics({ tokens: 19, durationMs: 2300 }),
      "19 tokens · 2s",
    );
  });

  it("renders nothing when there are no tokens — absence is the cue", () => {
    assert.equal(formatToolMetrics(undefined), null, "no metrics recorded");
    assert.equal(formatToolMetrics({ tokens: 0, durationMs: 1234 }), null);
  });

  it("floors sub-second durations to 1s so it never reads 0s", () => {
    assert.equal(formatToolMetrics({ tokens: 5, durationMs: 200 }), "5 tokens · 1s");
  });
});

/** Scripted engine whose FIRST turn emits a tool call. */
function callingEngine(tokens: number): CompletionEngine {
  const calls: EngineToolCall[] = [
    { id: "c1", name: "calculate", arguments: '{"expression":"2 + 3"}' },
  ];
  let n = 0;
  return {
    completion: async (request, cbs) => {
      n += 1;
      const toolTexts = request.messages.filter((m) => m.role === "tool");
      if (n === 1 && toolTexts.length === 0) {
        cbs.onToken("");
        cbs.onToolCalls?.(calls);
        return {
          text: "",
          toolCalls: calls,
          promptTokens: 3,
          completionTokens: tokens,
          stoppedEarly: false,
        };
      }
      const answer = "done";
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

const TOOLS: ToolDefinition[] = [
  { type: "function", function: { name: "calculate", description: "", parameters: {} } },
];

describe("runner attaches per-call metrics (C15)", () => {
  it("carries the generating turn's tokens and wall-clock on each step", async () => {
    const result = await runLocalAgent({
      engine: callingEngine(7),
      messages: [{ role: "user", content: "2+3?" }],
      tools: TOOLS,
      fetchImpl: fetch,
      search: null,
      onEvent: () => {},
    });
    assert.equal(result.steps.length, 1);
    const metrics = result.steps[0].metrics;
    assert.ok(metrics, "a call generated with tokens carries metrics");
    assert.equal(metrics.tokens, 7, "the tokens the model spent on this call");
    assert.ok(metrics.durationMs >= 0, "wall-clock, never negative");
  });

  it("attaches nothing when the engine reported no tokens", async () => {
    const result = await runLocalAgent({
      engine: callingEngine(0),
      messages: [{ role: "user", content: "2+3?" }],
      tools: TOOLS,
      fetchImpl: fetch,
      search: null,
      onEvent: () => {},
    });
    assert.equal(result.steps[0].metrics, undefined, "absence is the cue");
  });

  it("counts STREAMED tool-fragment callbacks, like PocketPal counts deltas", async () => {
    // llama.rn fires onToolCalls once per token while args stream, each
    // carrying the accumulated set (local-engine.ts:189-192). Two or
    // more fires PROVE incremental args, so the metric is the fragment
    // count — the whole-turn completionTokens would overcount prose.
    // (A single fire is the non-streaming remote / outcome-only case and
    // keeps the whole-turn fallback, tested above.)
    let fires = 0;
    const engine: CompletionEngine = {
      completion: async (request, cbs) => {
        const answered = request.messages.some((m) => m.role === "tool");
        if (answered) {
          cbs.onToken("done");
          return {
            text: "done",
            toolCalls: [],
            promptTokens: 5,
            completionTokens: 2,
            stoppedEarly: false,
          };
        }
        // Three accumulated fragment callbacks, as a real stream does.
        for (const partial of [
          [{ id: "c1", name: "calculate", arguments: "0" }],
          [
            { id: "c1", name: "calculate", arguments: "0" },
            { id: "c1", name: "calculate", arguments: "0 +" },
          ],
          [
            { id: "c1", name: "calculate", arguments: "0 + 3" },
          ],
        ]) {
          fires += 1;
          cbs.onToolCalls?.(partial);
        }
        return {
          text: "",
          toolCalls: [{ id: "c1", name: "calculate", arguments: "0 + 3" }],
          promptTokens: 3,
          completionTokens: 9,
          stoppedEarly: false,
        };
      },
      stopCompletion: async () => {},
    };
    const result = await runLocalAgent({
      engine,
      messages: [{ role: "user", content: "2+3?" }],
      tools: TOOLS,
      fetchImpl: fetch,
      search: null,
      onEvent: () => {},
    });
    assert.equal(fires, 3);
    assert.equal(
      result.steps[0].metrics?.tokens,
      3,
      "the fragment count, not the whole-turn usage",
    );
  });
});

describe("TinyBase persists metrics on toolRuns (C15)", () => {
  it("round-trips metrics, and a legacy row reads as no metrics", async () => {
    const store = new TinyBaseSessionStore(createStore());
    const id = await store.create();
    await store.append(id, {
      role: "assistant",
      content: "hi",
      at: 1,
      steps: [
        {
          id: "s1",
          tool: "calculate",
          position: 0,
          metrics: { tokens: 7, durationMs: 900 },
        },
        // A row written before the column existed.
        { id: "s2", tool: "datetime", position: 1 },
      ],
    });
    const steps = (await store.get(id))?.[0].steps;
    assert.deepEqual(steps?.[0].metrics, { tokens: 7, durationMs: 900 });
    assert.equal(steps?.[1].metrics, undefined, "old rows read as no metrics");
  });

  it("survives the export/import round trip (the import whitelist)", () => {
    const src = read("lib/chat/import.ts");
    assert.match(
      src,
      /value\.metrics/,
      "the step whitelist must carry metrics or a restore silently drops them",
    );
  });
});

describe("render wiring (C15)", () => {
  it("the sheet surfaces carry the line under their result row", () => {
    const src = read("components/chat/toolSurfaces.tsx");
    assert.match(src, /export function ToolMetricsLine/);
    assert.match(src, /<ToolMetricsLine metrics=\{metrics\}/);
    // Both base rows accept and render it.
    assert.match(src, /metrics\?: AgentStep\["metrics"\]/);
  });

  it("the static chip appends the same line", () => {
    const src = read("components/chat/MessageListItem.tsx");
    assert.match(
      src,
      /formatToolMetrics\(step\.metrics\)/,
      "the chip suffixes the formatter's output",
    );
    assert.match(src, /<ToolMetricsLine metrics=\{step\.metrics\}/, "and the error block gets one too");
  });

  it("the turn's step map forwards ok, data AND metrics", () => {
    // REGRESSION found while building this ticket: the map picked
    // id/tool/position/input/result only, so ok and data never reached
    // the store from a live turn — metrics would have died in the same
    // slot. All three are the runner's step contract.
    const src = read("lib/chat/turn.ts");
    assert.match(src, /\.\.\.\(s\.ok !== undefined \? \{ ok: s\.ok \} : \{\}\)/);
    assert.match(src, /\.\.\.\(s\.data !== undefined \? \{ data: s\.data \} : \{\}\)/);
    assert.match(
      src,
      /\.\.\.\(s\.metrics !== undefined \? \{ metrics: s\.metrics \} : \{\}\)/,
    );
  });
});
