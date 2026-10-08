/** Android download driver: WorkManager via the local `native-download` module.
 *
 * WHY A SEPARATE DRIVER: `download-service.ts` is built around
 * expo-file-system's `createDownloadResumable`, which on Android runs on a
 * Dispatchers.IO coroutine inside the app process — the transfer dies with
 * it. WorkManager does not. Rather than fork that file's internals into two
 * shapes, this exposes the SAME surface (start/pause/resume/cancel plus
 * getJob/getAllJobs and the onProgress/onComplete callbacks) and
 * `download-service.ts` picks one at construction.
 *
 * PROGRESS IS POLLED, deliberately. The native module emits an event per
 * transition, but a download that outlives the JS runtime is precisely the
 * case where events are dropped. `getActiveDownloads()` reads the same
 * durable store the worker writes, so polling at the same ~1 Hz the emitter
 * already uses costs nothing extra and is the thing that actually
 * reconstructs state after a cold start.
 *
 * Falls back to null (and therefore to the legacy driver) whenever the native
 * side is absent: a clone that has not run `expo prebuild` yet still works.
 */
import { androidDownload, addDownloadListener, type NativeDownload } from "../modules/native-download/src/NativeDownloadModule";
import { claimTerminal, isTerminalState } from "./models/download-jobs.ts";
import type { DownloadJob } from "../types/models.ts";

export type ProgressCallback = (job: DownloadJob) => void;
export type CompleteCallback = (job: DownloadJob, success: boolean) => void;

/** Same cadence the emitter uses, so polling adds nothing the bar would miss. */
const POLL_MS = 1000;

/** Native state -> the JS vocabulary `DownloadJob.status` uses. `queued` has
 *  no JS equivalent: WorkManager has accepted the job but not started it,
 *  which reads to the user as still downloading. */
function toJobStatus(state: NativeDownload["state"]): DownloadJob["status"] {
  switch (state) {
    case "running":
    case "queued":
      return "downloading";
    case "paused":
      return "paused";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "failed":
      return "failed";
  }
}

/** A native record shaped as a DownloadJob. Keyed by modelId, which the
 *  caller sends on every request, so a cold-started record joins to the same
 *  model card a live one would. */
function toJob(record: NativeDownload): DownloadJob {
  return {
    id: record.id,
    modelId: record.modelId,
    fileName: record.fileName,
    downloadUrl: "",
    destinationPath: record.destinationPath,
    status: toJobStatus(record.state),
    progress:
      record.expectedTotal > 0
        ? Math.round((record.downloadedBytes / record.expectedTotal) * 100)
        : 0,
    downloadedBytes: record.downloadedBytes,
    totalBytes: record.expectedTotal,
    error: record.error,
    errorCode: record.errorCode,
    resumable: true,
  };
}

/** True when this platform has a native module to talk to. */
export function androidDriverAvailable(): boolean {
  return androidDownload() !== null;
}

/**
 * The Android driver. Owns no transfer state of its own — the native store is
 * the source of truth — but keeps a mirror so `getJob`/`getAllJobs` stay
 * synchronous for the store, exactly as the legacy driver does.
 */
export class AndroidDownloadService {
  private readonly native = androidDownload();
  private readonly mirror = new Map<string, DownloadJob>();
  private callbacks: {
    onProgress?: ProgressCallback;
    onComplete?: CompleteCallback;
  } = {};
  private poller: ReturnType<typeof setInterval> | null = null;
  private seenTerminal = new Set<string>();
  /** ONE module-level subscription, not one per startDownload. A listener
   *  added per start is never removed, so every retry stacked another. */
  private unsubscribe: (() => void) | null = null;

  private ensureSubscribed(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = addDownloadListener((event) => {
      this.apply(event, undefined, undefined);
    });
  }

