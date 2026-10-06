/** Pending-row phase labels (chat-message-ui parity 02).
 * Run: node --test tests/pending-phase.test.ts
 *
 * Two blocks, the shape context-fill.test.ts established:
 *   1. pure — the talent-name→label map and the suffix formatter load in
 *      plain node because they live in lib/, not the component;
 *   2. "chat wiring" — PendingIndicator.tsx is read as TEXT. Its
 *      behaviour is unreachable here: the component imports
 *      react-native and react-native-reanimated, which do not load
 *      under `node --test`. The scan pins the decisions the ticket
 *      demands (store selector, no string assembly in render, the
 *      spoken label keeps its elapsed count) rather than pretending to
 *      exercise them.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { phaseLabel, formatPendingSuffix, formatPendingRow, MIN_TOOL_TOKENS } from "../lib/chat/pending-phase.ts";
import { createToolTokenCounter } from "../lib/chat/tool-token-count.ts";
import { createChatStore } from "../store/chat/index.ts";
import type { TurnRunner } from "../store/chat/types.ts";
import { fakeSessionStore } from "./fakes.ts";

const ROOT = path.join(import.meta.dirname, "..");

function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

describe("phaseLabel", () => {
  it("names the tools PocketPal names", () => {
    // Labels transcribed from PendingIndicator.tsx:23-30 (TALENT_LABEL_KEYS)
    // via its l10n strings — the reference's map is keys, our map is the
    // resolved English the app already ships.
    assert.equal(phaseLabel("render_html"), "Building page");
    assert.equal(phaseLabel("calculate"), "Calculating");
    assert.equal(phaseLabel("datetime"), "Looking up time");
  });

  it("falls back to a generic label for a tool it has never heard of", () => {
    assert.equal(phaseLabel("wikipedia_search"), "Preparing tool");
  });

  it("yields NO label when there is no tool — a first-class outcome", () => {
    // Story 6: while the model is simply writing text the row must not
    // claim a tool is running. This is not the generic label.
    assert.equal(phaseLabel(undefined), undefined);
    assert.equal(phaseLabel(""), undefined);
    assert.equal(phaseLabel("   "), undefined);
  });
});

describe("formatPendingSuffix", () => {
  it("joins phase and elapsed on one line", () => {
    assert.equal(formatPendingSuffix({ phase: "Building page", elapsed: 3 }), "Building page · 3s");
  });

  it("reads exactly as today when no phase applies", () => {
    // Story 8: elapsed seconds are the pre-existing behaviour and must
    // not move. Zero elapsed still prints nothing, as before.
    assert.equal(formatPendingSuffix({ elapsed: 4 }), "4s");
    assert.equal(formatPendingSuffix({ elapsed: 0 }), "");
  });

  it("shows the phase alone before the first second ticks", () => {
    assert.equal(formatPendingSuffix({ phase: "Calculating", elapsed: 0 }), "Calculating");
  });

  it("prints nothing at all with neither part", () => {
    // Zero elapsed is the formatter's documented "absent" — the row
    // read exactly this way before phases existed.
    assert.equal(formatPendingSuffix({ elapsed: 0 }), "");
    assert.equal(
      formatPendingSuffix({ phase: phaseLabel(undefined), elapsed: 0 }),
      "",
    );
  });
});

describe("formatPendingSuffix tokens part", () => {
  it("shows the tool-call count once it reaches ten, mid-dot", () => {
    assert.equal(
      formatPendingSuffix({ phase: "Building page", tokens: 120, elapsed: 4 }),
      "Building page · 120 tokens · 4s",
    );
  });

  it("hides the count below the threshold", () => {
    assert.equal(formatPendingSuffix({ tokens: MIN_TOOL_TOKENS - 1, elapsed: 4 }), "4s");
    assert.equal(MIN_TOOL_TOKENS, 10);
  });

  it("renders the threshold itself, and uses locale separators", () => {
    assert.equal(formatPendingSuffix({ tokens: 10, elapsed: 0 }), "10 tokens");
    assert.equal(
      formatPendingSuffix({ tokens: 1240, elapsed: 4 }),
      `${(1240).toLocaleString()} tokens · 4s`,
    );
  });

  it("joins phase, token count and elapsed in that order", () => {
    assert.equal(
      formatPendingSuffix({ phase: "Calculating", tokens: 30, elapsed: 2 }),
      "Calculating · 30 tokens · 2s",
    );
    assert.equal(formatPendingSuffix({ tokens: 30, elapsed: 2 }), "30 tokens · 2s");
  });
});

describe("formatPendingRow (stopping-state derivation)", () => {
  it("renders Stopping… alone, suppressing phase, tokens and elapsed", () => {
    assert.equal(
      formatPendingRow({ stopping: true, phase: "Building page", tokens: 120, elapsed: 4 }),
      "Stopping…",
    );
  });

  it("is the plain suffix while nothing is unwinding", () => {
    assert.equal(
      formatPendingRow({ stopping: false, phase: "Building page", tokens: 120, elapsed: 4 }),
      "Building page · 120 tokens · 4s",
    );
  });
});

describe("createToolTokenCounter", () => {
  it("increments on tool-call fragments, never on reply text", () => {
    const counter = createToolTokenCounter();
    counter.delta("reply");
    counter.delta("reply");
    assert.equal(counter.count(), 0, "reply deltas must never tick the count");
    counter.delta("tool");
    counter.delta("tool");
    assert.equal(counter.count(), 2);
  });

  it("resets when a new tool call begins assembling", () => {
    const counter = createToolTokenCounter();
    counter.delta("tool");
    counter.delta("tool");
    counter.settleCall(); // this call finished; the next may start
    counter.delta("tool");
    assert.equal(counter.count(), 1, "a new assembly starts the count over");
  });

  it("resets at the start of each turn", () => {
    const counter = createToolTokenCounter();
    counter.delta("tool");
    counter.delta("tool");
    counter.turnStart();
    assert.equal(counter.count(), 0);
    assert.equal(counter.delta("tool"), 1, "the first fragment after a turn start counts from zero");
  });
});

describe("pending tool name (store seam)", () => {
  /** A runner that reports a tool start, waits for the gate, then settles. */
  function gatedRunTurn(tool: string): { runner: TurnRunner; release: () => void } {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const runner: TurnRunner = async (text, paths, onToken, onReasoning, onToolStart) => {
      onToolStart?.(tool);
      onToken?.("working");
      await gate;
      return {
        reply: "done",
        sessionId: paths.sessionId ?? "s-new",
        steps: [],
        promptTokens: 1,
        completionTokens: 1,
      };
    };
    return { runner, release: () => release?.() };
  }

  function storeFor(tool: string) {
    const fake = fakeSessionStore([]);
    const { runner } = gatedRunTurn(tool);
    const useStore = createChatStore({
      getStore: async () => fake.store,
      runTurn: runner,
    });
    return useStore;
  }

  it("carries no name before any tool runs", async () => {
    const useStore = storeFor("render_html");
    assert.equal(useStore.getState().pendingToolName, null);
  });

  it("names the running tool mid-turn, and drops it on settle", async () => {
    const { runner, release } = gatedRunTurn("render_html");
    const fake = fakeSessionStore([]);
    const useStore = createChatStore({
      getStore: async () => fake.store,
      runTurn: runner,
    });
    const sent = useStore.getState().send("hi");
    // The runner is gated, so read while it is still in flight.
    await new Promise((r) => setImmediate(r));
    assert.equal(useStore.getState().pendingToolName, "render_html");
    // Unblock the runner so it can settle.
    release();
    await sent;
    assert.equal(useStore.getState().pendingToolName, null);
  });
});

