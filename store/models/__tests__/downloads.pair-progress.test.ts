/** One progress bar for a paired (vision) download.
 *
 * PocketParity: a vision model's card promises the PAIR's size
 * (ModelFileCard.tsx:253-271 returns getVisionModelSizeBreakdown().totalSize),
 * so the bar covering it must read one download, not two: totalBytes is the
 * pair's footprint (LLM + mmproj) and downloadedBytes accumulate across both
 * legs. Before this, each leg reported its own bytes, so the bar finished at
 * the LLM and restarted at zero for the projector — the reported "it
 * downloads a second time".
 *
 * Seam (agreed): the store's download subscription through a fake
 * enqueue-and-return driver, asserting the row's visible progress account.
 * MISSes: the driver's own progress math, and the bar's rendering.
 */

import type { ModelSpec, DownloadJob } from "@/types/models";
import { memoryStorage } from "@/jest/storage";
import { createModelStore } from "../index";
import { setDownloadService } from "../downloads";

jest.mock("@/services/downloads/download-service", () => ({
  platformDownloadService: { getAllJobs: jest.fn(() => []) },
  failureCode: (error?: { code?: string }) => error?.code,
}));

jest.mock("@/services/models/gguf-header.ts", () => ({
  readGgufMetadata: jest.fn(async () => null),
}));

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  getFreeDiskStorageAsync: jest.fn(async () => Number.MAX_SAFE_INTEGER),
  deleteAsync: jest.fn(async () => undefined),
}));

class EarlyResolveDriver {
  private subscribers = new Map<string, Set<(job: DownloadJob) => void>>();
  private jobs = new Map<string, DownloadJob>();

  subscribe(jobId: string, callback: (job: DownloadJob) => void): () => void {
    let set = this.subscribers.get(jobId);
    if (!set) {
      set = new Set();
      this.subscribers.set(jobId, set);
    }
    set.add(callback);
    return () => {
      set.delete(callback);
      if (set.size === 0) this.subscribers.delete(jobId);
    };
  }

  async startDownload(job: DownloadJob): Promise<void> {
    this.jobs.set(job.id, job);
  }

  async pauseDownload(): Promise<DownloadJob | null> {
    return null;
  }
  async resumeDownload(): Promise<void> {}
  async cancelDownload(): Promise<void> {}
  getJob(jobId: string): DownloadJob | null {
    return this.jobs.get(jobId) ?? null;
  }
  getAllJobs(): DownloadJob[] {
    return [...this.jobs.values()];
  }
  removeJob(jobId: string): void {
    this.jobs.delete(jobId);
    this.subscribers.delete(jobId);
  }

  emit(job: DownloadJob): void {
    this.jobs.set(job.id, job);
    const set = this.subscribers.get(job.id);
    if (!set) return;
    for (const cb of set) cb(job);
  }
}

const MAIN_BYTES = 1_000;
const PROJECTOR_BYTES = 400;

function pairedSpec(): ModelSpec {
  const spec: ModelSpec = {
    id: "vision-1",
    name: "Vision 1",
    author: "Author",
    description: "",
    origin: "huggingface",
    type: "llm",
    files: [
      { name: "vision.gguf", size: MAIN_BYTES, downloadUrl: "https://x/vision.gguf" },
    ],
    projector: {
      name: "mmproj-vision.gguf",
      size: PROJECTOR_BYTES,
      downloadUrl: "https://x/mmproj-vision.gguf",
    },
    downloadStatus: "idle",
    downloadProgress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
  };
  return spec;
}

describe("downloads: a paired spec reports one continuous account", () => {
  it("the main leg's ticks count toward the PAIR's total", async () => {
    const driver = new EarlyResolveDriver();
    setDownloadService(driver);
    const store = createModelStore(memoryStorage());
    const spec = pairedSpec();

    await store.getState().startSpecDownload(spec, spec.files[0], undefined);

    const base = driver.getAllJobs()[0];
    expect(base).toBeDefined();
    driver.emit({ ...base!, progress: 50, downloadedBytes: 500 });

    const row = store.getState().getModel(spec.id);
    expect(row?.totalBytes).toBe(MAIN_BYTES + PROJECTOR_BYTES);
    expect(row?.downloadedBytes).toBe(500);
    expect(row?.downloadProgress).toBe(Math.round((500 / 1400) * 100));
  });

  it("the projector leg continues the same bar, not back to zero", async () => {
    const driver = new EarlyResolveDriver();
    setDownloadService(driver);
    const store = createModelStore(memoryStorage());
    const spec = pairedSpec();

    await store.getState().startSpecDownload(spec, spec.files[0], undefined);

    const base = driver.getAllJobs()[0]!;
    driver.emit({
      ...base,
      fileName: "mmproj-vision.gguf",
      downloadedBytes: 200,
      totalBytes: PROJECTOR_BYTES,
    });

    const row = store.getState().getModel(spec.id);
    expect(row?.totalBytes).toBe(MAIN_BYTES + PROJECTOR_BYTES);
    // The LLM is already whole: its bytes stand under this leg's ticks.
    expect(row?.downloadedBytes).toBe(MAIN_BYTES + 200);
    expect(row?.downloadProgress).toBe(Math.round((1200 / 1400) * 100));
  });

  it("the projector leg's completion lands on the pair at 100%", async () => {
    const driver = new EarlyResolveDriver();
    setDownloadService(driver);
    const store = createModelStore(memoryStorage());
    const spec = pairedSpec();

    await store.getState().startSpecDownload(spec, spec.files[0], undefined);

    const base = driver.getAllJobs()[0]!;
    driver.emit({
      ...base,
      fileName: "mmproj-vision.gguf",
      status: "completed",
      progress: 100,
      downloadedBytes: PROJECTOR_BYTES,
    });

    const row = store.getState().getModel(spec.id);
    expect(row?.downloadStatus).toBe("completed");
    expect(row?.downloadProgress).toBe(100);
    expect(row?.downloadedBytes).toBe(MAIN_BYTES + PROJECTOR_BYTES);
    expect(row?.totalBytes).toBe(MAIN_BYTES + PROJECTOR_BYTES);
  });
});
