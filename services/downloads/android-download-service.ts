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
 * PROGRESS IS PUSHED, PocketPal's shape: the native module emits a record on
 * every Room write (the worker writes progress at ~1 Hz), and that event is
 * the ONLY live feed here. `getActiveDownloads()` is the one-shot recovery at
 * boot — reconcileWithNative adopts whatever the worker kept running while JS
 * was dead (pocketpal: syncWithActiveDownloads, ModelStore.ts:763). An
 * earlier version ALSO polled at 1 Hz; two writers delivering the same second
 * twice is exactly what made the rate flicker 0 -> spike -> 0.
 *
 * Falls back to null (and therefore to the legacy driver) whenever the native
 * side is absent: a clone that has not run `expo prebuild` yet still works.
 */
import { androidDownload, addDownloadListener, type NativeDownload } from "@/modules/native-download/src/NativeDownloadModule";
import {
  claimTerminal,
  isTerminalState,
  nativeDestinationPath,
  nativeStateToJobStatus,
  nextSpeedSample,
} from "../models/download-jobs.ts";
import type { DownloadJob } from "@/types/models.ts";

export type ProgressCallback = (job: DownloadJob) => void;
export type CompleteCallback = (job: DownloadJob, success: boolean) => void;

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
    status: nativeStateToJobStatus(record.state, record.error),
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
  private seenTerminal = new Set<string>();
  /** Previous sample per id, for the speed the native record does not carry
   *  (PocketPal computes it natively; ours ships raw bytes only — without
   *  this the caption read "0.00 MB/s" on every WorkManager download). */
  private ticks = new Map<string, { bytes: number; at: number }>();
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
   * app had no mirror entry and no listener — the row showed "paused" and
   * nothing ever took control of it again. The transfer outliving JS is the
   * whole point of the module, so JS has to come back and ask.
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
      // terminal row would let the next event re-fire onComplete for a
      // download that finished last session — the same re-announcement the
      // replay filter in NativeDownloadModule.kt deliberately suppresses.
      // The store syncs those rows through persistence' setModelProgress
      // loop, which does not need the completion callback.
      if (!isTerminalState(record.state)) this.seenTerminal.delete(record.id);
      else {
        // Adopted as ALREADY terminal: the mirror carries it for the
        // store's one-time sync, and the Room row goes — it persists the
        // full headers map, Authorization included, and a finished
        // download never needs to re-authenticate again (audit finding 5).
        void this.native.forgetDownload(record.id).catch(() => {});
      }
    }
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
      // Plain path, NOT expo's `file://` URI: the worker does
      // `new File(record.destination)` and mkdirs on it. A URI is read as a
      // relative `file:` directory, which fails with ENOENT on every
      // download. PocketPal's RNFS path never carried a scheme.
      destinationPath: nativeDestinationPath(job.destinationPath),
      expectedTotal: job.totalBytes,
      // Same quoted-entity-tag requirement as the JS path: a bare hex oid is
      // a malformed If-Range and the server may ignore the header entirely,
      // which would leave a resume able to splice two versions together.
      ifRange: (job.headers?.["If-Range"] ?? "").replace(/^"|"$/g, ""),
      headers: job.headers,
    });

    this.mirror.set(job.id, job);
    this.ensureSubscribed();
    onProgress({ ...job, status: "downloading" });
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
    // One total for BOTH the stored value and the percentage — the previous
    // version fell back to the mirror for totalBytes but not for progress,
    // so a record with expectedTotal 0 pinned the bar at 0% while the
    // caption counted real bytes.
    const total = record.expectedTotal > 0 ? record.expectedTotal : previous.totalBytes;
    // ONE window over the single event stream. The Room Flow re-emits on
    // ANY row write, so a status transition delivers a record whose byte
    // count has not moved; sampling on every delivery read that as a hard
    // 0 (and a burst arriving microseconds after the real sample read as a
    // ~32 MB/s spike), which is why the rate flickered 0 -> spike -> 0. The
    // window survives those repeats and reports only on a real advance —
    // `speed === undefined` means "keep the last shown", so the caption
    // holds steady and the ETA counts down instead of resetting.
    const [baseline, speed] = nextSpeedSample(
      this.ticks.get(record.id),
      record.downloadedBytes,
      Date.now(),
    );
    this.ticks.set(record.id, baseline);
    const next: DownloadJob = {
      ...previous,
      status: nativeStateToJobStatus(record.state, record.error),
      downloadedBytes: record.downloadedBytes,
      // The worker adopts the server's total (PocketPal parity), so the
      // record — not the catalog value baked in at startDownload — is the
      // authority once it arrives.
      totalBytes: total,
      progress:
        total > 0 ? Math.round((record.downloadedBytes / total) * 100) : 0,
      error: record.error,
      errorCode: record.errorCode,
      ...(speed !== undefined ? { speedBytesPerSec: speed } : {}),
    };
    this.mirror.set(record.id, next);

    onProgress?.(next);
    this.callbacks.onProgress?.(next);

    // The event stream may deliver the same terminal record more than once;
    // claimTerminal keeps onComplete single-fire.
    if (claimTerminal(this.seenTerminal, record.id, record.state)) {
      const success = record.state === "completed";
      onComplete?.(next, success);
      this.callbacks.onComplete?.(next, success);
      // Delete the Room row NOW, not on removeJob: it persists the full
      // headers map — Authorization included (DownloadEntity.kt:49) — and
      // a terminal row keeps that token at rest for as long as it exists.
      // The mirror keeps the job for getJob; only the durable row (and its
      // headers) goes. Fire-and-forget: a failed delete must not re-fire
      // or block the completion.
      void this.native?.forgetDownload(record.id).catch(() => {});
    }
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
  }

  async cancelDownload(jobId: string): Promise<void> {
    await this.native?.cancelDownload(jobId);
    this.seenTerminal.add(jobId);
    this.ticks.delete(jobId);
    this.mirror.delete(jobId);
  }

  getJob(jobId: string): DownloadJob | null {
    return this.mirror.get(jobId) ?? null;
  }

  getAllJobs(): DownloadJob[] {
    return [...this.mirror.values()];
  }

  removeJob(jobId: string): void {
    this.seenTerminal.delete(jobId);
    this.ticks.delete(jobId);
    const job = this.mirror.get(jobId);
    this.mirror.delete(jobId);
    // Terminal is not forgotten. Without this the Room row survives the job,
    // the table grows one entry per download forever, and every cold start
    // re-reads all of it. Fire-and-forget: the mirror is already correct.
    if (job) void this.native?.forgetDownload(job.id).catch(() => {});
  }
}