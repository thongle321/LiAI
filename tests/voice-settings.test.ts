/** Voice settings store tests. Run: node --test tests/voice-settings.test.ts */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { createVoiceStore, VOICE_KEY } from "../store/voice.ts";
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

  it("defaults to the system voice with auto-speak on", async () => {
    const useStore = createVoiceStore(storage);
    await useStore.getState().load();
    const s = useStore.getState();
    assert.equal(s.voiceId, null, "null voice means the device default");
    assert.equal(s.autoSpeak, true);
  });

  it("persists and restores the voice and auto-speak", async () => {
    const useStore = createVoiceStore(storage);
    await useStore.getState().load();
    useStore.getState().setVoice("com.apple.voice.samantha");
    useStore.getState().setAutoSpeak(false);
    await new Promise((r) => setTimeout(r, 0));

    const useStore2 = createVoiceStore(storage);
    await useStore2.getState().load();
    assert.equal(useStore2.getState().voiceId, "com.apple.voice.samantha");
    assert.equal(useStore2.getState().autoSpeak, false);
    assert.ok(storage.data[VOICE_KEY].includes("samantha"));
  });

  it("persists only the voice and the auto-speak flag", async () => {
    const useStore = createVoiceStore(storage);
    await useStore.getState().load();
    useStore.getState().setAutoSpeak(false);
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(JSON.parse(storage.data[VOICE_KEY]), {
      voiceId: null,
      autoSpeak: false,
    });
  });

  it("migrates an engine-era system voice back to a voiceId", async () => {
    const store = createVoiceStore(
      memoryStorage({
        [VOICE_KEY]: JSON.stringify({
          currentVoice: { id: "com.apple.voice.samantha", name: "Samantha", engine: "system" },
          autoSpeak: false,
        }),
      }),
    );
    await store.getState().load();
    assert.equal(store.getState().voiceId, "com.apple.voice.samantha");
    assert.equal(store.getState().autoSpeak, false);
  });

  it("falls back to the system default for a non-system engine voice", async () => {
    // Kokoro and friends had no implementation, so an id from one of them
    // can never be spoken — pinning it would leave a dead selection.
    for (const engine of ["kitten", "kokoro", "supertonic"]) {
      const store = createVoiceStore(
        memoryStorage({
          [VOICE_KEY]: JSON.stringify({ currentVoice: { id: "af_bella", name: "Bella", engine } }),
        }),
      );
      await store.getState().load();
      assert.equal(store.getState().voiceId, null, `${engine} must not become a voiceId`);
    }
  });

  it("prefers voiceId over currentVoice when both are present", async () => {
    const store = createVoiceStore(
      memoryStorage({
        [VOICE_KEY]: JSON.stringify({
          voiceId: "explicit",
          currentVoice: { id: "legacy", name: "Legacy", engine: "system" },
        }),
      }),
    );
    await store.getState().load();
    assert.equal(store.getState().voiceId, "explicit");
  });

  it("falls back to defaults on corrupt payload", async () => {
    const bad = createVoiceStore(memoryStorage({ [VOICE_KEY]: "{bad" }));
    await bad.getState().load();
    assert.equal(bad.getState().autoSpeak, true);
    assert.equal(bad.getState().voiceId, null);
  });
});