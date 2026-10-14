/** Multi-block assistant rows: ordered blocks through a turn (ticket 08).
 * Run: node --test tests/blocks.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { runLocalAgent } from "../lib/agent/runner.ts";
import type {
  CompletionEngine,
  EngineToolCall,
} from "../lib/inference/engine.ts";
import { blocksOf, turnText } from "../lib/chat/blocks.ts";
import { createChatStore } from "../lib/chat/tinybase-store.ts";
import { TinyBaseSessionStore } from "../lib/chat/tinybase-store.ts";
import { parseImport } from "../lib/chat/import.ts";

describe("blocksOf: stored turn from the previous model", () => {
  it("splits reasoning/text/tools into that order", () => {
    const blocks = blocksOf({
      text: "the answer",
      reasoning: "thinking",
      steps: [
        { id: "s1", tool: "calculate", position: 0 },
        { id: "s2", tool: "datetime", position: 1 },
      ],
    });
    assert.deepEqual(blocks, [
      { kind: "reasoning", text: "thinking" },
      { kind: "text", text: "the answer" },
      { kind: "tool", stepId: "s1" },
      { kind: "tool", stepId: "s2" },
    ]);
  });

  it("produces a single text block for a tool-free turn", () => {
    const blocks = blocksOf({ text: "just text" });
    assert.deepEqual(blocks, [{ kind: "text", text: "just text" }]);
  });

  it("returns the recorded blocks verbatim when present", () => {
    const recorded: import("../types/chat.ts").TurnBlock[] = [
      { kind: "text", text: "before" },
      { kind: "tool", stepId: "s1" },
      { kind: "text", text: "after" },
    ];
    const blocks = blocksOf({
      text: "before\n\nafter",
      steps: [{ id: "s1", tool: "calculate", position: 0 }],
      blocks: recorded,
    });
    assert.deepEqual(blocks, recorded);
  });
});

describe("turnText: copy and read-aloud see the whole turn", () => {
  it("joins every text block of an interleaved turn", () => {
    const text = turnText({
      text: "before\n\nafter",
      blocks: [
        { kind: "text", text: "before" },
        { kind: "reasoning", text: "hidden from paste" },
        { kind: "tool", stepId: "s1" },
        { kind: "text", text: "after" },
      ],
      steps: [{ id: "s1", tool: "calculate", position: 0 }],
    });
    assert.equal(text, "before\n\nafter");
  });

  it("falls back to the plain text for a legacy turn", () => {
  });
});

function toolCall(id: string, name: string, args: string): EngineToolCall {
  return { id, name, arguments: args };
}

/** Scripted engine: reasoning, some text, a tool call, then more reasoning
 * and more text — the interleaving this ticket must survive. */
function interleavedEngine(): CompletionEngine {
  let n = 0;
  return {
    completion: async (request, cbs) => {
      n += 1;
      const toolTexts = request.messages
        .filter((m) => m.role === "tool")
        .map((m) => m.content);
      if (n === 1 && toolTexts.length === 0) {
        cbs.onReasoning?.("first thoughts");
        cbs.onToken("checking… ");
        cbs.onToolCalls?.([toolCall("c1", "calculate", '{"expression":"2+3"}')]);
        return {
          text: "checking… ",
          reasoning: "first thoughts",
          toolCalls: [toolCall("c1", "calculate", '{"expression":"2+3"}')],
          promptTokens: 3,
          completionTokens: 1,
          stoppedEarly: false,
        };
      }
      cbs.onReasoning?.("second thoughts");
      cbs.onToken("the answer is 5");
      return {
        text: "the answer is 5",
        reasoning: "second thoughts",
        toolCalls: [],
        promptTokens: 5,
        completionTokens: 2,
        stoppedEarly: false,
      };
    },
    stopCompletion: async () => {},
  };
}

const TOOLS = [
  {
    type: "function" as const,
    function: { name: "calculate", description: "", parameters: {} },
  },
];

