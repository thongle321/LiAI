/** TTS engines + registry (ticket 03 / spec Q2, Q5, Q9, Q15a).
 *
 * The engines follow the download bridge's seam pattern: a factory over
 * injected deps, so node tests drive them with fakes and the app wires
 * the real native modules through dynamic imports.
 *
 * Run: node --test tests/tts-engines.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createSystemEngine,
  type SpeechApi,
  type SystemSpeakOptions,
} from "../lib/tts/engines/system.ts";
import {
  createKokoroEngine,
  KOKORO_VOICES,
  type KokoroEngineDeps,
} from "../lib/tts/engines/kokoro.ts";
import { getEngine, getAllEngines } from "../lib/tts/engineRegistry.ts";
import { DEVICE_DEFAULT_VOICE, type Voice } from "../lib/tts/types.ts";
import type { SpeakOnceOptions } from "../lib/tts/oneshot.ts";
import type { TtsModelStatus } from "../lib/tts/download.ts";

// ---------------------------------------------------------------------------
// SystemEngine
// ---------------------------------------------------------------------------

/** Fake expo-speech surface; `onSpeak` fires the callbacks the engine
 *  attached, so tests decide when playback ends. */
function fakeSpeech(onSpeak?: (options: SystemSpeakOptions) => void) {
  const calls: string[] = [];
  const api: SpeechApi = {
    speak: (text, options) => {
      calls.push(`speak:${text}`);
      onSpeak?.(options ?? {});
    },
    stop: () => {
      calls.push("stop");
    },
  };
  return { api, calls };
}

describe("SystemEngine", () => {
  it("is always installed and offers exactly the Device default voice", async () => {
    const { api } = fakeSpeech();
    const engine = createSystemEngine(async () => api);

    assert.equal(await engine.isInstalled(), true);
    // Q9: system voices are never enumerated — one row, no OS voice ids.
    assert.deepEqual(await engine.getVoices(), [DEVICE_DEFAULT_VOICE]);
  });

  it("speaks through the injected API and resolves on done", async () => {
    const { api, calls } = fakeSpeech((options) => options.onDone?.());
    const engine = createSystemEngine(async () => api);

    await engine.play("hello there", DEVICE_DEFAULT_VOICE);

    assert.deepEqual(calls, ["speak:hello there"]);
  });

  it("pins the device language and no OS voice id", async () => {
    let seen: SystemSpeakOptions | undefined;
    const { api } = fakeSpeech((options) => {
      seen = options;
      options.onDone?.();
    });
    const engine = createSystemEngine(async () => api);

    await engine.play("hi", DEVICE_DEFAULT_VOICE);

    assert.equal(seen?.language, "en-US");
    assert.equal(seen?.voice, undefined, "Q9 — never pin an OS voice");
  });

  it("stop() stops the API and settles the in-flight play", async () => {
    const { api, calls } = fakeSpeech();
    const engine = createSystemEngine(async () => api);

    const playing = engine.play("long reply", DEVICE_DEFAULT_VOICE);
    await new Promise((r) => setTimeout(r, 0));
    await engine.stop();
    // The fake delivers onStopped the way expo-speech does: after stop().

    assert.deepEqual(calls, ["speak:long reply", "stop"]);
    // Play resolves only because stop fired onStopped; without the engine
    // wiring that callback the test would hang.
    await playing;
  });

  it("rejects when the OS reports a playback error", async () => {
    const { api } = fakeSpeech((options) => options.onError?.());
    const engine = createSystemEngine(async () => api);

    await assert.rejects(engine.play("boom", DEVICE_DEFAULT_VOICE), /playback failed/);
  });
});

// ---------------------------------------------------------------------------
// KokoroEngine
// ---------------------------------------------------------------------------

function fakeKokoroDeps(overrides?: Partial<KokoroEngineDeps>) {
  const calls: string[] = [];
  let status: TtsModelStatus = { state: "ready", percent: 100 };
  const deps: KokoroEngineDeps = {
    status: async () => status,
    localPath: async () => {
      calls.push("localPath");
      return "/models/tts/kokoro-int8-en-v0_19";
    },
    speakOnce: async (options) => {
      calls.push(
        `speakOnce:sid=${options.sid ?? "default"}:speed=${options.speed ?? "default"}:signal=${options.signal !== undefined}`,
      );
    },
    ...overrides,
  };
  return { deps, calls, setStatus: (s: TtsModelStatus) => (status = s) };
}

