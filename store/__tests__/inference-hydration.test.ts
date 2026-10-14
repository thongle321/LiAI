const assert: any = {
  ok: (v: unknown, msg?: string) => expect(v).toBeTruthy(),
  equal: (a: unknown, b: unknown, msg?: string) => expect(a).toEqual(b),
  deepEqual: (a: unknown, b: unknown, msg?: string) => expect(a).toEqual(b),
  strictEqual: (a: unknown, b: unknown, msg?: string) => expect(a).toBe(b),
  notEqual: (a: unknown, b: unknown, msg?: string) => expect(a).not.toEqual(b),
  notDeepEqual: (a: unknown, b: unknown, msg?: string) => expect(a).not.toEqual(b),
  match: (value: string, re: RegExp | string, msg?: string) => expect(value).toMatch(re as any),
  doesNotMatch: (value: string, re: RegExp | string, msg?: string) => expect(value).not.toMatch(re as any),
  throws: (fn: () => void, re?: RegExp | string, msg?: string) => expect(fn).toThrow(re as any),
  doesNotThrow: (fn: () => void, msg?: string) => expect(fn).not.toThrow(),
  rejects: async (input: any, expected?: any, msg?: string) => {
    const p = typeof input === "function" ? input() : input;
    let err: unknown;
    try {
      await p;
    } catch (e) {
      err = e;
    }
    if (err === undefined) {
      throw new Error("Expected promise to reject, but it resolved");
    }
    if (expected === undefined) return;
    if (typeof expected === "function") {
      if (expected.prototype) {
        if (!(err instanceof expected)) {
          throw new Error(msg ?? "rejected value not instance of expected constructor");
        }
      } else if (!expected(err)) {
        throw new Error(msg ?? "rejected value did not satisfy validator");
      }
    } else if (expected instanceof RegExp) {
      if (!expected.test(String((err as Error)?.message ?? err))) {
        throw new Error(msg ?? "rejected message did not match");
      }
    } else if (typeof expected === "string") {
      if (!String((err as Error)?.message ?? err).includes(expected)) {
        throw new Error(msg ?? "rejected message did not include expected text");
      }
    } else if (expected instanceof Error) {
      if (((err as Error)?.message ?? String(err)) !== expected.message) {
        throw new Error(msg ?? "rejected message did not match");
      }
    }
  },
};

/** Hydration is single-flight. Run: node --test tests/inference-hydration.test.ts
 *
 * The settings screen mounts three cards (Model Initialization, Memory, Model
 * Loading) and each one calls `load()` in its own effect on open. `load()` was
 * unguarded, so opening Settings did the same AsyncStorage read and parse three
 * times — and a read that resolved after the user changed a setting wrote the
 * stored value back over their change. These lock the fix.
 */


import { createInferenceStore, INFERENCE_KEY } from "../inference";
import type { KeyValueStorage } from "../../lib/storage";

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
    const storage = countingStorage({ [INFERENCE_KEY]: JSON.stringify({ nCtx: 8192 }) });
    const useStore = createInferenceStore(storage);

    await Promise.all([
      useStore.getState().load(),
      useStore.getState().load(),
      useStore.getState().load(),
    ]);

    assert.equal(
      storage.reads,
      1,
      "concurrent load() calls must share one read, not each fetch",
    );
    assert.equal(useStore.getState().nCtx, 8192, "the shared read still hydrates");
  });

  it("a later load reads nothing, because the store already holds the values", async () => {
    const storage = countingStorage();
    const useStore = createInferenceStore(storage);

    await useStore.getState().load();
    const afterFirst = storage.reads;

    await useStore.getState().load();
    await useStore.getState().load();

    assert.equal(afterFirst, 1);
    assert.equal(storage.reads, 1, "hydrated state needs no further reads");
  });

  it("a change made after hydration is not undone by a later load", async () => {
    // The data-loss case: a read resolving late used to write the stored value
    // back over the user's change.
    const storage = countingStorage({ [INFERENCE_KEY]: JSON.stringify({ nCtx: 4096 }) });
    const useStore = createInferenceStore(storage);

    await useStore.getState().load();
    useStore.getState().setNCtx(16384);
    assert.equal(useStore.getState().nCtx, 16384);

    await useStore.getState().load();
    assert.equal(
      useStore.getState().nCtx,
      16384,
      "a redundant load must not clobber the value the user just set",
    );
  });

  it("a failed read does not poison later attempts", async () => {
    // `hydrating` is cleared in a finally, so a transient storage failure is
    // retryable instead of pinning the store to defaults forever.
    const storage = countingStorage({ [INFERENCE_KEY]: JSON.stringify({ nCtx: 8192 }) }, 1);
    const useStore = createInferenceStore(storage);

    await assert.rejects(() => useStore.getState().load());
    assert.equal(useStore.getState().loaded, false, "a failed read does not claim loaded");

    await useStore.getState().load();
    assert.equal(useStore.getState().loaded, true, "the retry hydrates");
    assert.equal(useStore.getState().nCtx, 8192);
  });
});
