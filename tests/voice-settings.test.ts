/** Voice settings store tests. Run: node --test tests/voice-settings.test.ts */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { createVoiceStore, VOICE_KEY } from "../store/voice.ts";
import type { KeyValueStorage } from "../lib/storage.ts";
import type { Voice } from "../lib/tts/types.ts";

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

const BELLA: Voice = { id: "af_bella", name: "Bella", engine: "kitten" };

describe("voice store", () => {
  let storage: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it("defaults to the system voice with auto-speak on", async () => {
    const useStore = createVoiceStore(storage);
    await useStore.getState().load();
    const s = useStore.getState();
    assert.equal(s.currentVoice, null, "null voice means the fixed system default");
    assert.equal(s.autoSpeak, true);
    assert.equal(s.supertonicSteps, 5);
    assert.equal(s.supertonicLanguage, "na");
    assert.equal(s.userTTSOverride, null);
  });

  it("persists and restores the voice and auto-speak", async () => {
    const useStore = createVoiceStore(storage);
    await useStore.getState().load();
    useStore.getState().setVoice(BELLA);
    useStore.getState().setAutoSpeak(false);
    await new Promise((r) => setTimeout(r, 0));

    const useStore2 = createVoiceStore(storage);
    await useStore2.getState().load();
    assert.deepEqual(useStore2.getState().currentVoice, BELLA);
    assert.equal(useStore2.getState().autoSpeak, false);
    assert.ok(storage.data[VOICE_KEY].includes("af_bella"));
  });

  it("rejects a persisted voice with an unknown engine", async () => {
    const store = createVoiceStore(
      memoryStorage({ [VOICE_KEY]: JSON.stringify({ currentVoice: { id: "x", name: "X", engine: "hal9000" } }) }),
    );
    await store.getState().load();
    assert.equal(store.getState().currentVoice, null);
  });

  it("guards the Supertonic step enum against a hand-edited blob", async () => {
    const store = createVoiceStore(
      memoryStorage({ [VOICE_KEY]: JSON.stringify({ supertonicSteps: 4 }) }),
    );
    await store.getState().load();
    assert.equal(store.getState().supertonicSteps, 5, "4 is not an offered step");
  });

  it("falls back to defaults on corrupt payload", async () => {
    const bad = createVoiceStore(memoryStorage({ [VOICE_KEY]: "{bad" }));
    await bad.getState().load();
    assert.equal(bad.getState().autoSpeak, true);
    assert.equal(bad.getState().supertonicSteps, 5);
  });

  it("ignores the v1 blob entirely (clean break)", async () => {
    const store = createVoiceStore(
      memoryStorage({ liai_voice_v1: JSON.stringify({ voiceId: "com.apple.voice.samantha", rate: 2 }) }),
    );
    await store.getState().load();
    assert.equal(store.getState().currentVoice, null, "old blob must not resurrect a v1 voice");
  });

  it("reports every auto-speak flip to the injected hook", async () => {
    const seen: boolean[] = [];
    const store = createVoiceStore(storage, (enabled) => seen.push(enabled));
    await store.getState().load();
    store.getState().setAutoSpeak(false);
    store.getState().setAutoSpeak(true);
    assert.deepEqual(seen, [false, true]);
  });
});