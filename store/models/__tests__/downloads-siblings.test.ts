/** The HF download's siblings: the picker's fetched file list must reach
 *  the pairing.
 *
 *  The user's model (LiquidAI/LFM2.5-VL-450M-GGUF) shipped an mmproj in
 *  the repo, yet the downloaded spec recorded no projector and no
 *  projectorCandidates — the details card therefore showed no projection
 *  section at all and the whole app treated the VLM as text-only.
 *  Root cause: `searchModels` returns results with `ggufFiles: []` (real
 *  files are fetched per-repo for the details sheet only, and the sheet
 *  dropped them before startDownload), so both the spec builder's ref and
 *  the local pairing rule saw an EMPTY sibling list — while the repo's
 *  "vision" tags still flipped supportsVision on. A spec claiming vision
 *  with no projector recorded anywhere.
 */

import type { ModelSpec, HFModelFile, HFModelSearchResult } from "@/types/models";
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

// The presets/data + search parts of the barrel are unrelated here; the
// SPEC BUILDERS stay real (they are the subject).
jest.mock("@/services/models/huggingface", () => ({
  ...jest.requireActual("@/services/models/huggingface"),
  getPresets: jest.fn(async () => []),
  searchModels: jest.fn(async () => ({ results: [], nextPageLink: null })),
  getModelFiles: jest.fn(async () => []),
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

/** The repo the way the tree endpoint returns it — LLM plus mmproj. */
const REPO_FILES: HFModelFile[] = [
  file("LFM2.5-VL-450M-Q8_0.gguf", 450_000_000),
  file("mmproj-LFM2.5-VL-450m-F16.gguf", 98_000_000),
];

const LLM = REPO_FILES[0];

function mainFileEntry(f: HFModelFile = LLM) {
  return {
    name: f.name,
    size: f.size,
    downloadUrl: f.downloadUrl,
    oid: f.oid,
  };
}

/** A search result the way searchModels returns it: NO files attached
 *  (empty ggufFiles, exactly the field the store used to rely on). */
function searchResult(over: Partial<HFModelSearchResult> = {}): HFModelSearchResult {
  return {
    modelId: "LiquidAI/LFM2.5-VL-450M-GGUF",
    author: "LiquidAI",
    name: "LFM2.5-VL-450M-GGUF",
    description: "",
    tags: ["gguf", "vision", "vlm", "conversational"],
    downloads: 0,
    likes: 0,
    gated: false,
    ggufFiles: [],
    ...over,
  };
}

async function storeWith() {
  const storage = memoryStorage();
  const store = createModelStore(storage);
  await store.getState().loadPersisted();
  return store;
}

describe("startDownload carries the fetched repo files into the pairing", () => {
  it("pairs the projector from the files the details sheet fetched", async () => {
    const store = await storeWith();
    store.setState({ searchResults: [searchResult()] });

    await store.getState().startDownload(searchResult().modelId, LLM, undefined, {
      files: REPO_FILES,
    });

    const row = store.getState().getModel("hf-LiquidAI/LFM2.5-VL-450M-GGUF-LFM2.5-VL-450M-Q8_0.gguf");
    expect(row).toBeDefined();
    expect(row?.projector?.name).toBe("mmproj-LFM2.5-VL-450m-F16.gguf");
    expect(row?.projectorCandidates?.map((c) => c.name)).toEqual([
      "mmproj-LFM2.5-VL-450m-F16.gguf",
    ]);
  });

  it("empty search results no longer blind the spec (regression)", async () => {
    // Without the fix this test failed IN BOTH DIRECTIONS: the projector
    // was never paired and spec.projectorCandidates never appeared.
    const store = await storeWith();
    store.setState({ searchResults: [] });

    await store.getState().startDownload("LiquidAI/LFM2.5-VL-450M-GGUF", LLM, undefined, {
      files: REPO_FILES,
    });

    const rows = store.getState().models;
    expect(rows).toHaveLength(1);
    expect(rows[0].projector?.name).toBe("mmproj-LFM2.5-VL-450m-F16.gguf");
    expect((rows[0].projectorCandidates ?? []).length).toBe(1);
  });
});
