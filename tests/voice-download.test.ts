/** Voice store download actions (ticket 04).
 * Run: node --test tests/voice-download.test.ts
 *
 * In node the sherpa download manager is absent, so starting a download
 * rejects and the triplet stays as-was — the adapter contract the Kokoro
 * group renders from (lib/tts/voiceUi.ts).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createVoiceStore } from "../store/voice.ts";
import type { KeyValueStorage } from "../lib/storage.ts";

function memoryStorage(): KeyValueStorage {
  const data: Record<string, string> = {};
  return {
    getItem: async (k: string) => data[k] ?? null,
    setItem: async (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: async (k: string) => {
      delete data[k];
    },
  };
}

describe("voice store download actions", () => {
  it("startKokoroDownload rejects without a native module and leaves the triplet", async () => {
    const store = createVoiceStore(memoryStorage());
    await store.getState().load();
    assert.equal(store.getState().download, null);
    await assert.rejects(store.getState().startKokoroDownload());
    assert.equal(store.getState().download, null);
  });

  it("cancelKokoroDownload is a safe no-op when idle", async () => {
    const store = createVoiceStore(memoryStorage());
    await store.getState().load();
    store.getState().cancelKokoroDownload();
    assert.equal(store.getState().download, null);
  });
});
