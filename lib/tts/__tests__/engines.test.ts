
/** TTS engines + registry (ticket 03 / spec Q2, Q5, Q9, Q15a).
 *
 * The engines follow the download bridge's seam pattern: a factory over
 * injected deps, so these tests drive them with fakes and the app wires
 * the real native modules through dynamic imports.
 */


import {
  createSystemEngine,
  type SpeechApi,
  type SystemSpeakOptions,
} from "../engines/system";
import { KOKORO_VOICES } from "../engines/kokoro";
import { KITTEN_VOICES } from "../engines/kitten";
import { SUPERTONIC_VOICES } from "../engines/supertonic";
import { createNeuralEngine, type NeuralEngineDeps } from "../engines/neural";
import { getEngine, getAllEngines } from "../engineRegistry";
import { NEURAL_ENGINE_META, ENGINE_ORDER } from "../engineMeta";
import { DEVICE_DEFAULT_VOICE, type Voice } from "../types";
import type { SpeakOnceOptions } from "../oneshot";
import type { TtsModelStatus } from "../download";

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

    expect(await engine.isInstalled()).toEqual(true);
    // Q9: system voices are never enumerated — one row, no OS voice ids.
    expect(await engine.getVoices()).toEqual([DEVICE_DEFAULT_VOICE]);
  });

  it("speaks through the injected API and resolves on done", async () => {
    const { api, calls } = fakeSpeech((options) => options.onDone?.());
    const engine = createSystemEngine(async () => api);

    await engine.play("hello there", DEVICE_DEFAULT_VOICE);

    expect(calls).toEqual(["speak:hello there"]);
  });

  it("pins the device language and no OS voice id", async () => {
    let seen: SystemSpeakOptions | undefined;
    const { api } = fakeSpeech((options) => {
      seen = options;
      options.onDone?.();
    });
    const engine = createSystemEngine(async () => api);

    await engine.play("hi", DEVICE_DEFAULT_VOICE);

    expect(seen?.language).toEqual("en-US");
    expect(seen?.voice).toEqual(undefined);
  });

  it("stop() stops the API and settles the in-flight play", async () => {
    const { api, calls } = fakeSpeech();
    const engine = createSystemEngine(async () => api);

    const playing = engine.play("long reply", DEVICE_DEFAULT_VOICE);
    await new Promise((r) => setTimeout(r, 0));
    await engine.stop();
    // The fake delivers onStopped the way expo-speech does: after stop().

    expect(calls).toEqual(["speak:long reply", "stop"]);
    // Play resolves only because stop fired onStopped; without the engine
    // wiring that callback the test would hang.
    await playing;
  });

  it("rejects when the OS reports a playback error", async () => {
    const { api } = fakeSpeech((options) => options.onError?.());
    const engine = createSystemEngine(async () => api);

    await expect(engine.play("boom", DEVICE_DEFAULT_VOICE)).rejects.toThrow(/playback failed/);
  });
});

// ---------------------------------------------------------------------------
// KokoroEngine
// ---------------------------------------------------------------------------

function fakeKokoroDeps(overrides?: Partial<NeuralEngineDeps>) {
  const calls: string[] = [];
  let status: TtsModelStatus = { state: "ready", percent: 100 };
  const deps: NeuralEngineDeps = {
    status: async () => status,
    localPath: async () => {
      calls.push("localPath");
      return "/models/tts/kokoro-int8-en-v0_19";
    },
    speakOnce: async (options) => {
      calls.push(
        `speakOnce:type=${options.modelType}:sid=${options.sid ?? "default"}:speed=${options.speed ?? "default"}:signal=${options.signal !== undefined}`,
      );
    },
    ...overrides,
  };
  return { deps, calls, setStatus: (s: TtsModelStatus) => (status = s) };
}

/** The one factory, driven by the engine table — exactly as the app wires it. */
const makeEngine = (id: "kokoro" | "kitten" | "supertonic", deps: NeuralEngineDeps) =>
  createNeuralEngine(NEURAL_ENGINE_META[id], deps);

