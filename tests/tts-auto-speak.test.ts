/** Auto-speak streaming controller. Run: node --test tests/tts-auto-speak.test.ts */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createAutoSpeak } from "../lib/tts/autoSpeak.ts";
import type { Engine, StreamingHandle, Voice } from "../lib/tts/types.ts";

const VOICE: Voice = { id: "af_bella", name: "Bella", engine: "kitten" };

/** Records what the controller fed it, in order. */
function fakeEngine() {
  const appended: string[] = [];
  let finalized = 0;
  let cancelled = 0;
  const engine = {
    id: "kitten",
    isInstalled: async () => true,
    getVoices: async () => [],
    loadInto: async () => {},
    play: async () => {},
    stop: async () => {},
    playStreaming: (): StreamingHandle => ({
      appendText: (c: string) => {
        appended.push(c);
      },
      finalize: async () => {
        finalized += 1;
      },
      cancel: async () => {
        cancelled += 1;
      },
    }),
  } satisfies Engine;
  return { engine, appended, counts: () => ({ finalized, cancelled }) };
}

/** Lets the controller's async begin() land. */
const settle = () => new Promise((r) => setTimeout(r, 0));

function harness(over: { enabled?: boolean } = {}) {
  const { engine, appended, counts } = fakeEngine();
  let stopCalls = 0;
  const controller = createAutoSpeak({
    isEnabled: () => over.enabled ?? true,
    resolve: async () => ({ engine, voice: VOICE }),
    stopInFlight: async () => {
      stopCalls += 1;
    },
    pickPlaceholder: () => "Hmm.",
  });
  return { controller, appended, counts, stopCalls: () => stopCalls };
}

describe("auto-speak streaming", () => {
  it("does nothing when auto-speak is off", async () => {
    const h = harness({ enabled: false });
    h.controller.begin("m1");
    h.controller.append("hello");
    await h.controller.finish();
    await settle();
    assert.deepEqual(h.appended, []);
    assert.equal(h.controller.activeMessageId(), null);
  });

  it("streams deltas through in order and finalizes once", async () => {
    const h = harness();
    h.controller.begin("m1");
    await settle();
    h.controller.append("Hello ");
    h.controller.append("there.");
    await h.controller.finish();
    assert.deepEqual(h.appended, ["Hello ", "there."]);
    assert.equal(h.counts().finalized, 1);
    assert.equal(h.counts().cancelled, 0);
  });

  it("buffers deltas that arrive before the stream is ready", async () => {
    const h = harness();
    h.controller.begin("m1");
    // No settle(): appends land while `resolve` is still pending.
    h.controller.append("early ");
    h.controller.append("text");
    await settle();
    assert.deepEqual(h.appended, ["early ", "text"]);
  });

  it("says the thinking placeholder once, before the reply, only after reasoning", async () => {
    const h = harness();
    h.controller.begin("m1");
    h.controller.noteReasoning("weighing options");
    await settle();
    h.controller.append("Answer");
    h.controller.append(" more");
    await h.controller.finish();
    assert.deepEqual(h.appended, ["Hmm. ", "Answer", " more"]);
  });

  it("stays silent when the model did not reason", async () => {
    const h = harness();
    h.controller.begin("m1");
    h.controller.noteReasoning("   ");
    await settle();
    h.controller.append("Answer");
    await h.controller.finish();
    assert.deepEqual(h.appended, ["Answer"]);
  });

  it("waits for the prior stop before starting, so it cannot be cancelled by it", async () => {
    const h = harness();
    h.controller.begin("m1");
    await settle();
    assert.equal(h.stopCalls(), 1, "begin sequences behind one serialized stop");
  });

  it("is idempotent for a repeated begin on the same message", async () => {
    const h = harness();
    h.controller.begin("m1");
    await settle();
    h.controller.append("a");
    h.controller.begin("m1");
    h.controller.append("b");
    await h.controller.finish();
    assert.deepEqual(h.appended, ["a", "b"], "no second stream, no lost delta");
  });

  it("supersedes the old stream when a new message begins", async () => {
    const h = harness();
    h.controller.begin("m1");
    await settle();
    h.controller.append("old");
    h.controller.begin("m2");
    await settle();
    h.controller.append("new");
    await h.controller.finish();
    assert.equal(h.counts().cancelled, 1, "the superseded stream is cancelled");
    assert.deepEqual(h.appended, ["old", "new"]);
  });

  it("stop() cancels live playback and clears ownership", async () => {
    const h = harness();
    h.controller.begin("m1");
    await settle();
    h.controller.append("x");
    h.controller.stop();
    await settle();
    assert.equal(h.counts().cancelled, 1);
    assert.equal(h.controller.activeMessageId(), null);
  });

  it("ignores appends with no active message", async () => {
    const h = harness();
    h.controller.append("stray");
    await h.controller.finish();
    assert.deepEqual(h.appended, []);
  });
});