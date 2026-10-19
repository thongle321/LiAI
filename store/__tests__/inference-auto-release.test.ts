/** The auto-release flag is persisted with the inference params.
 *
 * The flag is the only thing that survives the process death between
 * backgrounding and the next launch: without it on disk the warm-up has
 * nothing to warm. These lock the round-trip and the shape of the value.
 */

import { createInferenceStore, INFERENCE_KEY } from "../inference";
import type { KeyValueStorage } from "@/services/storage/storage";

function memoryStorage(seed: Record<string, string> = {}): KeyValueStorage & {
  data: Record<string, string>;
} {
  const data = { ...seed };
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

describe("the auto-released model id", () => {
  it("round-trips through persistence", async () => {
    const storage = memoryStorage();
    const useStore = createInferenceStore(storage);

    useStore.getState().setAutoReleasedModelId("hf-model-1");
    await Promise.resolve();

    const reopened = createInferenceStore(storage);
    await reopened.getState().load();

    expect(reopened.getState().autoReleasedModelId).toEqual("hf-model-1");
  });

  it("defaults to null when the stored payload has no such field", async () => {
    const storage = memoryStorage({
      [INFERENCE_KEY]: JSON.stringify({ nCtx: 8192 }),
    });
    const useStore = createInferenceStore(storage);

    await useStore.getState().load();

    expect(useStore.getState().autoReleasedModelId).toBeNull();
  });

  it("ignores a corrupt value instead of storing it", async () => {
    const storage = memoryStorage({
      [INFERENCE_KEY]: JSON.stringify({ autoReleasedModelId: 42 }),
    });
    const useStore = createInferenceStore(storage);

    await useStore.getState().load();

    expect(useStore.getState().autoReleasedModelId).toBeNull();
  });

  it("clears back to null", async () => {
    const storage = memoryStorage();
    const useStore = createInferenceStore(storage);

    useStore.getState().setAutoReleasedModelId("hf-model-1");
    useStore.getState().setAutoReleasedModelId(null);
    await Promise.resolve();

    const reopened = createInferenceStore(storage);
    await reopened.getState().load();

    expect(reopened.getState().autoReleasedModelId).toBeNull();
  });
});