describe("KokoroEngine — voices", () => {
  it("curates the 11 named voices of kokoro-int8-en-v0_19, sids 0..10", async () => {
    const { deps } = fakeKokoroDeps();
    const engine = makeEngine("kokoro", deps);

    const voices = await engine.getVoices();
    expect(voices.length).toEqual(11);
    // Ids are sherpa's, in the order its own voices.bin generator writes
    // them (scripts/kokoro/v0.19/generate_voices_bin.py). Names are the
    // labels for those exact speakers — NOT upstream Kokoro-82M's names,
    // whose 22-voice ordering mislabels everything past index 4.
    expect(voices.map((v) => v.id)).toEqual([
        "af", "af_bella", "af_nicole", "af_sarah", "af_sky",
        "am_adam", "am_michael", "bf_emma", "bf_isabella",
        "bm_george", "bm_lewis",
      ]);
    expect(voices.map((v) => v.name)).toEqual([
        "Default", "Bella", "Nicole", "Sarah", "Sky",
        "Adam", "Michael", "Emma", "Isabella", "George", "Lewis",
      ]);
    // List order IS sid order; play() derives the sid from it.
    expect(voices.every((v, i) => v.id.length > 0 && v.engine === "kokoro" && i >= 0)).toBeTruthy();
  });
});

describe("KokoroEngine — install state", () => {
  it("isInstalled mirrors the download bridge's state", async () => {
    const { deps, setStatus } = fakeKokoroDeps();
    const engine = makeEngine("kokoro", deps);

    expect(await engine.isInstalled()).toEqual(true);
    setStatus({ state: "not_installed", percent: 0 });
    expect(await engine.isInstalled()).toEqual(false);
    setStatus({ state: "downloading", percent: 42 });
    expect(await engine.isInstalled()).toEqual(false);
  });

  it("play rejects when the model is not on disk, without generating", async () => {
    const { deps, calls } = fakeKokoroDeps({
      localPath: async () => {
        calls.push("localPath");
        return null;
      },
    });
    const engine = makeEngine("kokoro", deps);

    await expect(engine.play("hi", KOKORO_VOICES[0])).rejects.toThrow(/not installed/);
    expect(!calls.some((c) => c.startsWith("speakOnce"))).toBeTruthy();
  });
});

describe("KokoroEngine — play routing", () => {
  it("derives the sid from the voice's list position and passes an abort signal", async () => {
    const { deps, calls } = fakeKokoroDeps();
    const engine = makeEngine("kokoro", deps);

    await engine.play("hello", KOKORO_VOICES[3]);

    expect(calls).toEqual([
      "localPath",
      "speakOnce:type=kokoro:sid=3:speed=default:signal=true",
    ]);
  });

  it("lets PlayOptions override sid and speed", async () => {
    const { deps, calls } = fakeKokoroDeps();
    const engine = makeEngine("kokoro", deps);

    await engine.play("hello", KOKORO_VOICES[0], { sid: 7, speed: 1.2 });

    expect(calls).toEqual([
      "localPath",
      "speakOnce:type=kokoro:sid=7:speed=1.2:signal=true",
    ]);
  });

  it("rejects a voice that is not in the curated list", async () => {
    const { deps } = fakeKokoroDeps();
    const engine = makeEngine("kokoro", deps);
    const stale: Voice = { id: "af_ghost", name: "Ghost", engine: "kokoro" };

    await expect(engine.play("hi", stale)).rejects.toThrow(/unknown kokoro voice/);
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
    const engine = makeEngine("kokoro", deps);

    const playing = engine.play("long reply", KOKORO_VOICES[0]);
    await new Promise((r) => setTimeout(r, 0));
    await engine.stop();
    await playing;

    expect(inFlightSignal?.aborted).toEqual(true);
  });
});

// ---------------------------------------------------------------------------
// The other two neural engines — same factory, their own modelType
// ---------------------------------------------------------------------------

