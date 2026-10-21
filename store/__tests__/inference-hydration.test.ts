
/** Hydration is single-flight.
 *
 * The settings screen mounts three cards (Model Initialization, Memory, Model
 * Loading) and each one calls `load()` in its own effect on open. `load()` was
 * unguarded, so opening Settings did the same AsyncStorage read and parse three
 * times — and a read that resolved after the user changed a setting wrote the
 * stored value back over their change. These lock the fix.
 */


import { createInferenceStore, INFERENCE_KEY } from "../inference";
import type { KeyValueStorage } from "@/services/storage/storage";

interface CountingStorage extends KeyValueStorage {
  data: Record<string, string>;
  reads: number;
}

/** Counts reads, and can be made to fail so a retry can be observed. */
function countingStorage(
  seed: Record<string, string> = {},
  failTimes = 0,
): CountingStorage {
  const data: Record<string, string> = { ...seed };
  const s: CountingStorage = {
    data,
    reads: 0,
    getItem: async (k: string) => {
      s.reads += 1;
      if (s.reads <= failTimes) throw new Error("storage unavailable");
      return data[k] ?? null;
    },
    setItem: async (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: async (k: string) => {
      delete data[k];
    },
  };
  return s;
}

describe("inference hydration", () => {
  it("three cards mounting at once share a single read", async () => {
    // Exactly what app/(drawer)/settings.tsx does: three components, three
    // load() calls, one mount.
    const storage = countingStorage({ [INFERENCE_KEY]: JSON.stringify({ state: { nCtx: 8192 }, version: 0 }) });
    const useStore = createInferenceStore(storage);

    await Promise.all([
      useStore.getState().load(),
      useStore.getState().load(),
      useStore.getState().load(),
    ]);

    expect(storage.reads).toEqual(1);
    expect(useStore.getState().nCtx).toEqual(8192);
  });

  it("a later load reads nothing, because the store already holds the values", async () => {
    const storage = countingStorage();
    const useStore = createInferenceStore(storage);

    await useStore.getState().load();
    const afterFirst = storage.reads;

    await useStore.getState().load();
    await useStore.getState().load();

    expect(afterFirst).toEqual(1);
    expect(storage.reads).toEqual(1);
  });

  it("a change made after hydration is not undone by a later load", async () => {
    // The data-loss case: a read resolving late used to write the stored value
    // back over the user's change.
    const storage = countingStorage({ [INFERENCE_KEY]: JSON.stringify({ state: { nCtx: 4096 }, version: 0 }) });
    const useStore = createInferenceStore(storage);

    await useStore.getState().load();
    useStore.getState().setNCtx(16384);
    expect(useStore.getState().nCtx).toEqual(16384);

    await useStore.getState().load();
    expect(useStore.getState().nCtx).toEqual(16384);
  });

  it("a failed read does not poison later attempts", async () => {
    // `hydrating` is cleared in a finally, so a transient storage failure is
    // retryable instead of pinning the store to defaults forever.
    const storage = countingStorage({ [INFERENCE_KEY]: JSON.stringify({ state: { nCtx: 8192 }, version: 0 }) }, 1);
    const useStore = createInferenceStore(storage);

    await useStore.getState().load();
    expect(useStore.getState().loaded).toEqual(false);

    await useStore.getState().load();
    expect(useStore.getState().loaded).toEqual(true);
    expect(useStore.getState().nCtx).toEqual(8192);
  });
});