  /**
   * Adopt whatever the native side still has running.
   *
   * THIS IS THE COLD-START PATH, and it was missing. Without it a download
   * that survived a force-stop kept transferring under WorkManager while the
   * app had no mirror entry, no poller, and no listener — the row showed
   * "paused" and nothing ever took control of it again. The transfer
   * outliving JS is the whole point of the module, so JS has to come back and
   * ask.
   *
   * PocketPal parity: initializeStore -> syncWithActiveDownloads
   * (ModelStore.ts:763) -> getActiveDownloads() -> reattach observer.
   *
   * Returns the ids it adopted so callers can refresh just those rows.
   */
  async reconcileWithNative(): Promise<string[]> {
    const native = this.native;
    if (!native) return [];
    this.ensureSubscribed();
    let records: NativeDownload[];
    try {
      records = await native.getActiveDownloads();
    } catch {
      // Native unavailable (prebuild predates the module): the caller falls
      // back to the legacy driver. Not a failed reconciliation.
      return [];
    }
    for (const record of records) {
      // Adopt the native row under the modelId the caller sent, so it joins
      // to the same model card the JS store already holds.
      this.mirror.set(record.id, {
        ...toJob(record),
      });
      // Re-arm the completion claim ONLY for live records. Clearing it for a
      // terminal row would let the next poll re-fire onComplete for a
      // download that finished last session — the same re-announcement the
      // replay filter in NativeDownloadModule.kt deliberately suppresses.
      // The store syncs those rows through persistence' setModelProgress
      // loop, which does not need the completion callback.
      if (!isTerminalState(record.state)) this.seenTerminal.delete(record.id);
    }
    if (records.length > 0) this.beginPolling();
    return records.map((r) => r.modelId);
  }

  /** Read-only peek, used by reconcileInterrupted before the disk pass —
   *  see knownModelIds on the DownloadDriver interface. */
  async knownModelIds(): Promise<string[]> {
    if (!this.native) return [];
    try {
      return (await this.native.getActiveDownloads()).map((r) => r.modelId);
    } catch {
      return [];
    }
  }

  setProgressCallback(callback: ProgressCallback): void {
    this.callbacks.onProgress = callback;
  }

  setCompleteCallback(callback: CompleteCallback): void {
    this.callbacks.onComplete = callback;
  }

  async startDownload(
    job: DownloadJob,
    progressCallback?: ProgressCallback,
    onComplete?: CompleteCallback,
    /**
     * Accepted and ignored, so this class is structurally identical to the
     * legacy driver and needs no cast at the call site. Resume here is not
     * driven by a token: the worker reads the real partial length off disk,
     * which is the more reliable source anyway (it is what survives the
     * process being killed).
     */
    _resumeData?: string,
  ): Promise<void> {
    const native = this.native;
    if (!native) throw new Error("native-download native module unavailable");
    const onProgress = progressCallback ?? (() => {});
    const complete = onComplete ?? (() => {});
    // The subscription is now module-level, so a per-call completion handler
    // has to reach the shared callbacks to be invoked at all. The store sets
    // these itself; this only fills them when a caller passes one.
    if (progressCallback) this.callbacks.onProgress = onProgress;
    if (onComplete) this.callbacks.onComplete = complete;

    // The store keys on the download id, so a retry re-enqueues the SAME
    // record and WorkManager REPLACE keeps one worker per file.
    await native.startDownload({
      id: job.id,
      modelId: job.modelId,
      url: job.downloadUrl,
      fileName: job.fileName,
      destinationPath: job.destinationPath,
      expectedTotal: job.totalBytes,
      // Same quoted-entity-tag requirement as the JS path: a bare hex oid is
      // a malformed If-Range and the server may ignore the header entirely,
      // which would leave a resume able to splice two versions together.
      ifRange: (job.headers?.["If-Range"] ?? "").replace(/^"|"$/g, ""),
      headers: job.headers,
    });

    this.mirror.set(job.id, job);
    this.ensureSubscribed();
    this.beginPolling();
    onProgress({ ...job, status: "downloading" });
  }