describe("KittenEngine / SupertonicEngine", () => {
  it("each instantiate their OWN sherpa model type", async () => {
    // The whole point of the shared factory: modelType is per-engine, so a
    // kitten voice must never reach sherpa as a kokoro model.
    const { deps, calls } = fakeKokoroDeps();
    const kitten = makeEngine("kitten", deps);
    await kitten.play("hello", KITTEN_VOICES[2]);
    expect(calls.some((c) => c.startsWith("speakOnce:type=kitten:sid=2"))).toBeTruthy();

    calls.length = 0;
    const supertonic = makeEngine("supertonic", deps);
    await supertonic.play("hello", SUPERTONIC_VOICES[0]);
    expect(calls.some((c) => c.startsWith("speakOnce:type=supertonic:sid=0"))).toBeTruthy();
  });

  it("carry their curated voices, tagged with their own engine", async () => {
    const { deps } = fakeKokoroDeps();
    expect((await makeEngine("kitten", deps).getVoices()).map((v) => v.engine)).toEqual(Array(8).fill("kitten"));
    expect((await makeEngine("supertonic", deps).getVoices()).map((v) => v.engine)).toEqual(Array(10).fill("supertonic"));
  });

  it("reject a voice belonging to another engine", async () => {
    const { deps } = fakeKokoroDeps();
    const kitten = makeEngine("kitten", deps);
    await expect(kitten.play("hi", KOKORO_VOICES[0])).rejects.toThrow(/unknown kitten voice/);
  });
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe("engine registry", () => {
  it("serves every engine by id", () => {
    expect(getEngine("system").id).toEqual("system");
    for (const id of ENGINE_ORDER) {
      expect(getEngine(id).id).toEqual(id);
    }
  });

  it("lists the neural engines in card order, then the no-download default last", () => {
    expect(getAllEngines().map((e) => e.id)).toEqual([...ENGINE_ORDER, "system"]);
  });

  it("throws on an unknown id instead of returning undefined", () => {
    expect(() => getEngine("mystery" as never)).toThrow(/Unknown engine id/);
  });
});

// ---------------------------------------------------------------------------
// The engine table
// ---------------------------------------------------------------------------

describe("NEURAL_ENGINE_META", () => {
  it("covers every engine in ENGINE_ORDER with the card's own strings", () => {
    expect(Object.keys(NEURAL_ENGINE_META).sort()).toEqual([...ENGINE_ORDER].sort());
    for (const id of ENGINE_ORDER) {
      const meta = NEURAL_ENGINE_META[id];
      expect(meta.title.length > 0).toBeTruthy();
      expect(meta.badge.length > 0).toBeTruthy();
      expect(meta.modelId.length > 0).toBeTruthy();
      expect(meta.modelBytes > 0).toBeTruthy();
      // modelId is the registry id the download bridge resolves; it must be
      // the id WITHOUT the release archive's .tar.bz2 suffix.
      expect(!meta.modelId.endsWith(".tar.bz2")).toBeTruthy();
      expect(meta.modelId.includes(meta.id)).toBeTruthy();
    }
  });

  it("builds each spec line from its OWN voice count and measured size", () => {
    // Decimal MB, the app's own formatter — a voice-pack size must read the
    // same as every other size in the app.
    expect(NEURAL_ENGINE_META.kokoro.spec).toEqual("11 voices · 103.2 MB");
    expect(NEURAL_ENGINE_META.kitten.spec).toEqual("8 voices · 31.2 MB");
    expect(NEURAL_ENGINE_META.supertonic.spec).toEqual("10 voices · 128.8 MB");
    // The reference design's "22 voices · 330 MB" is PocketPal's DIFFERENT
    // kokoro model; this app must never promise a download it does not make.
    expect(!NEURAL_ENGINE_META.kokoro.spec.includes("22 voices")).toBeTruthy();
    expect(!NEURAL_ENGINE_META.kokoro.spec.includes("330")).toBeTruthy();
  });

  it("names a distinct sherpa model type per engine", () => {
    const types = ENGINE_ORDER.map((id) => NEURAL_ENGINE_META[id].modelType);
    expect(types).toEqual(["kitten", "kokoro", "supertonic"]);
  });
});
