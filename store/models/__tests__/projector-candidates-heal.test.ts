/** Heal a downloaded vision spec whose projector candidates never landed.
 *
 *  The user's already-downloaded model (LiquidAI/LFM2.5-VL-450M-GGUF) was
 *  imported by the old blind path: the spec claims vision (the repo's
 *  tags say so) but records neither `projector` nor `projectorCandidates`,
 *  so the details card hides the projection section and the mmproj gate
 *  answers "model not supported" — with no UI anywhere to fix it. The
 *  heal re-fetches the repo's file listing (the one call the picker
 *  already makes) and records what the repo actually ships: the
 *  candidates for the selector, plus the pairing rule's answer as the
 *  projector. Downloading the projector stays the card's existing
 *  "Download projection model" action; the heal only repairs the record.
 */

import type { ModelSpec, HFModelFile } from "@/types/models";
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
  ...jest.requireActual("@/services/models/huggingface"),
  getModelFiles: jest.fn(async () => [
    {
      name: "LFM2.5-VL-450M-Q8_0.gguf",
      size: 450_000_000,
      path: "LFM2.5-VL-450M-Q8_0.gguf",
      downloadUrl:
        "https://huggingface.co/LiquidAI/LFM2.5-VL-450M-GGUF/resolve/main/LFM2.5-VL-450M-Q8_0.gguf",
    },
    {
      name: "mmproj-LFM2.5-VL-450m-F16.gguf",
      size: 98_000_000,
      path: "mmproj-LFM2.5-VL-450m-F16.gguf",
      downloadUrl:
        "https://huggingface.co/LiquidAI/LFM2.5-VL-450M-GGUF/resolve/main/mmproj-LFM2.5-VL-450m-F16.gguf",
    },
    {
      name: "mmproj-LFM2.5-VL-450m-Q8_0.gguf",
      size: 60_000_000,
      path: "mmproj-LFM2.5-VL-450m-Q8_0.gguf",
      downloadUrl:
        "https://huggingface.co/LiquidAI/LFM2.5-VL-450M-GGUF/resolve/main/mmproj-LFM2.5-VL-450m-Q8_0.gguf",
    },
  ]),
}));

jest.mock("@/services/models/gguf-header", () => ({
  readGgufMetadata: jest.fn(async () => null),
}));

function file(name: string, size: number): HFModelFile {
  return {
    name,
    size,
    path: name,
    downloadUrl: `https://huggingface.co/LiquidAI/LFM2.5-VL-450M-GGUF/resolve/main/${name}`,
    oid: `o-${name}`,
  };
}

/** The user's row as the old import left it: vision claimed, projector
 *  record absent. A COMPLETED download — the heal's only subject. */
function blindSpec(): ModelSpec {
  return {
    id: "hf-LiquidAI/LFM2.5-VL-450M-GGUF-LFM2.5-VL-450M-Q8_0.gguf",
    name: "LFM2.5-VL-450M-GGUF (LFM2.5-VL-450M-Q8_0.gguf)",
    author: "LiquidAI",
    description: "",
    origin: "huggingface",
    type: "llm",
    supportsVision: true,
    visionEnabled: true,
    hfUrl: "https://huggingface.co/LiquidAI/LFM2.5-VL-450M-GGUF",
    files: [
      {
        name: "LFM2.5-VL-450M-Q8_0.gguf",
        size: 450_000_000,
        downloadUrl:
          "https://huggingface.co/LiquidAI/LFM2.5-VL-450M-GGUF/resolve/main/LFM2.5-VL-450M-Q8_0.gguf",
        oid: "o-main",
      },
    ],
    downloadStatus: "completed",
    downloadProgress: 1,
    downloadedBytes: 450_000_000,
    totalBytes: 450_000_000,
  };
}

async function storeWithRow(row: ModelSpec) {
  const storage = memoryStorage();
  const store = createModelStore(storage);
  await store.getState().loadPersisted();
  store.setState({ models: [row] });
  return store;
}

describe("healProjectorCandidates", () => {
  it("records the repo's mmproj candidates and the pairing rule's projector", async () => {
    const store = await storeWithRow(blindSpec());

    await store.getState().healProjectorCandidates(blindSpec().id);

    const row = store.getState().getModel(blindSpec().id)!;
    expect(row.projectorCandidates?.map((c) => c.name)).toEqual([
      "mmproj-LFM2.5-VL-450m-F16.gguf",
      "mmproj-LFM2.5-VL-450m-Q8_0.gguf",
    ]);
    // No exact family match (the repo writes "450m", the LLM "450M"):
    // the rule falls back to the SMALLEST mmproj — the cheap one that
    // cannot overwhelm a 450M model.
    expect(row.projector?.name).toBe("mmproj-LFM2.5-VL-450m-Q8_0.gguf");
  });

  it("a spec with a projector already records nothing again", async () => {
    const row0 = blindSpec();
    const store = await storeWithRow({
      ...row0,
      projector: {
        name: "mmproj-LFM2.5-VL-450m-F16.gguf",
        size: 98_000_000,
        downloadUrl: file("mmproj", 98_000_000).downloadUrl,
      },
    });

    await store.getState().healProjectorCandidates(row0.id);

    const row = store.getState().getModel(row0.id)!;
    expect(row.projectorCandidates).toBeUndefined(); // untouched
  });

  it("a completed spec with no repo files records no candidates", async () => {
    jest
      .requireMock("@/services/models/huggingface")
      .getModelFiles.mockImplementation(async () => []);
    const store = await storeWithRow(blindSpec());

    await store.getState().healProjectorCandidates(blindSpec().id);

    const row = store.getState().getModel(blindSpec().id)!;
    expect(row.projector).toBeUndefined();
    expect(row.projectorCandidates).toBeUndefined();
  });
});
