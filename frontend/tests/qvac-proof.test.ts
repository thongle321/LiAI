/* QVAC device-proof runner contract (Q6/Q9).
 * Run: node --test frontend/tests/qvac-proof.test.ts */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  runQvacProof,
  type ProofClient,
} from "../lib/inference/qvac-proof.ts";
import type { QvacEvent } from "../lib/inference/qvac-engine.ts";

const MODELS = { textModel: "TEXT", visionModel: "VISION", visionProj: "PROJ" };

function scripted(over: Partial<ProofClient> = {}): {
  client: ProofClient;
  calls: { loads: unknown[]; completions: unknown[]; cancels: string[]; unloads: unknown[] };
} {
  const calls: { loads: unknown[]; completions: unknown[]; cancels: string[]; unloads: unknown[] } = {
    loads: [],
    completions: [],
    cancels: [],
    unloads: [],
  };
  const run = (text: string, toolCalls: Array<{ name: string }> = [], stopReason = "eos") => ({
    requestId: "req",
    events: (async function* (): AsyncGenerator<QvacEvent> {
      if (text !== "") yield { type: "contentDelta", text } as QvacEvent;
      yield { type: "completionDone", stopReason } as QvacEvent;
    })(),
    final: Promise.resolve({ contentText: text, toolCalls, stopReason }),
  });
  const client: ProofClient = {
    loadModel: async (opts) => {
      calls.loads.push(opts);
      return "m1";
    },
    completion: (opts) => {
      calls.completions.push(opts);
      return run("hello", []);
    },
    cancel: async (opts) => {
      calls.cancels.push(opts.requestId);
    },
    unloadModel: async (opts) => {
      calls.unloads.push(opts);
    },
    ...over,
  };
  return { client, calls };
}

describe("runQvacProof", () => {
  it("passes every step and unloads both models", async () => {
    const { client, calls } = scripted({
      completion: (opts) => {
        calls.completions.push(opts);
        const o = opts as { tools?: unknown[] };
        const toolCalls = o.tools ? [{ name: "get_proof_value" }] : [];
        return {
          requestId: "req",
          events: (async function* (): AsyncGenerator<QvacEvent> {
            yield { type: "contentDelta", text: "x" } as QvacEvent;
            yield { type: "completionDone", stopReason: "eos" } as QvacEvent;
          })(),
          final: Promise.resolve({ contentText: "x", toolCalls, stopReason: "eos" }),
        };
      },
    });
    const report = await runQvacProof(client, MODELS, "/tmp/img.png");
    assert.equal(report.pass, true);
    assert.deepEqual(
      report.steps.map((s) => [s.name, s.pass]),
      [
        ["load-text-model", true],
        ["stream-text", true],
        ["tool-call", true],
        ["cancel", true],
        ["load-vision-model", true],
        ["image-turn", true],
      ],
    );
    assert.equal(calls.unloads.length, 2);
    assert.deepEqual(
      (calls.unloads as Array<{ clearStorage: boolean }>).map((u) => u.clearStorage),
      [false, false],
    );
  });

  it("keeps downloads and continues vision when text load fails", async () => {
    const { client } = scripted({
      loadModel: async (opts) => {
        const o = opts as { modelSrc: unknown };
        if (o.modelSrc === "TEXT") throw new Error("no registry");
        return "mv";
      },
    });
    const report = await runQvacProof(client, MODELS, "/tmp/img.png");
    assert.equal(report.pass, false);
    const byName = Object.fromEntries(report.steps.map((s) => [s.name, s.pass]));
    assert.equal(byName["load-text-model"], false);
    assert.equal(byName["stream-text"], false);
    assert.equal(byName["load-vision-model"], true);
    assert.equal(byName["image-turn"], true);
  });

  it("fails stream-text on empty output", async () => {
    const { client } = scripted({
      completion: () => ({
        requestId: "req",
        events: (async function* (): AsyncGenerator<QvacEvent> {
          yield { type: "completionDone", stopReason: "eos" } as QvacEvent;
        })(),
        final: Promise.resolve({ contentText: "", toolCalls: [], stopReason: "eos" }),
      }),
    });
    const report = await runQvacProof(client, MODELS, "/tmp/img.png");
    assert.equal(report.pass, false);
    assert.equal(
      report.steps.find((s) => s.name === "stream-text")?.pass,
      false,
    );
  });
});
