/** Voice settings store tests. Run: node --test frontend/tests/voice-settings.test.ts */

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

  it("defaults to system voice, 1.0x, auto-speak on", async () => {
    const useStore = createVoiceStore(storage);
    await useStore.getState().load();
    const s = useStore.getState();
    assert.equal(s.voiceId, null);
    assert.equal(s.rate, 1.0);
    assert.equal(s.pitch, 1.0);
    assert.equal(s.autoSpeak, true);
  });

  it("persists and restores settings", async () => {
    const useStore = createVoiceStore(storage);
    await useStore.getState().load();
    useStore.getState().setVoice("com.apple.voice.samantha");
    useStore.getState().setRate(1.5);
    useStore.getState().setAutoSpeak(false);
    await new Promise((r) => setTimeout(r, 0));

    const useStore2 = createVoiceStore(storage);
    await useStore2.getState().load();
    const s = useStore2.getState();
    assert.equal(s.voiceId, "com.apple.voice.samantha");
    assert.equal(s.rate, 1.5);
    assert.equal(s.autoSpeak, false);
    assert.ok(storage.data[VOICE_KEY].includes("samantha"));
  });

  it("clamps rate/pitch into range", async () => {
    const useStore = createVoiceStore(storage);
    await useStore.getState().load();
    useStore.getState().setRate(99);
    useStore.getState().setPitch(-3);
    assert.equal(useStore.getState().rate, 2.0);
    assert.equal(useStore.getState().pitch, 0.5);
  });

  it("falls back to defaults on corrupt payload", async () => {
    const bad = createVoiceStore(memoryStorage({ [VOICE_KEY]: "{bad" }));
    await bad.getState().load();
    assert.equal(bad.getState().autoSpeak, true);
    assert.equal(bad.getState().rate, 1.0);
  });
});
