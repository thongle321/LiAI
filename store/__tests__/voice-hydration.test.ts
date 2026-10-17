/** Voice store hydration (Jest).
 *
 * D3-4: `deviceMeetsMemory` is computed DURING hydration, so an unhydrated
 * store reported no TTS on every cold start — the voice chip stayed hidden,
 * `canSpeak` was false and auto-speak never fired. Worse, a setter fired
 * before hydration serialised the DEFAULTS (`{currentVoice: null, …}`) over
 * the user's saved voice.
 *
 * These pin the two halves of the fix: the store hydrates in one read, and it
 * refuses to persist until it has.
 */

import { createVoiceStore, VOICE_KEY } from "../voice";
import { memoryStorage } from "@/jest/storage";
import { DEVICE_DEFAULT_VOICE } from "@/services/tts/types";

describe("voice store hydration (D3-4)", () => {
  /** A saved voice from an earlier session, on disk. `sanitizeVoice`
   *  collapses every `system` voice to the device default (Q9 — OS voices are
   *  never pinned), so the persisted id is asserted as the default, not as a
   *  literal. What the test pins is that the SAVED values come back at all. */
  const SAVED = JSON.stringify({
    currentVoice: { engine: "system", id: "some-os-voice" },
    autoSpeak: true,
    userTTSOverride: true,
  });

  it("reads the saved prefs on a cold start", async () => {
    const useStore = createVoiceStore(memoryStorage({ [VOICE_KEY]: SAVED }));

    await useStore.getState().load();

    const s = useStore.getState();
    // Unhydrated these read as null/false, which is what hid the chip and
    // silenced auto-speak on a cold start.
    expect(s.autoSpeak).toBe(true);
    expect(s.userTTSOverride).toBe(true);
    expect(s.currentVoice).toEqual(DEVICE_DEFAULT_VOICE);
    expect(s.loaded).toBe(true);
  });

  it("keeps `currentVoice: null` when nothing was ever chosen", async () => {
    const useStore = createVoiceStore(memoryStorage());

    await useStore.getState().load();

    // null means "never chosen" by convention — NOT a voice the reconcile
    // should invent.
    expect(useStore.getState().currentVoice).toBeNull();
    expect(useStore.getState().loaded).toBe(true);
  });

  it("concurrent loaders share one read (single-flight)", async () => {
    const kv = memoryStorage({ [VOICE_KEY]: SAVED });
    const useStore = createVoiceStore(kv);

    await Promise.all([
      useStore.getState().load(),
      useStore.getState().load(),
      useStore.getState().load(),
    ]);

    expect(kv.reads.filter((k) => k === VOICE_KEY)).toHaveLength(1);
  });

  it("a later load reads nothing and keeps live state", async () => {
    const kv = memoryStorage({ [VOICE_KEY]: SAVED });
    const useStore = createVoiceStore(kv);

    await useStore.getState().load();
    useStore.getState().setAutoSpeak(false);

    await useStore.getState().load();

    expect(kv.reads.filter((k) => k === VOICE_KEY)).toHaveLength(1);
    // The re-read must not resurrect the flag the user just turned off.
    expect(useStore.getState().autoSpeak).toBe(false);
  });

  it("refuses to persist a setter fired before hydration (D3-4)", async () => {
    const kv = memoryStorage({ [VOICE_KEY]: SAVED });
    const useStore = createVoiceStore(kv);

    // The chip toggling auto-speak before `load()` resolved: the in-memory
    // set still happens, but it must not reach disk.
    useStore.getState().setAutoSpeak(false);
    await Promise.resolve();
    expect(kv.data[VOICE_KEY]).toBe(SAVED);

    await useStore.getState().load();
    await Promise.resolve();

    // The saved voice survived hydration: no write carried the nulls over it.
    expect(JSON.parse(kv.data[VOICE_KEY]).autoSpeak).toBe(true);
  });

  it("persists normally once hydrated", async () => {
    const kv = memoryStorage({ [VOICE_KEY]: SAVED });
    const useStore = createVoiceStore(kv);

    await useStore.getState().load();
    useStore.getState().setAutoSpeak(false);
    await Promise.resolve();

    expect(JSON.parse(kv.data[VOICE_KEY]).autoSpeak).toBe(false);
  });
});