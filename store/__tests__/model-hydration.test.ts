/** Model hydration is single-flight, and says when it has finished.
 *
 * `loadPersisted()` used to be unguarded, and four screens call it on mount
 * (the startup gate, Models, onboarding's model step, the token settings
 * card). Each call re-read nine KV keys plus SecureStore, replaced the
 * in-memory `models` array with the persisted snapshot — clobbering any live
 * `setModelProgress` values — and re-ran the native download reconcile. These
 * lock the guard and the flag the app's startup gate waits on.
 *
 * Storage is faked at the module boundary so the count is exact and no native
 * module is touched.
 */

import { useModelStore } from "../modelStore";
import { asyncStorage } from "../models/storage";

/** Reads issued by the hydration call, counted per key. */
const mockReads: string[] = [];

jest.mock("../models/storage", () => {
  const actual = jest.requireActual("../models/storage");
  return {
    ...actual,
    asyncStorage: {
      getItem: jest.fn(async (key: string) => {
        mockReads.push(key);
        return null;
      }),
      setItem: jest.fn(async () => undefined),
      removeItem: jest.fn(async () => undefined),
    },
    // SecureStore is reached by a DYNAMIC import, which Jest's CommonJS
    // runtime cannot resolve; the real readSecret catches that and warns once
    // per call. Stub it so the secret read is a counted no-op rather than log
    // noise that reads like a failure.
    readSecret: jest.fn(async () => null),
    writeSecret: jest.fn(async () => undefined),
  };
});

jest.mock("../../services/downloads/download-service", () => ({
  platformDownloadService: {
    reconcileWithNative: jest.fn(async () => []),
    getAllJobs: jest.fn(() => []),
  },
}));

/** The store is a singleton, so each test starts from the cold state the
 * guard keys off: un-hydrated, with the read counter cleared. */
function resetHydration() {
  mockReads.length = 0;
  useModelStore.setState({ hydrated: false });
}

describe("model hydration", () => {
  beforeEach(resetHydration);

  it("four screens mounting at once share a single read", async () => {
    const load = useModelStore.getState().loadPersisted;

    await Promise.all([load(), load(), load(), load()]);

    // One pass over the nine metadata keys, not four.
    expect(new Set(mockReads).size).toEqual(9);
    expect(mockReads.length).toEqual(9);
  });

  it("reports hydrated so the startup gate can stop holding the splash", async () => {
    expect(useModelStore.getState().hydrated).toEqual(false);
    await useModelStore.getState().loadPersisted();
    expect(useModelStore.getState().hydrated).toEqual(true);
  });

  it("a later load reads nothing, because the store already holds the catalog", async () => {
    await useModelStore.getState().loadPersisted();
    const afterFirst = mockReads.length;

    await useModelStore.getState().loadPersisted();
    await useModelStore.getState().loadPersisted();

    expect(afterFirst).toEqual(9);
    expect(mockReads.length).toEqual(9);
  });

  it("stays hydrated when a read fails, so a cold start cannot hang forever", async () => {
    // The store logs the failure itself; silence it here so the suite's
    // console stays clean and a real warning elsewhere would stand out.
    const quiet = jest.spyOn(console, "warn").mockImplementation(() => {});
    const boom = jest
      .spyOn(asyncStorage, "getItem")
      .mockRejectedValue(new Error("storage unavailable"));

    await expect(useModelStore.getState().loadPersisted()).resolves.toBeUndefined();

    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();

    // The splash is released and the catalog is empty — a state the user can
    // fix from Models — rather than the gate waiting forever.
    expect(useModelStore.getState().hydrated).toEqual(true);
    boom.mockRestore();
  });
});