describe("stopping flag (store seam)", () => {
  function gatedRunner(): { runner: TurnRunner; release: () => void } {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const runner: TurnRunner = async (_text, _paths, onToken) => {
      onToken?.("working");
      await gate;
      return {
        reply: "done",
        sessionId: "s-new",
        steps: [],
        promptTokens: 1,
        completionTokens: 1,
      };
    };
    return { runner, release: () => release?.() };
  }

  it("is set on Stop, while sending clears immediately so the composer frees", async () => {
    const { runner, release } = gatedRunner();
    const fake = fakeSessionStore([]);
    const useStore = createChatStore({
      getStore: async () => fake.store,
      runTurn: runner,
    });
    const sent = useStore.getState().send("hi");
    await new Promise((r) => setImmediate(r));
    useStore.getState().stop();
    assert.equal(useStore.getState().stopping, true, "the row acknowledges the stop");
    assert.equal(
      useStore.getState().sending,
      false,
      "the in-flight flag must NOT be held through teardown — the user can send at once",
    );
    release();
    await sent;
    assert.equal(useStore.getState().stopping, false, "cleared when the loop exits");
  });

  it("clears when a failed turn exits, not only on success", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const fake = fakeSessionStore([]);
    const useStore = createChatStore({
      getStore: async () => fake.store,
      runTurn: async (_text, _paths, onToken) => {
        onToken?.("working");
        await gate;
        throw new Error("engine died");
      },
    });
    const sent = useStore.getState().send("hi");
    await new Promise((r) => setImmediate(r));
    useStore.getState().stop();
    assert.equal(useStore.getState().stopping, true);
    release();
    await sent;
    assert.equal(useStore.getState().stopping, false, "a failed unwind clears the flag too");
  });
});

