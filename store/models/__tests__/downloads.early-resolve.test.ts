/** Early driver resolve: the subscription must outlive the promise.
 *
 * The Android driver resolves `startDownload` as soon as the native side is
 * ENQUEUED (WorkManager row upserted) — the transfer keeps streaming after the
 * promise settles. The store used to `unsubscribe()` the moment the awaited
 * promise resolved, killing the only live event channel: the row froze at its
 * pre-start write ("downloading", 0%, 0 B) until cancel — the exact symptom of
 * a download stuck at 0% with no error (Bonsai 1.7B, 248.3 MB).
 *
 * The fake driver here has that Android shape: startDownload resolves
 * immediately; the test then pushes progress and a completion through
 * `emit()` and the store must advance the row and land on "completed".
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

/** A driver whose startDownload resolves BEFORE the transfer finishes:
 *  the exact timing of AndroidDownloadService (enqueue-and-return). */
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
    // Record the mirror, resolve immediately — no transfer awaits this.
    this.jobs.set(job.id, job);
  }

  // Unused by this suite: the store only reaches startDownload + subscribe.
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

  /** The transfer continues after the promise resolved: the test pushes
   *  events the way the native module pushes its Room write events. */
  emit(job: DownloadJob): void {
    this.jobs.set(job.id, job);
    const set = this.subscribers.get(job.id);
    if (!set) return;
    for (const cb of set) cb(job);
  }

  /** Simulate a late native "cancelled" event (Room Flow re-delivery). */
  emitCancelled(job: DownloadJob): void {
    this.emit({ ...job, status: "cancelled", progress: 12 });
  }
}

/** The LEGACY driver's timing: the startDownload promise spans the whole
 *  transfer and resolves only after the terminal status was published. The
 *  store code is shared by both drivers, so this shape must keep passing. */
class SpanningTransferDriver {
  private subscribers = new Map<string, Set<(job: DownloadJob) => void>>();
  private jobs = new Map<string, DownloadJob>();
  private release: (() => void) | null = null;

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
    await new Promise<void>((resolve) => {
      this.release = resolve;
    });
  }

  // Unused by this suite: the store only reaches startDownload + subscribe.
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

  /** The transfer completes: terminal status is EMITTED, then the promise
   *  settles (emit event first, like the legacy notify-then-resolve order). */
  finish(): void {
    this.release?.();
    this.release = null;
  }
}

/** Preset-shaped spec: startSpecDownload needs no search results or presets. */
function downloadFixtures(overrides: Partial<ModelSpec> = {}): {
  spec: ModelSpec;
  file: NonNullable<ModelSpec["files"]>[number];
} {
  const spec: ModelSpec = {
    id: "bonsai-1",
    name: "Bonsai 1.7B",
    author: "Author",
    description: "",
    origin: "huggingface",
    type: "llm",
    files: [
      { name: "bonsai.gguf", size: 1000, downloadUrl: "https://x/bonsai.gguf" },
    ],
    downloadStatus: "idle",
    downloadProgress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    ...overrides,
  };
  return { spec, file: spec.files[0] };
}

describe("downloads: subscription survives an early driver resolve", () => {
  it("advances the row to completed when the transfer finishes late", async () => {
    const driver = new EarlyResolveDriver();
    setDownloadService(driver);
    const store = createModelStore(memoryStorage());
    const { spec, file } = downloadFixtures();

    await store.getState().startSpecDownload(spec, file, undefined);

    // The promise resolved before any byte moved (enqueue-and-return).
    const base = driver.getAllJobs()[0];
    expect(base).toBeDefined();

    // The transfer streams on: a progress tick still reaches the subscriber.
    driver.emit({ ...base, progress: 50, downloadedBytes: 500 });

    let model = store.getState().getModel(spec.id);
    expect(model?.downloadStatus).toBe("downloading");
    expect(model?.downloadProgress).toBe(50);
    expect(model?.downloadedBytes).toBe(500);

    driver.emit({
      ...base,
      status: "completed",
      progress: 100,
      downloadedBytes: 1000,
    });

    model = store.getState().getModel(spec.id);
    expect(model?.downloadStatus).toBe("completed");
    expect(model?.downloadProgress).toBe(100);
    expect(model?.downloadedBytes).toBe(1000);

    // Terminal status detached the subscription: a late stray event
    // (duplicated terminal from Room, a leftover tick) cannot rewrite the
    // row into something the card does not handle.
    driver.emit({ ...base, status: "downloading", progress: 40, downloadedBytes: 400 });
    model = store.getState().getModel(spec.id);
    expect(model?.downloadStatus).toBe("completed");
    expect(model?.downloadedBytes).toBe(1000);
  });

  it("keeps the row live while the LEGACY-style promise spans the transfer", async () => {
    const driver = new SpanningTransferDriver();
    setDownloadService(driver);
    const store = createModelStore(memoryStorage());
    const { spec, file } = downloadFixtures();

    const starting = store.getState().startSpecDownload(spec, file, undefined);
    // The store's own awaits land before subscribe+start: wait for the
    // driver registration (the store awaits an unresolved promise there,
    // so it stays suspended until finish()).
    for (let wait = 0; wait < 50 && driver.getAllJobs().length === 0; wait++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Progress falls inside the awaited promise (legacy emit-while-pending
    // shape): the row must follow it.
    const base = driver.getAllJobs()[0];
    driver.emit({ ...base, progress: 25, downloadedBytes: 250 });
    expect(store.getState().getModel(spec.id)?.downloadProgress).toBe(25);

    driver.emit({
      ...base,
      status: "completed",
      progress: 100,
      downloadedBytes: 1000,
    });
    // Settle the awaited promise AFTER the terminal notification (legacy
    // notify-then-resolve order).
    driver.finish();
    await starting;

    const model = store.getState().getModel(spec.id);
    expect(model?.downloadStatus).toBe("completed");
    expect(model?.downloadProgress).toBe(100);
    expect(model?.downloadedBytes).toBe(1000);
  });

  it("lands the row on idle even when the native cancelled event arrives late", async () => {
    const driver = new EarlyResolveDriver();
    setDownloadService(driver);
    const store = createModelStore(memoryStorage());
    const { spec, file } = downloadFixtures({ downloadStatus: "downloading", downloadProgress: 40, downloadedBytes: 400 });

    await store.getState().startSpecDownload(spec, file, undefined);
    const base = driver.getAllJobs()[0];

    // cancelModelDownload awaits the service, then resets the row to
    // "idle". The native driver's cancelled event can arrive AFTER that
    // reset — it must not park the row on a "cancelled" status.
    driver.emitCancelled(base);

    const model = store.getState().getModel(spec.id);
    expect(model?.downloadStatus).toBe("idle");
    expect(model?.downloadProgress).toBe(0);
    expect(model?.downloadedBytes).toBe(0);

    // Cancel detached the subscription: further events cannot resurrect it.
    driver.emit({ ...base, status: "downloading", progress: 60, downloadedBytes: 600 });
    expect(store.getState().getModel(spec.id)?.downloadStatus).toBe("idle");
  });
});
