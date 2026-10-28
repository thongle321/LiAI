/** createVisionTurnRunner: the vision tab's store-less turn.
 *
 *  Vision-mode Q&A must never touch the chat session store — no minted
 *  session, no appended turns, no active-pointer change (chat-screen
 *  issue set). The runner reuses the chat pipeline (engine deps, prompt
 *  resolution, attachments) but is constructed with `getStore: null`, so
 *  persistence is skipped by construction (services/chat/turn.ts's
 *  best-effort branch). The tests pin that: the turn ANSWERS through the
 *  engine, carries the frame, and returns the caller's ephemeral session
 *  id — while a reachable store would have been the mint path.
 */

import { createVisionTurnRunner } from "@/store/chat/index.ts";
import type { CompletionEngine } from "@/services/inference/engine.ts";

function scriptedEngine(reply: string): CompletionEngine {
  return {
    completion: async (request, cbs) => {
      cbs.onToken(reply);
      return {
        text: reply,
        toolCalls: [],
        promptTokens: 3,
        completionTokens: 2,
        stoppedEarly: false,
        ...(request.imagePaths !== undefined
          ? { sawImagePaths: request.imagePaths }
          : {}),
      };
    },
    stopCompletion: async () => {},
  };
}

function deps(over: Record<string, unknown> = {}) {
  return {
    engine: {
      ensureEngine: async () => scriptedEngine("hello"),
      getEngineSource: async () => ({ kind: "local", fileName: "a.gguf" }) as const,
    },
    prompt: {
      getTurnInputs: async () => ({
        engineSource: { kind: "local", fileName: "a.gguf" } as const,
        store: null,
        search: null,
        systemPrompt: undefined,
        talentNames: [],
        thinking: undefined,
        effort: undefined,
        jinja: false,
        sampler: null,
        stopWords: [],
        chatTemplate: "",
        addGenerationPrompt: undefined,
      }),
    },
    media: {
      resolveImage: async () => ({ path: "resolved/frame.jpg", owned: false }),
    },
    ...over,
  };
}

describe("createVisionTurnRunner", () => {
  it("answers through the engine with the frame attached", async () => {
    const captured: unknown[] = [];
    const runTurn = createVisionTurnRunner(
      deps({
        engine: {
          ensureEngine: async () => {
            const e = scriptedEngine("hello");
            const realComplete = e.completion.bind(e);
            e.completion = async (request, cbs) => {
              captured.push(request);
              return realComplete(request, cbs);
            };
            return e;
          },
          getEngineSource: async () => ({ kind: "local", fileName: "a.gguf" }) as const,
        },
      }),
    );
    const out = await runTurn("What do you see?", {
      sessionId: "vision-ephemeral",
      history: [],
      images: ["frame://snapshot"],
      voiceMode: true,
    });
    expect(out.reply).toBe("hello");
    const request = captured[0] as { imagePaths?: string[] };
    expect(request.imagePaths).toEqual(["resolved/frame.jpg"]);
  });

  it("keeps the ephemeral session id — the store is unreachable by construction", async () => {
    const runTurn = createVisionTurnRunner(deps());
    const out = await runTurn("look", {
      sessionId: "vision-ephemeral",
      history: [],
    });
    // A store-backed turn mints ("s-new") or timestamps ("local-…"); an
    // ephemeral one must answer with the id THE MODE owns, since nothing
    // else created a row.
    expect(out.sessionId).toBe("vision-ephemeral");
  });

  it("throws through when the engine has no model — no error bubble anywhere", async () => {
    const runTurn = createVisionTurnRunner(
      deps({
        engine: {
          ensureEngine: async () => scriptedEngine("hello"),
          getEngineSource: async () => null,
        },
      }),
    );
    await expect(
      runTurn("look", { sessionId: "vision-ephemeral", history: [] }),
    ).rejects.toThrow(/no model active/);
  });
});
