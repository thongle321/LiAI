/** Model hydration is single-flight, and says when it has finished.
 *
 * `loadPersisted()` used to be unguarded, and four screens call it on mount
 * (the startup gate, Models, onboarding's model step, the token settings
 * card). Each call re-read the KV storage, replaced the in-memory `models`
 * array with the persisted snapshot — clobbering any live
 * `setModelProgress` values — and re-ran the native download reconcile.
 * These lock the guard and the flag the app's startup gate waits on.
 *
 * Storage is injected, so the count is exact and no native module is
 * touched. The exact number of keys is an implementation detail: what
 * matters is that four callers share ONE pass over the storage.
 */

import { memoryStorage } from "@/jest/storage";
import { createModelStore } from "../models";

jest.mock("../models/storage", () => {
  const actual = jest.requireActual("../models/storage");
  return {
    ...actual,
    // SecureStore is reached by a DYNAMIC import, which Jest's CommonJS
    // runtime cannot resolve; the real readSecret catches that and warns
    // once per call. Stub it so the secret read is a quiet no-op.
    readSecret: jest.fn(async () => null),
    writeSecret: jest.fn(async () => undefined),
    deleteSecret: jest.fn(async () => undefined),
  };
});

jest.mock("@/services/downloads/download-service", () => ({
  platformDownloadService: {
    reconcileWithNative: jest.fn(async () => []),
    getAllJobs: jest.fn(() => []),
  },
}));

jest.mock("@/services/models/huggingface.ts", () => ({
  getPresets: jest.fn(async () => []),
  searchModels: jest.fn(async () => ({ results: [], nextPageLink: null })),
  getModelFiles: jest.fn(async () => []),
  buildHfModelSpec: jest.fn(),
  HfError: class HfError extends Error {},
}));

/** A store over a fake storage, so the reads can be counted. */
function makeStore() {
  const storage = memoryStorage();
  const store = createModelStore(storage);
  return { storage, store };
}

describe("model hydration", () => {
  it("four screens mounting at once share a single pass over the storage", async () => {
    const single = makeStore();
    await single.store.getState().loadPersisted();
    const onePass = single.storage.reads.length;

    const concurrent = makeStore();
    const load = concurrent.store.getState().loadPersisted;

    await Promise.all([load(), load(), load(), load()]);

    // Four callers, one pass: not four.
    expect(concurrent.storage.reads.length).toEqual(onePass);
  });

  it("reports hydrated so the startup gate can stop holding the splash", async () => {
    const { store } = makeStore();
    expect(store.getState().hydrated).toEqual(false);
    await store.getState().loadPersisted();
    expect(store.getState().hydrated).toEqual(true);
  });

  it("a later load reads nothing, because the store already holds the catalog", async () => {
    const { storage, store } = makeStore();
    await store.getState().loadPersisted();
    const afterFirst = storage.reads.length;

    await store.getState().loadPersisted();
    await store.getState().loadPersisted();

    expect(storage.reads.length).toEqual(afterFirst);
  });

  it("stays hydrated when a read fails, so a cold start cannot hang forever", async () => {
    // The store logs the failure itself; silence it here so the suite's
    // console stays clean and a real warning elsewhere would stand out.
    const quiet = jest.spyOn(console, "warn").mockImplementation(() => {});
    const { storage, store } = makeStore();
    const boom = jest
      .spyOn(storage, "getItem")
      .mockRejectedValue(new Error("storage unavailable"));

    await expect(store.getState().loadPersisted()).resolves.toBeUndefined();

    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();

    // The splash is released and the catalog is empty — a state the user can
    // fix from Models — rather than the gate waiting forever.
    expect(store.getState().hydrated).toEqual(true);
    boom.mockRestore();
  });
});