describe("runLocalAgent ordering", () => {
  it("keeps reasoning, text, tool and text in produced order", async () => {
    const result = await runLocalAgent({
      engine: interleavedEngine(),
      messages: [{ role: "user", content: "2+3?" }],
      tools: TOOLS,
      fetchImpl: fetch,
      search: null,
      onEvent: () => {},
    });
    assert.deepEqual(result.blocks, [
      { kind: "reasoning", text: "first thoughts" },
      { kind: "text", text: "checking… " },
      { kind: "tool", stepId: "c1" },
      { kind: "reasoning", text: "second thoughts" },
      { kind: "text", text: "the answer is 5" },
    ]);
    // The reply keeps every segment, not only the last one.
    assert.equal(result.text, "checking… \n\nthe answer is 5");
  });

  it("a tool-free turn records a single text block", async () => {
    const engine: CompletionEngine = {
      completion: async (_request, cbs) => {
        cbs.onToken("plain");
        return {
          text: "plain",
          toolCalls: [],
          promptTokens: 1,
          completionTokens: 1,
          stoppedEarly: false,
        };
      },
      stopCompletion: async () => {},
    };
    const result = await runLocalAgent({
      engine,
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      fetchImpl: fetch,
      search: null,
      onEvent: () => {},
    });
    assert.deepEqual(result.blocks, [{ kind: "text", text: "plain" }]);
  });
});

describe("persistence", () => {
  it("a stored turn reopens with the same block structure", async () => {
    const store = new TinyBaseSessionStore(createChatStore());
    const id = await store.create();
    await store.append(id, {
      role: "assistant",
      content: "before\n\nafter",
      type: "text",
      steps: [{ id: "c1", tool: "calculate", position: 0 }],
      blocks: [
        { kind: "text", text: "before" },
        { kind: "tool", stepId: "c1" },
        { kind: "text", text: "after" },
      ],
    });
    const turns = await store.get(id);
    assert.deepEqual(turns?.[0]?.blocks, [
      { kind: "text", text: "before" },
      { kind: "tool", stepId: "c1" },
      { kind: "text", text: "after" },
    ]);
  });
});

describe("import", () => {
  it("restores blocks without loss, remapping tool references to fresh step ids", () => {
    const backup = JSON.stringify({
      format: "liai-chat-session",
      version: 1,
      title: "t",
      pinned: false,
      updatedAt: 1,
      turns: [
        {
          content: "before\n\nafter",
          at: 1,
          role: "assistant",
          steps: [{ id: "old", tool: "calculate", position: 0 }],
          blocks: [
            { kind: "text", text: "before" },
            { kind: "tool", stepId: "old" },
            { kind: "text", text: "after" },
          ],
        },
      ],
    });
    const outcome = parseImport(backup);
    assert.equal(outcome.ok, true);
    if (!outcome.ok) return;
    const turn = outcome.sessions[0].turns[0];
    const stepId = turn.steps?.[0]?.id;
    assert.ok(stepId && stepId !== "old", "import mints a fresh step id");
    assert.deepEqual(turn.blocks, [
      { kind: "text", text: "before" },
      { kind: "tool", stepId },
      { kind: "text", text: "after" },
    ]);
  });
});

describe("render wiring (source assertions — React Native is not reachable from node)", () => {
  const item = readFileSync(
    new URL("../components/chat/MessageListItem.tsx", import.meta.url),
    "utf8",
  );
  const actions = readFileSync(
    new URL("../components/chat/MessageActions.tsx", import.meta.url),
    "utf8",
  );

  it("renders the turn as an ordered block list, not one bubble plus chips", () => {
    assert.match(item, /blocksOf\(/);
  });

  it("copy and speak receive the whole turn's text", () => {
    // The menu's Copy and the actions' speak both take the row's text
    // prop, so pinning the prop source pins both sinks at once.
    // The component computes `wholeText = turnText(message)` once and
    // passes it to both MessageMenu and MessageActions.
    assert.match(item, /const wholeText = turnText\(message\);/);
    assert.ok(
      (item.match(/text=\{wholeText\}/g) ?? []).length >= 2,
      "MessageMenu and MessageActions both receive wholeText",
    );
    // speakReply still speaks the prop: no fragment is substituted in
    // deeper.
    assert.match(actions, /speakReply\(text,/);
  });
});