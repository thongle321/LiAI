/** Single-slot TTS runtime (ticket 03 / spec Q14) — FIFO mutex over the
 *  one native model slot, ported from pocketpal's technique.
 *
 * Run: node --test tests/tts-runtime.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { TTSRuntime } from "../lib/tts/runtime.ts";
import type { Engine, EngineId, PlayOptions, Voice } from "../lib/tts/types.ts";

/** Fake engine recording every lifecycle call; `gate` (when set) delays
 *  the play fn so tests can hold the slot open. */
function fakeEngine(id: EngineId, log: string[], gate?: Promise<void>): Engine {
  return {
    id,
    isInstalled: async () => true,
    getVoices: async () => [] as Voice[],
    loadInto: async () => {
      log.push(`loadInto:${id}`);
    },
    play: async (_text: string, _voice: Voice, _options?: PlayOptions) => {
      log.push(`play:${id}`);
      if (gate) await gate;
      log.push(`playDone:${id}`);
    },
    stop: async () => {
      log.push(`stop:${id}`);
    },
  };
}

const voiceFor = (engine: EngineId): Voice => ({ id: engine, name: engine, engine });

describe("tts runtime — single slot", () => {
  it("loads an engine once per slot, not per play", async () => {
    const runtime = new TTSRuntime();
    const log: string[] = [];
    const engine = fakeEngine("system", log);

    await runtime.acquire(engine, async () => {
      log.push("fn");
    });
    await runtime.acquire(engine, async () => {
      log.push("fn");
    });

    assert.deepEqual(log, ["loadInto:system", "fn", "fn"]);
    assert.equal(runtime.getActiveEngineId(), "system");
  });

  it("releases the previous engine's slot before loading the next", async () => {
    const runtime = new TTSRuntime();
    const log: string[] = [];
    const system = fakeEngine("system", log);
    const kokoro = fakeEngine("kokoro", log);

    await runtime.acquire(system, async () => {});
    await runtime.acquire(kokoro, async () => {});

    assert.deepEqual(log, ["loadInto:system", "stop:system", "loadInto:kokoro"]);
    assert.equal(runtime.getActiveEngineId(), "kokoro");
  });

  it("serializes concurrent acquires FIFO", async () => {
    const runtime = new TTSRuntime();
    const log: string[] = [];
    let releaseFirst: () => void = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const system = fakeEngine("system", log, firstGate);
    const kokoro = fakeEngine("kokoro", log);

    const first = runtime.acquire(system, () => system.play("a", voiceFor("system")));
    const second = runtime.acquire(kokoro, () => kokoro.play("b", voiceFor("kokoro")));

    // Give both calls a chance to interleave if serialization is broken.
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(log, ["loadInto:system", "play:system"], "second must wait");
    releaseFirst();
    await Promise.all([first, second]);

    assert.deepEqual(log, [
      "loadInto:system",
      "play:system",
      "playDone:system",
      "stop:system",
      "loadInto:kokoro",
      "play:kokoro",
      "playDone:kokoro",
    ]);
  });

  it("stop() queues behind an in-flight acquire and stops the active engine", async () => {
    const runtime = new TTSRuntime();
    const log: string[] = [];
    let releasePlay: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releasePlay = resolve;
    });
    const system = fakeEngine("system", log, gate);

    const playing = runtime.acquire(system, () => system.play("a", voiceFor("system")));
    await new Promise((r) => setTimeout(r, 0));
    const stopping = runtime.stop();
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(log, ["loadInto:system", "play:system"], "stop must queue");

    releasePlay();
    await Promise.all([playing, stopping]);
    assert.deepEqual(log, [
      "loadInto:system",
      "play:system",
      "playDone:system",
      "stop:system",
    ]);
  });

  it("stop() and release() are no-ops when nothing is active", async () => {
    const runtime = new TTSRuntime();
    const log: string[] = [];

    await runtime.stop();
    await runtime.release();

    assert.deepEqual(log, []);
    assert.equal(runtime.getActiveEngineId(), null);
  });

  it("release() frees the slot so the next acquire reloads", async () => {
    const runtime = new TTSRuntime();
    const log: string[] = [];
    const engine = fakeEngine("kokoro", log);

    await runtime.acquire(engine, async () => {});
    await runtime.release();
    await runtime.acquire(engine, async () => {});

    assert.deepEqual(log, ["loadInto:kokoro", "stop:kokoro", "loadInto:kokoro"]);
    assert.equal(runtime.getActiveEngineId(), "kokoro");
  });

  it("keeps the mutex chain alive when an acquire fn throws", async () => {
    const runtime = new TTSRuntime();
    const log: string[] = [];
    const system = fakeEngine("system", log);

    await assert.rejects(
      runtime.acquire(system, async () => {
        throw new Error("boom");
      }),
      /boom/,
    );
    // The chain must still run the next queued op.
    await runtime.acquire(system, async () => {
      log.push("fn");
    });
    assert.deepEqual(log, ["loadInto:system", "fn"]);
  });
});
