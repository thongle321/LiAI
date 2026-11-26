/** Model file path guards (PocketPal pathGuard parity #1012).
 *
 *  Model `name` fields arrive from imported catalogs and downloads the
 *  user started. A hostile name like `../../etc/passwd` must never be
 *  resolved into a delete, a copy destination, or a load path outside the
 *  models directory. Guarded deletes skip silently (the row still goes);
 *  a guarded copy refuses to run.
 */

import type { ModelSpec } from "@/types/models";
import { memoryStorage } from "@/jest/storage";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { createModelStore } from "../index";

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///documents/",
  getInfoAsync: jest.fn(async () => ({ exists: true, uri: "file:///documents/models/", isDirectory: true })),
  deleteAsync: jest.fn(async () => undefined),
  copyAsync: jest.fn(async () => undefined),
  makeDirectoryAsync: jest.fn(async () => undefined),
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
    files: [{ name: "model.gguf", size: 1, downloadUrl: "https://x/model.gguf" }],
    downloadStatus: "completed",
    downloadProgress: 100,
    downloadedBytes: 1,
    totalBytes: 1,
    ...overrides,
  };
}

const deleteAsync = LegacyFileSystem.deleteAsync as jest.Mock;
const copyAsync = LegacyFileSystem.copyAsync as jest.Mock;

async function storeWithRow(...rows: ModelSpec[]) {
  const storage = memoryStorage();
  const store = createModelStore(storage);
  await store.getState().loadPersisted();
  store.setState({ models: rows });
  deleteAsync.mockClear();
  copyAsync.mockClear();
  return store;
}

describe("removeModel path guard", () => {
  it("deletes a normal model file", async () => {
    const store = await storeWithRow(spec({ files: [{ name: "model.gguf", size: 1, downloadUrl: "https://x/model.gguf" }] }));
    await store.getState().removeModel("model-1");
    const deleted = deleteAsync.mock.calls.map(([p]) => p as string);
    expect(deleted).toContain("file:///documents/models/model.gguf");
    expect(store.getState().getModel("model-1")).toBeUndefined();
  });

  it("never resolves a traversal model name", async () => {
    const store = await storeWithRow(spec({ files: [{ name: "../../etc/passwd", size: 1, downloadUrl: "https://x" }] }));
    await store.getState().removeModel("model-1");
    expect(deleteAsync).not.toHaveBeenCalled();
    // The row still goes: refusing the delete must not strand the entry.
    expect(store.getState().getModel("model-1")).toBeUndefined();
  });
});

describe("addLocalModel path guard", () => {
  it("refuses a traversal file name before copying", async () => {
    const store = await storeWithRow();
    await expect(
      store.getState().addLocalModel("file:///cache/picked", "../../evil.gguf", 10),
    ).rejects.toThrow();
    expect(copyAsync).not.toHaveBeenCalled();
  });

  it("copies a normal local import into models/local/", async () => {
    const store = await storeWithRow();
    await store.getState().addLocalModel("file:///cache/picked", "my model.gguf", 10);
    const dest = (copyAsync.mock.calls[0][0] as { to: string }).to;
    expect(dest).toBe("file:///documents/models/local/my model.gguf");
  });
});

describe("detachProjector path guard", () => {
  it("never resolves a traversal projector name", async () => {
    const store = await storeWithRow(
      spec({
        projector: { name: "../../etc/passwd", size: 1, downloadUrl: "https://x" },
        version: undefined as never,
      } as unknown as Partial<ModelSpec>),
    );
    await store.getState().detachProjector("model-1");
    expect(deleteAsync).not.toHaveBeenCalled();
  });
});
