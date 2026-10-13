/** Kokoro tracer (issue 02) — the one-shot speak path.
 *
 * The tracer bullet: local model path → engine → canned sentence audible
 * through the library's NATIVE PCM player. Spec open item 3 is settled in
 * the shipped 0.4.4 types: the batch `createTTS` engine has NO PCM player
 * (only `generateSpeech` etc.); the player lives on the streaming engine
 * from `createStreamingTTS`. So the path uses the streaming engine with a
 * full-buffer write — the spec's own pre-authorized fallback.
 *
 * Native playback can't run in node, so the engine-facing seam is the
 * loader: these tests inject a fake module and assert the call contract
 * (player lifecycle, chunk fan-in, cleanup on every exit).
 *
 * Run: node --test tests/tts-oneshot.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  KOKORO_EN_MODEL_ID,
  speakOnce,
  type PcmPlaybackEngine,
  type SherpaTtsApi,
} from "../lib/tts/oneshot.ts";

const ROOT = path.join(import.meta.dirname, "..");
function read(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

/** A fake engine that records the call order and fires the stream handlers
 *  synchronously once generation "starts". */
function fakeEngine(handlers?: {
  chunks?: number[][];
  end?: boolean;
  error?: string;
  streamRejects?: Error;
  sampleRate?: number;
}) {
  const calls: string[] = [];
  const engine: PcmPlaybackEngine = {
    getSampleRate: () => {
      calls.push("getSampleRate");
      return Promise.resolve(handlers?.sampleRate ?? 24_000);
    },
    startPcmPlayer: (sampleRate, channels) => {
      calls.push(`startPcmPlayer(${sampleRate},${channels})`);
      return Promise.resolve();
    },
    writePcmChunk: (samples) => {
      calls.push(`writePcmChunk(${samples.join(",")})`);
      return Promise.resolve();
    },
    stopPcmPlayer: () => {
      calls.push("stopPcmPlayer");
      return Promise.resolve();
    },
    generateSpeechStream: (text, options, streamHandlers) => {
      calls.push(
        `generateSpeechStream(${text}|sid=${options?.sid ?? "default"}|speed=${options?.speed ?? "default"})`,
      );
      if (handlers?.streamRejects) return Promise.reject(handlers.streamRejects);
      for (const chunk of handlers?.chunks ?? []) {
        streamHandlers.onChunk?.({ samples: chunk });
      }
      if (handlers?.error) {
        streamHandlers.onError?.({ message: handlers.error });
      } else if (handlers?.end !== false) {
        streamHandlers.onEnd?.();
      }
      return Promise.resolve({ cancel: () => Promise.resolve(), unsubscribe: () => {} });
    },
    destroy: () => {
      calls.push("destroy");
      return Promise.resolve();
    },
  };
  return { engine, calls };
}

const CANNED = "Hello! This is the LiAI neural voice.";

describe("kokoro one-shot — happy path", () => {
  it("streams the sentence into the native PCM player, then stops and destroys", async () => {
    const { engine, calls } = fakeEngine({ chunks: [[0.1, 0.2], [0.3]] });
    let seenOptions: unknown;
    const api: SherpaTtsApi = {
      createStreamingTTS: (options) => {
        seenOptions = options;
        return Promise.resolve(engine);
      },
    };

    await speakOnce(async () => api, {
      modelPath: "/models/tts/kokoro-int8-en-v0_19",
      text: CANNED,
      sid: 3,
      speed: 1.1,
    });

    // The downloader's local dir becomes a file-model init, kokoro-typed.
    assert.deepEqual(seenOptions, {
      modelPath: { type: "file", path: "/models/tts/kokoro-int8-en-v0_19" },
      modelType: "kokoro",
    });
    // Player starts at the MODEL's sample rate, mono, BEFORE any chunk;
    // every chunk lands in it; stop comes after the last one; destroy last.
    assert.deepEqual(calls, [
      "getSampleRate",
      "startPcmPlayer(24000,1)",
      `generateSpeechStream(${CANNED}|sid=3|speed=1.1)`,
      "writePcmChunk(0.1,0.2)",
      "writePcmChunk(0.3)",
      "stopPcmPlayer",
      "destroy",
    ]);
  });

  it("omits unset generation options rather than sending undefined noise", async () => {
    const { engine, calls } = fakeEngine({});
    const api: SherpaTtsApi = { createStreamingTTS: () => Promise.resolve(engine) };

    await speakOnce(async () => api, { modelPath: "/m", text: CANNED });
    assert.equal(calls[2], `generateSpeechStream(${CANNED}|sid=default|speed=default)`);
  });

  it("leaves the registry model id on a named constant the store can share", () => {
    assert.equal(KOKORO_EN_MODEL_ID, "kokoro-int8-en-v0_19");
  });
});

describe("kokoro one-shot — failure paths still clean up", () => {
  it("a stream error rejects and still stops the player and destroys the engine", async () => {
    const { engine, calls } = fakeEngine({ error: "native blew up" });
    const api: SherpaTtsApi = { createStreamingTTS: () => Promise.resolve(engine) };

    await assert.rejects(
      speakOnce(async () => api, { modelPath: "/m", text: CANNED }),
      /native blew up/,
    );
    assert.ok(calls.includes("stopPcmPlayer"), "player stopped after error");
    assert.equal(calls.at(-1), "destroy");
  });

  it("a generation that never starts rejects and still cleans up", async () => {
    const { engine, calls } = fakeEngine({
      streamRejects: new Error("model not loaded"),
    });
    const api: SherpaTtsApi = { createStreamingTTS: () => Promise.resolve(engine) };

    await assert.rejects(
      speakOnce(async () => api, { modelPath: "/m", text: CANNED }),
      /model not loaded/,
    );
    assert.ok(calls.includes("stopPcmPlayer"));
    assert.equal(calls.at(-1), "destroy");
  });

  it("an engine that fails to load needs no cleanup", async () => {
    const api: SherpaTtsApi = {
      createStreamingTTS: () => Promise.reject(new Error("missing lexicon")),
    };
    await assert.rejects(
      speakOnce(async () => api, { modelPath: "/m", text: CANNED }),
      /missing lexicon/,
    );
  });
});

describe("tracer wiring — the dev screen drives the bridge and the one-shot path", () => {
  it("the voice settings screen hosts the tracer behind __DEV__ only", () => {
    const src = read("components/VoiceSettings.tsx");
    assert.match(src, /\{__DEV__ \? <KokoroTracer \/> : null\}/);
  });

  it("the tracer downloads with visible percent, can abort, and speaks", () => {
    const src = read("components/voice/KokoroTracer.tsx");
    assert.match(src, /ttsDownloads\s*\.download\(KOKORO_EN_MODEL_ID, setStatus\)/);
    assert.match(src, /Math\.round\(status\.percent\)/, "the percent is shown");
    assert.match(src, /ttsDownloads\.abort\(\)/, "the cancel button aborts");
    assert.match(src, /ttsDownloads\s*\.status\(KOKORO_EN_MODEL_ID\)/, "reconciles from disk on mount");
    assert.match(src, /speakKokoroOnce\(\{ modelPath: local, text: KOKORO_CANNED_LINE \}\)/);
  });
});