describe("tool token count (store seam)", () => {
  it("counts tool-call deltas only, and resets per turn", async () => {
    const fake = fakeSessionStore([]);
    const useStore = createChatStore({
      getStore: async () => fake.store,
      runTurn: async (_text, _paths, onToken, _onReasoning, onToolStart, onToolDelta) => {
        onToken?.("some reply text"); // must not count
        onToolDelta?.();
        onToolStart?.("render_html");
        onToolDelta?.();
        onToolDelta?.();
        return {
          reply: "done",
          sessionId: "s-new",
          steps: [],
          promptTokens: 1,
          completionTokens: 1,
        };
      },
    });
    await useStore.getState().send("hi");
    // Two assembly spans fired deltas: one before the tool-start event,
    // then two after. settleCall closed the first span, so its lone
    // fragment is superseded by the second span's count of two. Reply
    // text never ticks it.
    assert.equal(useStore.getState().toolTokenCount, 2);
  });
});

describe("chat wiring (02)", () => {
  const src = read("components/chat/PendingIndicator.tsx");

  it("reads the in-flight tool name from the store, not a prop", () => {
    // The row gained a second input without a second caller argument:
    // chat.tsx still passes only startedAt, and the name arrives through
    // a selector. One caller, one place that knows the turn is running.
    assert.match(src, /useChatStore\(\(s\) => s\.pendingToolName\)/);
    assert.match(src, /phaseLabel\(/, "the row asks the pure module for its label");
    assert.doesNotMatch(
      src,
      /\{ startedAt[\s\S]*tool[A-Za-z]* \}/,
      "the name must not arrive as a second prop",
    );
  });

  it("renders the formatter's output rather than assembling the string", () => {
    assert.match(src, /formatPendingRow\(/);
    assert.match(src, /\{suffix\}/);
    assert.doesNotMatch(src, /`\$\{elapsed\}s`/, "render must not rebuild the suffix");
  });

  it("speaks the phase and keeps speaking the elapsed count", () => {
    const label = src.match(/accessibilityLabel=\{[\s\S]*?\n\s{6}\}/)?.[0] ?? "";
    assert.match(label, /phase/, "the spoken label names the phase");
    assert.match(label, /elapsed/, "the elapsed count is not regressed away");
  });

  it("records both reversals and the flag split in the header comment", () => {
    // The old header justified OMITTING a phase label and stopping state.
    // A later reader must find the reversals here, not re-derive them.
    assert.match(src, /omitted|omitting/i);
    assert.match(src, /revers|now names|reversal/i);
    assert.match(src, /flag/i, "the stopping/in-flight flag split is recorded");
  });

  it("reads stopping and the tool-call token count from the store", () => {
    assert.match(src, /useChatStore\(\(s\) => s\.stopping\)/);
    assert.match(src, /useChatStore\(\(s\) => s\.toolTokenCount\)/);
  });

  it("speaks the stopping state too", () => {
    assert.match(src, /stopping/, "the rows label must name Stopping…");
  });
});

describe("stopping + tokens wiring (03)", () => {
  it("the runner emits a delta event from the tool-call assembly callback", () => {
    const runner = read("lib/agent/runner.ts");
    assert.match(runner, /tool_call_delta/);
    // Only the onToolCalls callback (llama.rn fires it per streamed
    // fragment) may carry it — reply-text deltas travel onToken.
    const block = runner.match(/onToolCalls:[\s\S]*?\n            \},/)?.[0] ?? "";
    assert.match(block, /tool_call_delta/);
  });

  it("the send slice increments the counter only from tool deltas", () => {
    const send = read("store/chat/send.ts");
    assert.match(send, /tool_call_delta|onToolDelta/);
    assert.match(send, /toolTokens\.delta\("tool"\)/);
    assert.doesNotMatch(send, /delta\("reply"\)/);
  });

  it("the send slice sets stopping on Stop and clears it on loop exit", () => {
    const send = read("store/chat/send.ts");
    assert.match(send, /stopping: true/);
    assert.match(send, /stopping: false/);
  });

  it("the pending row survives Stop: it renders while stopping, not only while streaming", () => {
    const rows = read("lib/chat/rows.ts");
    assert.match(rows, /stopping/);
    const chat = read("app/(drawer)/(tabs)/chat.tsx");
    assert.match(chat, /buildRows\(visible, \{ sending, stopping \}\)/);
  });
});