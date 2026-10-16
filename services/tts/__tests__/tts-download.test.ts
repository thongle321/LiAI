/** Contract tests for services/tts//download.ts's pause path.
 *
 * The native manager cannot run in node, so the bridge is built over a
 * fake API injected through its loader — the seam the module documents for
 * exactly this. What matters here: a pause is a STATE the UI renders, not
 * a rejection it has to swallow, and the partial bytes stay put.
 */

import {
  createTtsDownloadBridge,
  type IncompleteTtsDownload,
  type SherpaTtsDownloadApi,
  type TtsModelStatus,
} from "../download";
import type { ModelCategory, ModelMeta, Progress } from "react-native-sherpa-onnx/download";

/** What the manager throws when a transfer is paused deliberately. */
class PauseError extends Error {
  constructor() {
    super("paused");
    this.name = "PauseError";
  }
}

const progress = (percent: number): Progress => ({
  bytesProcessed: percent * 1000,
  totalBytes: 100_000,
  percent,
  phase: "downloading",
});

function fakeApi(
  overrides: Partial<SherpaTtsDownloadApi> = {},
): SherpaTtsDownloadApi & { paused: string[] } {
  const paused: string[] = [];
  const api = {
    paused,
    refreshModels: async (): Promise<ModelMeta[]> => [],
    downloadModel: async (
      _category: ModelCategory,
      _id: string,
      options?: { onProgress?: (p: Progress) => void },
    ): Promise<{ modelId: string; localPath: string }> => {
      options?.onProgress?.(progress(50));
      throw new PauseError();
    },
    pauseDownload: async (_category: ModelCategory, id: string): Promise<void> => {
      paused.push(id);
    },
    resumeDownload: async (
      _category: ModelCategory,
      _id: string,
      options?: { onProgress?: (p: Progress) => void },
    ): Promise<{ modelId: string; localPath: string }> => {
      options?.onProgress?.(progress(90));
      return { modelId: "m", localPath: "/models/m" };
    },
    getIncompleteDownloads: async (): Promise<IncompleteTtsDownload[]> => [
      { modelId: "m", bytesDownloaded: 25, totalBytes: 100 },
    ],
    isModelDownloaded: async (): Promise<boolean> => false,
    getModelPath: async (): Promise<string | null> => null,
    deleteModel: async (): Promise<void> => {},
  };
  return { ...api, ...overrides } as SherpaTtsDownloadApi & { paused: string[] };
}

describe("tts download bridge", () => {
  it("settles a user pause as a paused status and resolves, never rejects", async () => {
    const api = fakeApi();
    const bridge = createTtsDownloadBridge(async () => api);
    const seen: TtsModelStatus[] = [];

    const path = await bridge.download("m", (status) => seen.push(status));

    // A rejected promise here is what painted "Download aborted" over a
    // card the user had only paused.
    expect(path).toBeNull();
    expect(seen.map((s) => s.state)).toEqual(["downloading", "downloading", "paused"]);
    expect(seen.at(-1)).toMatchObject({ percent: 50 });
  });

  it("pauses through the manager, which keeps the partial bytes", async () => {
    const api = fakeApi();
    const bridge = createTtsDownloadBridge(async () => api);
    await bridge.pause("m");
    expect(api.paused).toEqual(["m"]);
  });

  it("resumes to ready and keeps reporting progress", async () => {
    const api = fakeApi();
    const bridge = createTtsDownloadBridge(async () => api);
    const seen: TtsModelStatus[] = [];

    const path = await bridge.resume("m", (status) => seen.push(status));

    expect(path).toBe("/models/m");
    expect(seen.at(-1)).toEqual({ state: "ready", percent: 100 });
    expect(seen[1]).toMatchObject({ percent: 90 });
  });

  it("reads a transfer left over from a previous session as a percent", async () => {
    const api = fakeApi();
    const bridge = createTtsDownloadBridge(async () => api);
    await expect(bridge.incomplete()).resolves.toEqual({ m: 25 });
  });
});