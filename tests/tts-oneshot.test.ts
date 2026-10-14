/** speakOnce abort support (ticket 03) — the store's stop path aborts an
 *  in-flight one-shot through an AbortSignal.
 *
 * Run: node --test tests/tts-oneshot.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  speakOnce,
  type PcmPlaybackEngine,
  type SherpaTtsApi,
} from "../lib/tts/oneshot.ts";

/** Fake streaming engine; `chunks` samples per onChunk, `endOnStream`
 *  decides whether generation auto-ends (true) or waits for an abort
 *  (false — the stop scenario). `numSpeakers` drives the speaker-count
 *  self-check. */
function fakeEngine(
  log: string[],
  options?: { chunks?: number[][]; endOnStream?: boolean; numSpeakers?: number },
) {
  const { chunks = [[1, 2]], endOnStream = true, numSpeakers = 11 } = options ?? {};
  const handlers:
    | {
        onChunk?: (chunk: { samples: number[] }) => void;
        onEnd?: () => void;
        onError?: (event: { message: string }) => void;
      }
    | undefined = undefined;
  void handlers;
  let captured:
    | {
        onChunk?: (chunk: { samples: number[] }) => void;
        onEnd?: () => void;
        onError?: (event: { message: string }) => void;
      }
    | null = null;
  const engine: PcmPlaybackEngine = {
    getSampleRate: async () => {
      log.push("getSampleRate");
      return 24000;
    },
    getNumSpeakers: async () => numSpeakers,
    startPcmPlayer: async (sampleRate, channels) => {
      log.push(`startPcmPlayer:${sampleRate}:${channels}`);
    },
    writePcmChunk: async (samples) => {
      log.push(`writePcmChunk:${samples.join(",")}`);
    },
    stopPcmPlayer: async () => {
      log.push("stopPcmPlayer");
    },
    generateSpeechStream: async (_text, opts, hs) => {
      log.push(`generateSpeechStream:${JSON.stringify(opts ?? null)}`);
      captured = hs;
      for (const chunk of chunks) hs.onChunk?.({ samples: chunk });
      if (endOnStream) hs.onEnd?.();
      return {
        cancel: async () => {
          log.push("cancel");
        },
        unsubscribe: async () => {
          log.push("unsubscribe");
        },
      };
    },
    destroy: async () => {
      log.push("destroy");
    },
  };
  return {
    engine,
    /** Fire events as if native code delivered them later. */
    emitEnd: () => captured?.onEnd?.(),
    emitError: (message: string) => captured?.onError?.({ message }),
  };
}

function fakeApi(log: string[], engine: PcmPlaybackEngine) {
  const api: SherpaTtsApi & { lastOptions?: unknown } = {
    lastOptions: undefined,
    createStreamingTTS: async (options: unknown) => {
      log.push("createStreamingTTS");
      api.lastOptions = options;
      return engine;
    },
  };
  return api;
}

