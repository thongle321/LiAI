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

import { phaseLabel, formatPendingSuffix } from "../lib/chat/pending-phase.ts";
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
    assert.match(src, /formatPendingSuffix\(/);
    assert.match(src, /\{suffix\}/);
    assert.doesNotMatch(src, /`\$\{elapsed\}s`/, "render must not rebuild the suffix");
  });

  it("speaks the phase and keeps speaking the elapsed count", () => {
    const label = src.match(/accessibilityLabel=\{[\s\S]*?\n\s{6}\}/)?.[0] ?? "";
    assert.match(label, /phase/, "the spoken label names the phase");
    assert.match(label, /elapsed/, "the elapsed count is not regressed away");
  });

  it("records the reversal in the header comment", () => {
    // The old header justified OMITTING a phase label. A later reader
    // must find the reversal here, not re-derive it from the diff.
    assert.match(src, /omitted|omitting/i);
    assert.match(src, /revers|now names|reversal/i);
  });
});