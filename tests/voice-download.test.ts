/** Voice store download actions (ticket 04).
 * Run: node --test tests/voice-download.test.ts
 *
 * In node the sherpa download manager is absent, so starting a download
 * rejects and that engine's entry stays as-was — the adapter contract the
 * engine cards render from (lib/tts/voiceUi.ts).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createVoiceStore, EMPTY_DOWNLOADS } from "../store/voice.ts";
import { ENGINE_ORDER } from "../lib/tts/engineMeta.ts";
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
  it("starts UNKNOWN for every engine, not 'not installed'", async () => {
    const store = createVoiceStore(memoryStorage());
    await store.getState().load();
    // node has no native module, so nothing was read — and an unread state
    // must not read as "vanished" to reconcileVoice.
    assert.deepEqual(store.getState().downloads, EMPTY_DOWNLOADS);
  });

  it("gives every downloadable engine a download entry", () => {
    assert.deepEqual(Object.keys(EMPTY_DOWNLOADS).sort(), [...ENGINE_ORDER].sort());
  });

  it("startEngineDownload rejects without a native module and leaves the map", async () => {
    const store = createVoiceStore(memoryStorage());
    await store.getState().load();
    for (const engine of ENGINE_ORDER) {
      await assert.rejects(store.getState().startEngineDownload(engine));
    }
    assert.deepEqual(store.getState().downloads, EMPTY_DOWNLOADS);
  });

  it("cancelEngineDownload is a safe no-op when idle", async () => {
    const store = createVoiceStore(memoryStorage());
    await store.getState().load();
    store.getState().cancelEngineDownload();
    assert.deepEqual(store.getState().downloads, EMPTY_DOWNLOADS);
  });
});