/** `.part` staging on the resume seams (ticket 05).
 *
 * The native worker parks in-flight bytes at `<file>.part` and renames the
 * finished download into place, so the JS resume reads must classify a
 * `.part` file as a paused (resumable) download while a final file at the
 * catalog size is completed. The final-path-only reads here used to be the
 * exact reversal risk the audit flagged: a part would look like nothing on
 * disk and a re-download would restart from zero.
 */

import type { ModelSpec } from "@/types/models";
import { memoryStorage } from "@/jest/storage";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { createModelStore } from "../index";

// expo-file-system/legacy loads a dynamic import that jest's CJS runtime
// cannot execute — stat everything through the mock below instead.
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  deleteAsync: jest.fn(async () => undefined),
}));

jest.mock("@/services/downloads/download-service", () => ({
  platformDownloadService: {
    reconcileWithNative: jest.fn(async () => []),
    getAllJobs: jest.fn(() => []),
  },
}));

jest.mock("@/services/models/huggingface", () => ({
  getPresets: jest.fn(async () => []),
  searchModels: jest.fn(async () => ({ results: [], nextPageLink: null })),
  getModelFiles: jest.fn(async () => []),
  buildHfModelSpec: jest.fn(),
  buildPresetModelSpec: jest.fn(),
  HfError: class HfError extends Error {},
}));

jest.mock("@/services/models/gguf-header", () => ({
  readGgufMetadata: jest.fn(async () => null),
}));

function spec(overrides: Partial<ModelSpec> = {}): ModelSpec {
  return {
    id: "model-1",
    name: "Model",
    author: "Author",
    description: "",
    origin: "huggingface",
    type: "llm",
    files: [
      {
        name: "model.gguf",
        size: 1_000,
        downloadUrl: "https://x/model.gguf",
      },
    ],
    downloadStatus: "failed",
    downloadProgress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    ...overrides,
  };
}

type StatResult = {
  exists: boolean;
  size?: number;
};

/** Disk state for the test: map path → stat result. */
function diskWith(files: Record<string, StatResult>) {
  (LegacyFileSystem.getInfoAsync as jest.Mock).mockImplementation(async (path: string) => {
    const hit = files[path];
    // `hit?.exists`, not `hit`: an explicit {exists: false} entry is still a
    // mapped answer ("there is no file here"), not a hit.
    return hit?.exists ? { exists: true, size: hit.size } : { exists: false };
  });
  (LegacyFileSystem.deleteAsync as jest.Mock).mockClear();
  return LegacyFileSystem.deleteAsync as jest.Mock;
}

async function storeWithRow(row: ModelSpec) {
  const storage = memoryStorage();
  const store = createModelStore(storage);
  await store.getState().loadPersisted();
  store.setState({ models: [row] });
  return store;
}

describe("reconcileInterrupted with .part staging", () => {
  it("a final file at the catalog size completes the row", async () => {
    diskWith({ "file:///documents/models/model.gguf": { exists: true, size: 1_000 } });
    const store = await storeWithRow(spec());

    await store.getState().reconcileInterrupted();

    const row = store.getState().getModel("model-1")!;
    expect(row.downloadStatus).toBe("completed");
    expect(row.downloadedBytes).toBe(1_000);
    expect(row.localPath).toBe("file:///documents/models/model.gguf");
  });

  it("a .part file classifies as paused with resumable bytes", async () => {
    diskWith({
      "file:///documents/models/model.gguf": { exists: false },
      "file:///documents/models/model.gguf.part": { exists: true, size: 400 },
    });
    const store = await storeWithRow(spec());

    await store.getState().reconcileInterrupted();

    const row = store.getState().getModel("model-1")!;
    expect(row.downloadStatus).toBe("paused");
    expect(row.downloadedBytes).toBe(400);
    expect(row.downloadProgress).toBe(40);
    expect(row.error).toBeUndefined();
  });

  it("a corrupt part (over catalog size) is deleted and resets the row", async () => {
    const deleteAsync = diskWith({
      "file:///documents/models/model.gguf": { exists: false },
      "file:///documents/models/model.gguf.part": { exists: true, size: 2_000 },
    });
    const store = await storeWithRow(spec());

    await store.getState().reconcileInterrupted();

    const row = store.getState().getModel("model-1")!;
    expect(row.downloadStatus).toBe("idle");
    expect(row.error).toBeTruthy();
    expect(deleteAsync).toHaveBeenCalledWith(
      "file:///documents/models/model.gguf.part",
      { idempotent: true },
    );
  });
});