describe("KokoroEngine — voices", () => {
  it("curates the 11 named voices of kokoro-int8-en-v0_19, sids 0..10", async () => {
    const { deps } = fakeKokoroDeps();
    const engine = createKokoroEngine(deps);

    const voices = await engine.getVoices();
    assert.equal(voices.length, 11, "spec finding 02: 11 speakers, not ~20");
    // Ids are sherpa's, in the order its own voices.bin generator writes
    // them (scripts/kokoro/v0.19/generate_voices_bin.py). Names are the
    // labels for those exact speakers — NOT upstream Kokoro-82M's names,
    // whose 22-voice ordering mislabels everything past index 4.
    assert.deepEqual(
      voices.map((v) => v.id),
      [
        "af", "af_bella", "af_nicole", "af_sarah", "af_sky",
        "am_adam", "am_michael", "bf_emma", "bf_isabella",
        "bm_george", "bm_lewis",
      ],
    );
    assert.deepEqual(
      voices.map((v) => v.name),
      [
        "Default", "Bella", "Nicole", "Sarah", "Sky",
        "Adam", "Michael", "Emma", "Isabella", "George", "Lewis",
      ],
    );
    // List order IS sid order; play() derives the sid from it.
    assert.ok(voices.every((v, i) => v.id.length > 0 && v.engine === "kokoro" && i >= 0));
  });
});

describe("KokoroEngine — install state", () => {
  it("isInstalled mirrors the download bridge's state", async () => {
    const { deps, setStatus } = fakeKokoroDeps();
    const engine = createKokoroEngine(deps);

    assert.equal(await engine.isInstalled(), true);
    setStatus({ state: "not_installed", percent: 0 });
    assert.equal(await engine.isInstalled(), false);
    setStatus({ state: "downloading", percent: 42 });
    assert.equal(await engine.isInstalled(), false);
  });

  it("play rejects when the model is not on disk, without generating", async () => {
    const { deps, calls } = fakeKokoroDeps({
      localPath: async () => {
        calls.push("localPath");
        return null;
      },
    });
    const engine = createKokoroEngine(deps);

    await assert.rejects(engine.play("hi", KOKORO_VOICES[0]), /not installed/);
    assert.ok(!calls.some((c) => c.startsWith("speakOnce")));
  });
});

describe("KokoroEngine — play routing", () => {
  it("derives the sid from the voice's list position and passes an abort signal", async () => {
    const { deps, calls } = fakeKokoroDeps();
    const engine = createKokoroEngine(deps);

    await engine.play("hello", KOKORO_VOICES[3]);

    assert.deepEqual(calls, ["localPath", "speakOnce:sid=3:speed=default:signal=true"]);
  });

  it("lets PlayOptions override sid and speed", async () => {
    const { deps, calls } = fakeKokoroDeps();
    const engine = createKokoroEngine(deps);

    await engine.play("hello", KOKORO_VOICES[0], { sid: 7, speed: 1.2 });

    assert.deepEqual(calls, ["localPath", "speakOnce:sid=7:speed=1.2:signal=true"]);
  });

  it("rejects a voice that is not in the curated list", async () => {
    const { deps } = fakeKokoroDeps();
    const engine = createKokoroEngine(deps);
    const stale: Voice = { id: "af_ghost", name: "Ghost", engine: "kokoro" };

    await assert.rejects(engine.play("hi", stale), /unknown kokoro voice/);
  });

  it("stop() aborts the in-flight one-shot, which then resolves", async () => {
    let inFlightSignal: AbortSignal | undefined;
    const { deps } = fakeKokoroDeps({
      speakOnce: async (options: SpeakOnceOptions) => {
        // Mirror speakOnce's contract: resolves when the signal aborts.
        await new Promise<void>((resolve) => {
          options.signal?.addEventListener("abort", () => resolve(), { once: true });
        });
        inFlightSignal = options.signal;
      },
    });
    const engine = createKokoroEngine(deps);

    const playing = engine.play("long reply", KOKORO_VOICES[0]);
    await new Promise((r) => setTimeout(r, 0));
    await engine.stop();
    await playing;

    assert.equal(inFlightSignal?.aborted, true);
  });
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe("engine registry", () => {
  it("serves both engines by id", () => {
    assert.equal(getEngine("system").id, "system");
    assert.equal(getEngine("kokoro").id, "kokoro");
  });

  it("lists kokoro before system — neural first, the no-download default last", () => {
    assert.deepEqual(
      getAllEngines().map((e) => e.id),
      ["kokoro", "system"],
    );
  });

  it("throws on an unknown id instead of returning undefined", () => {
    assert.throws(
      () => getEngine("kitten" as never),
      /Unknown engine id/,
    );
  });
});