describe("speakOnce — engine tuning and self-checks", () => {
  it("forwards numThreads and provider to engine creation", async () => {
    const log: string[] = [];
    const { engine } = fakeEngine(log);
    const api = fakeApi(log, engine);

    await speakOnce(async () => api, { modelPath: "/m", text: "hi", modelType: "supertonic" }, {
      numThreads: 4,
      provider: "nnapi",
    });

    assert.deepEqual(api.lastOptions, {
      modelPath: { type: "file", path: "/m" },
      // Per-engine model type passes straight through — a supertonic voice
      // must not be synthesized by the kokoro engine.
      modelType: "supertonic",
      numThreads: 4,
      provider: "nnapi",
    });
  });

  it("defaults the model type to auto-detect when the caller names none", async () => {
    const log: string[] = [];
    const { engine } = fakeEngine(log);
    const api = fakeApi(log, engine);

    await speakOnce(async () => api, { modelPath: "/m", text: "hi" });

    assert.deepEqual(api.lastOptions, {
      modelPath: { type: "file", path: "/m" },
      modelType: "auto",
    });
  });

  it("omits tuning keys entirely when no tuning is supplied", async () => {
    const log: string[] = [];
    const { engine } = fakeEngine(log);
    const api = fakeApi(log, engine);

    await speakOnce(async () => api, { modelPath: "/m", text: "hi" });

    assert.deepEqual(api.lastOptions, {
      modelPath: { type: "file", path: "/m" },
      modelType: "auto",
    });
  });

  it("warns when the model's speaker count contradicts the curated table", async () => {
    const log: string[] = [];
    const { engine } = fakeEngine(log, { numSpeakers: 7 });
    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (msg: string) => warnings.push(msg);
    try {
      await speakOnce(async () => fakeApi(log, engine), {
        modelPath: "/m",
        text: "hi",
        expectedSpeakers: 11,
      });
    } finally {
      console.warn = realWarn;
    }
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /reports 7 speakers but 11 voices are curated/);
  });

  it("stays silent when the count matches, and never throws on mismatch", async () => {
    const log: string[] = [];
    const { engine } = fakeEngine(log, { numSpeakers: 11 });
    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (msg: string) => warnings.push(msg);
    try {
      await speakOnce(async () => fakeApi(log, engine), {
        modelPath: "/m",
        text: "hi",
        expectedSpeakers: 11,
      });
    } finally {
      console.warn = realWarn;
    }
    assert.deepEqual(warnings, []);
    assert.ok(log.includes("destroy"), "playback still completes after a mismatch");
  });
});

describe("speakOnce — no signal (existing path)", () => {
  it("plays through the native player and cleans up", async () => {
    const log: string[] = [];
    const { engine } = fakeEngine(log);
    await speakOnce(async () => fakeApi(log, engine), {
      modelPath: "/models/kokoro",
      text: "hello",
    });
    assert.deepEqual(log, [
      "createStreamingTTS",
      "getSampleRate",
      "startPcmPlayer:24000:1",
      'generateSpeechStream:{"text":"hello"}'.replace('{"text":"hello"}', "null"),
      "writePcmChunk:1,2",
      "stopPcmPlayer",
      "destroy",
    ]);
  });

  it("rejects on generation errors and still stops the player", async () => {
    const log: string[] = [];
    const { engine, emitError } = fakeEngine(log, { endOnStream: false });
    const pending = speakOnce(async () => fakeApi(log, engine), {
      modelPath: "/models/kokoro",
      text: "hello",
    });
    // Let generateSpeechStream resolve and handlers attach, then fail.
    await new Promise((r) => setTimeout(r, 0));
    emitError("bad model");
    await assert.rejects(pending, /bad model/);
    assert.ok(log.includes("stopPcmPlayer"));
    assert.ok(log.includes("destroy"));
  });
});

describe("speakOnce — abort signal", () => {
  it("returns immediately on an already-aborted signal, without loading", async () => {
    const log: string[] = [];
    const controller = new AbortController();
    controller.abort();
    await speakOnce(async () => fakeApi(log, fakeEngine(log).engine), {
      modelPath: "/models/kokoro",
      text: "hello",
      signal: controller.signal,
    });
    assert.deepEqual(log, []);
  });

  it("cancels the in-flight generation and resolves on abort", async () => {
    const log: string[] = [];
    const { engine } = fakeEngine(log, { endOnStream: false });
    const controller = new AbortController();
    const pending = speakOnce(async () => fakeApi(log, engine), {
      modelPath: "/models/kokoro",
      text: "hello",
      sid: 3,
      speed: 1.1,
      signal: controller.signal,
    });
    await new Promise((r) => setTimeout(r, 0));
    controller.abort();
    await pending; // resolves — a stop is a clean terminal state
    assert.deepEqual(log, [
      "createStreamingTTS",
      "getSampleRate",
      "startPcmPlayer:24000:1",
      'generateSpeechStream:{"sid":3,"speed":1.1}',
      "writePcmChunk:1,2",
      "cancel",
      "stopPcmPlayer",
      "destroy",
    ]);
  });
});
