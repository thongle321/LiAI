/** Voice store tests (ticket 03 / spec Q9, Q14, Q15a).
 * Run: node --test tests/voice-settings.test.ts
 *
 * Node-safe seams: the kokoro download bridge and expo-speech are native,
 * so in node the load() reconcile degrades to `download: null` /
 * `deviceMeetsMemory: false` and plays resolve through the catch path.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  createVoiceStore,
  VOICE_KEY,
  KOKORO_MODEL_ID,
  EMPTY_DOWNLOADS,
  RAM_GATE_BYTES,
  reconcileVoice,
  restoreVoice,
} from "../store/voice.ts";
import { DEVICE_DEFAULT_VOICE } from "../lib/tts/types.ts";
import { KOKORO_VOICES } from "../lib/tts/engines/kokoro.ts";
import { KITTEN_VOICES } from "../lib/tts/engines/kitten.ts";
import { SUPERTONIC_VOICES } from "../lib/tts/engines/supertonic.ts";
import type { KeyValueStorage } from "../lib/storage.ts";

function memoryStorage(seed: Record<string, string> = {}): KeyValueStorage & {
  data: Record<string, string>;
} {
  const data: Record<string, string> = { ...seed };
  return {
    data,
    getItem: async (k: string) => data[k] ?? null,
    setItem: async (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: async (k: string) => {
      delete data[k];
    },
  };
}

describe("voice store", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it("defaults to the device-default voice with auto-speak OFF (spec Q14)", async () => {
    const useStore = createVoiceStore(storage);
    await useStore.getState().load();
    const s = useStore.getState();
    assert.equal(s.currentVoice, null, "null currentVoice means the device default");
    assert.equal(s.autoSpeak, false);
    assert.equal(s.userTTSOverride, null);
    assert.equal(s.playbackState.mode, "idle");
    assert.equal(s.isTTSAvailable(), false, "no override + unknown memory = unavailable");
  });

  it("persists and restores voice, auto-speak and the override", async () => {
    const useStore = createVoiceStore(storage);
    await useStore.getState().load();
    useStore.getState().setCurrentVoice(KOKORO_VOICES[2]);
    useStore.getState().setAutoSpeak(true);
    useStore.getState().setUserTTSOverride(true);
    await new Promise((r) => setTimeout(r, 0));

    const useStore2 = createVoiceStore(storage);
    await useStore2.getState().load();
    assert.deepEqual(useStore2.getState().currentVoice, KOKORO_VOICES[2]);
    assert.equal(useStore2.getState().autoSpeak, true);
    assert.equal(useStore2.getState().userTTSOverride, true);
    assert.equal(useStore2.getState().isTTSAvailable(), true);
  });

  it("persists only the three preference fields", async () => {
    const useStore = createVoiceStore(storage);
    await useStore.getState().load();
    useStore.getState().setAutoSpeak(true);
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(JSON.parse(storage.data[VOICE_KEY]), {
      currentVoice: null,
      autoSpeak: true,
      userTTSOverride: null,
    });
  });

  it("migrates an engine-era system voice to the device default (Q9)", async () => {
    const store = createVoiceStore(
      memoryStorage({
        [VOICE_KEY]: JSON.stringify({
          currentVoice: { id: "com.apple.voice.samantha", name: "Samantha", engine: "system" },
          autoSpeak: true,
        }),
      }),
    );
    await store.getState().load();
    assert.deepEqual(store.getState().currentVoice, DEVICE_DEFAULT_VOICE);
    assert.equal(store.getState().autoSpeak, true);
  });

  it("migrates a legacy voiceId blob to the device default — never pins an OS voice", async () => {
    for (const blob of [
      { voiceId: "com.apple.voice.samantha", autoSpeak: true },
      { voiceId: "com.apple.voice.samantha" },
    ]) {
      const store = createVoiceStore(memoryStorage({ [VOICE_KEY]: JSON.stringify(blob) }));
      await store.getState().load();
      assert.deepEqual(store.getState().currentVoice, DEVICE_DEFAULT_VOICE, JSON.stringify(blob));
    }
  });

  it("keeps a curated neural voice across the migration, for every engine", async () => {
    for (const voice of [KOKORO_VOICES[1], KITTEN_VOICES[0], SUPERTONIC_VOICES[0]]) {
      const store = createVoiceStore(
        memoryStorage({
          [VOICE_KEY]: JSON.stringify({ currentVoice: voice, autoSpeak: false }),
        }),
      );
      await store.getState().load();
      assert.deepEqual(store.getState().currentVoice, voice, voice.id);
    }
  });

  it("drops a neural voice that is no longer curated", async () => {
    for (const engine of ["kokoro", "kitten", "supertonic"] as const) {
      const store = createVoiceStore(
        memoryStorage({
          [VOICE_KEY]: JSON.stringify({
            currentVoice: { id: "ghost_voice", name: "Ghost", engine },
          }),
        }),
      );
      await store.getState().load();
      assert.deepEqual(store.getState().currentVoice, DEVICE_DEFAULT_VOICE, engine);
    }
  });

  it("collapses an unknown engine id to the device default", async () => {
    const store = createVoiceStore(
      memoryStorage({
        [VOICE_KEY]: JSON.stringify({
          currentVoice: { id: "af", name: "Bella", engine: "mystery-engine" },
        }),
      }),
    );
    await store.getState().load();
    assert.deepEqual(store.getState().currentVoice, DEVICE_DEFAULT_VOICE);
  });

  it("falls back to defaults on corrupt payload", async () => {
    const bad = createVoiceStore(memoryStorage({ [VOICE_KEY]: "{bad" }));
    await bad.getState().load();
    assert.equal(bad.getState().autoSpeak, false);
    assert.equal(bad.getState().currentVoice, null);
  });

  it("play routes to the system engine and settles idle (node: no native audio)", async () => {
    const store = createVoiceStore(memoryStorage());
    await store.getState().load();
    await store.getState().play("hello", { messageId: "m1" });
    assert.deepEqual(store.getState().playbackState, { mode: "idle" });
  });

  it("stop leaves the playback state idle", async () => {
    const store = createVoiceStore(memoryStorage());
    await store.getState().load();
    await store.getState().stop();
    assert.deepEqual(store.getState().playbackState, { mode: "idle" });
  });

  it("exposes the kokoro model id and RAM gate the spec fixed", () => {
    assert.equal(KOKORO_MODEL_ID, "kokoro-int8-en-v0_19");
    assert.equal(RAM_GATE_BYTES, 4 * 1024 * 1024 * 1024);
  });
});

describe("voice reconcile — a persisted voice whose model vanished", () => {
  const bella = KOKORO_VOICES[1];
  const withState = (
    state: "not_installed" | "error" | "ready",
    engine: "kokoro" | "kitten" | "supertonic" = "kokoro",
  ) => ({ ...EMPTY_DOWNLOADS, [engine]: { state, percent: state === "ready" ? 100 : 0 } });

  it("stashes the id under ITS engine and falls back to the device default", () => {
    for (const state of ["not_installed", "error"] as const) {
      const r = reconcileVoice(bella, withState(state));
      assert.deepEqual(r.voice, DEVICE_DEFAULT_VOICE, state);
      assert.deepEqual(r.stashed, { kokoro: bella.id }, state);
    }
  });

  it("keeps the voice when the model is ready", () => {
    const r = reconcileVoice(bella, withState("ready"));
    assert.deepEqual(r.voice, bella);
    assert.deepEqual(r.stashed, {});
  });

  it("keeps the voice when the download state is unknown — unknown is not vanished", () => {
    const r = reconcileVoice(bella, { ...EMPTY_DOWNLOADS });
    assert.deepEqual(r.voice, bella);
    assert.deepEqual(r.stashed, {});
  });

  it("applies per engine: a missing kokoro model says nothing about a kitten voice", () => {
    const kittenVoice = KITTEN_VOICES[0];
    const r = reconcileVoice(kittenVoice, {
      ...EMPTY_DOWNLOADS,
      kokoro: { state: "not_installed", percent: 0 },
    });
    assert.deepEqual(r.voice, kittenVoice, "kokoro's state is irrelevant here");
    assert.deepEqual(r.stashed, {});
  });

  it("stashes a kitten voice under kitten, not kokoro", () => {
    const kittenVoice = KITTEN_VOICES[0];
    const r = reconcileVoice(kittenVoice, {
      ...EMPTY_DOWNLOADS,
      kitten: { state: "error", percent: 0 },
    });
    assert.deepEqual(r.voice, DEVICE_DEFAULT_VOICE);
    assert.deepEqual(r.stashed, { kitten: kittenVoice.id });
  });

  it("restores a stashed id only while still curated", () => {
    assert.deepEqual(restoreVoice(bella.id, "kokoro"), bella);
    assert.deepEqual(restoreVoice("af_ghost", "kokoro"), null);
    // The same id asked for by the wrong engine is still not a voice.
    assert.deepEqual(restoreVoice(bella.id, "kitten"), null);
    assert.deepEqual(restoreVoice(KITTEN_VOICES[0].id, "kitten"), KITTEN_VOICES[0]);
    assert.deepEqual(
      restoreVoice(SUPERTONIC_VOICES[1].id, "supertonic"),
      SUPERTONIC_VOICES[1],
    );
  });
});