  private beginPolling(): void {
    if (this.poller) return;
    this.poller = setInterval(() => {
      void this.native?.getActiveDownloads().then(
        (records) => {
          for (const record of records) {
            this.apply(record, undefined, undefined);
          }
        },
        () => {
          // A failed poll is not a failed download. The next tick retries,
          // and the terminal event still arrives.
        },
      );
    }, POLL_MS);
  }

  /** Fan a native record out to both the per-job and global callbacks, and
     *  fire completion exactly once per terminal transition. */
private apply(
    record: NativeDownload,
    onProgress: ProgressCallback | undefined,
    onComplete: CompleteCallback | undefined,
  ): void {
    const previous = this.mirror.get(record.id);
    if (!previous) return;
    const next: DownloadJob = {
      ...previous,
      status: toJobStatus(record.state),
      downloadedBytes: record.downloadedBytes,
      // The worker adopts the server's total (PocketPal parity), so the
      // record — not the catalog value baked in at startDownload — is the
      // authority once it arrives.
      totalBytes: record.expectedTotal > 0 ? record.expectedTotal : previous.totalBytes,
      progress:
        record.expectedTotal > 0
          ? Math.round((record.downloadedBytes / record.expectedTotal) * 100)
          : 0,
      error: record.error,
      errorCode: record.errorCode,
    };
    this.mirror.set(record.id, next);

    onProgress?.(next);
    this.callbacks.onProgress?.(next);

    // The event and the 1 s poll both deliver the same terminal record;
    // claimTerminal keeps onComplete single-fire.
    if (claimTerminal(this.seenTerminal, record.id, record.state)) {
      const success = record.state === "completed";
      onComplete?.(next, success);
      this.callbacks.onComplete?.(next, success);
      if ([...this.mirror.values()].every((j) => j.status !== "downloading")) {
        this.stopPolling();
      }
    }
  }

  private stopPolling(): void {
    if (!this.poller) return;
    clearInterval(this.poller);
    this.poller = null;
  }

  async pauseDownload(jobId: string): Promise<DownloadJob | null> {
    await this.native?.pauseDownload(jobId);
    const job = this.mirror.get(jobId);
    if (job) this.mirror.set(jobId, { ...job, status: "paused" });
    return this.mirror.get(jobId) ?? null;
  }

  async resumeDownload(jobId: string): Promise<void> {
    const job = this.mirror.get(jobId);
    if (!job) throw new Error("Download not found or not resumable");
    // Clearing the guard is what lets the completion fire again after a
    // resume that goes on to finish.
    this.seenTerminal.delete(jobId);
    // Native resume refuses anything that is not PAUSED, so a FAILED card's
    // Retry has to take the retry verb. Falling back here keeps
    // store/models/downloads.ts unchanged and stops it throwing into a
    // swallowed catch, which left the failed record orphaned on disk.
    await this.native
      ?.resumeDownload(jobId)
      .catch(() => this.native?.retryDownload(jobId));
    this.beginPolling();
  }

  async cancelDownload(jobId: string): Promise<void> {
    await this.native?.cancelDownload(jobId);
    this.seenTerminal.add(jobId);
    this.mirror.delete(jobId);
    if (this.mirror.size === 0) this.stopPolling();
  }

  getJob(jobId: string): DownloadJob | null {
    return this.mirror.get(jobId) ?? null;
  }

  getAllJobs(): DownloadJob[] {
    return [...this.mirror.values()];
  }

  removeJob(jobId: string): void {
    this.seenTerminal.delete(jobId);
    const job = this.mirror.get(jobId);
    this.mirror.delete(jobId);
    // Terminal is not forgotten. Without this the Room row survives the job,
    // the table grows one entry per download forever, and every cold start
    // re-reads all of it. Fire-and-forget: the mirror is already correct.
    if (job) void this.native?.forgetDownload(job.id).catch(() => {});
    if (this.mirror.size === 0) this.stopPolling();
  }
}