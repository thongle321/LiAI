/** The reconcile pass owes the pair the same one-bar account.
 *
 * A paired (vision) row killed at the finish line heals through
 * `reconcileInterrupted`, not the live subscription — and that heal used to
 * write the LLM's single-leg account (1000) onto a row whose bar promises
 * the pair (1400). The one-bar contract covers this write too.
 *
 * Seam (agreed): the reconcile interrupt-through-fake-disk harness
 * (downloads.part-resume.test.ts's shape), asserting the healed row's
 * visible account. MISSes: the live-transfer writes (pinned in
 * downloads.pair-progress.test.ts).
 */

import type { ModelSpec } from "@/types/models";
import { memoryStorage } from "@/jest/storage";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { createModelStore } from "../index";

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

const MAIN_BYTES = 1_000;
const PROJECTOR_BYTES = 400;

function pairedRow(): ModelSpec {
  return {
    id: "vision-1",
    name: "Vision 1",
    author: "Author",
    description: "",
    origin: "huggingface",
    type: "llm",
    files: [
      {
        name: "vision.gguf",
        size: MAIN_BYTES,
        downloadUrl: "https://x/vision.gguf",
      },
    ],
    projector: {
      name: "mmproj-vision.gguf",
      size: PROJECTOR_BYTES,
      downloadUrl: "https://x/mmproj-vision.gguf",
    },
    downloadStatus: "failed",
    downloadProgress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
  };
}

describe("reconcileInterrupted for a paired row", () => {
  it("a whole LLM on disk heals to the PAIR's account", async () => {
    (LegacyFileSystem.getInfoAsync as jest.Mock).mockImplementation(
      async (path: string) =>
        path === "file:///documents/models/vision.gguf"
          ? { exists: true, size: MAIN_BYTES }
          : { exists: false },
    );
    const store = createModelStore(memoryStorage());
    await store.getState().loadPersisted();
    store.setState({ models: [pairedRow()] });

    await store.getState().reconcileInterrupted();

    const row = store.getState().getModel("vision-1")!;
    expect(row.downloadStatus).toBe("completed");
    expect(row.downloadedBytes).toBe(MAIN_BYTES + PROJECTOR_BYTES);
    expect(row.totalBytes).toBe(MAIN_BYTES + PROJECTOR_BYTES);
  });
});
