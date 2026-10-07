/** Resumable download service (PocketPal semantics, Expo-idiomatic).
 *
 * PocketPal downloads GGUFs with progress + pause/resume through its own
 * native module (RNFS on iOS, a DownloadModule TurboModule on Android).
 * The Expo equivalent is the legacy DownloadResumable path — same shape
 * (headers, progress callback, pause/resume/cancel), one shared native
 * FileSystem module, no custom native code.
 */

import {
  createDownloadResumable,
  makeDirectoryAsync,
  deleteAsync,
  getInfoAsync,
  getFreeDiskStorageAsync,
  documentDirectory,
  FileSystemSessionType,
  type DownloadResumable,
  type DownloadProgressData,
} from "expo-file-system/legacy";
import type { DownloadErrorCode, DownloadJob } from "../types/models.ts";
import {
  describeHttpFailure,
  errorCodeForStatus,
  isRetryableStatus,
  MAX_ATTEMPTS,
  retryAfterMs,
} from "./models/http-retry.ts";

/** A failure that carries a machine-readable kind, so the UI can offer the
 *  right recovery instead of pattern-matching an English sentence. An
 *  explicit field, NOT a constructor parameter property: node's
 *  strip-only type stripping (node --test) rejects parameter properties. */
class DownloadFailure extends Error {
  readonly code?: DownloadErrorCode;
  constructor(message: string, code?: DownloadErrorCode) {
    super(message);
    this.name = "DownloadFailure";
    this.code = code;
  }
}

/** Read the kind off whatever the service threw, if it carried one. */
export function failureCode(error: unknown): DownloadErrorCode | undefined {
  return error instanceof DownloadFailure ? error.code : undefined;
}

export interface DownloadProgressCallback {
  (job: DownloadJob): void;
}

export interface DownloadCompleteCallback {
  (job: DownloadJob, success: boolean): void;
}

function getModelsDirectoryPath(): string {
  // Use legacy documentDirectory for string path operations
  return `${documentDirectory ?? ""}models/`;
}

/** How often the free-space poll runs during a live transfer. Slow on
 *  purpose (PocketPal's useStorageCheck.ts:20-24): this is a backstop, not a
 *  progress signal, and a disk stat costs nothing to do rarely. */
const SPACE_CHECK_MS = 10_000;

/** Backoff between retry attempts. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ResumableDownloadService {
  private activeDownloads: Map<string, {
    job: DownloadJob;
    task: DownloadResumable | null;
    progressCallback: DownloadProgressCallback;
    completeCallback: DownloadCompleteCallback;
  }> = new Map();

  /** Last progress mark per job: speed is bytes/dt, refreshed ≥500ms apart. */
  private speedMarks = new Map<string, { at: number; bytes: number; speed: number }>();

  /** Last emit per job, ms. PocketPal parity (DownloadWorker.kt:230-240,
   *  iOS `progressInterval: 800` at DownloadManager.ts:337): the byte loop,
   *  not the socket, decides progress frequency. expo throttles its Android
   *  emitter to 100ms but its iOS one not at all
   *  (FileSystemLegacyModule.swift:265 fires sendEvent per didWriteData), so
   *  the flood lands in JS unthrottled — thousands of object spreads a
   *  second, which saturates the JS thread and lags every screen. Gating
   *  here is the one place every tick passes through. */
  private lastEmit = new Map<string, number>();

  /** Jobs the user is actively cancelling. expo's cancelAsync() pauses the
   * in-flight task, so its downloadAsync() resolves null and would report
   * "paused" — a card that flashed Paused (with a live Cancel button) for a
   * frame before flipping to Download. While cancelling, the service knows
   * better than the native layer, so it stays silent and lets the terminal
   * "cancelled" event be the only status the UI ever sees. */
  private cancelling = new Set<string>();

  private trackSpeed(jobId: string, totalBytes: number): number {
    const now = Date.now();
    const prev = this.speedMarks.get(jobId);
    if (prev && now - prev.at >= 500 && now > prev.at) {
      const speed = Math.max(0, (totalBytes - prev.bytes) / ((now - prev.at) / 1000));
      this.speedMarks.set(jobId, { at: now, bytes: totalBytes, speed });
      return speed;
    }
    if (!prev) this.speedMarks.set(jobId, { at: now, bytes: totalBytes, speed: 0 });
    return prev?.speed ?? 0;
  }

  /** PocketParity: nothing downstream can ask for progress faster than this,
   *  so subscribers stay cheap enough to sit on top of the whole store. */
  private static readonly EMIT_MS = 800;

  /** Drop the per-download bookkeeping a terminal job no longer needs. */
  private forget(jobId: string): void {
    this.speedMarks.delete(jobId);
    this.lastEmit.delete(jobId);
  }

  /** Live free-space poll while bytes are moving. PocketPal parity:
   *  useStorageCheck.ts:20-24, :88-92 — a slow timer of its own, never a
   *  per-tick disk read. The pre-flight check in startSpecDownload answers
   *  "can this fit at all"; this answers "is it still fitting", which is a
   *  different question when a 4 GB pull meets a 4.1 GB phone. */
  private spaceWatch: ReturnType<typeof setInterval> | null = null;

  private startSpaceWatch(): void {
    if (this.spaceWatch) return;
    this.spaceWatch = setInterval(() => {
      void this.checkFreeSpace();
    }, SPACE_CHECK_MS);
  }

  private stopSpaceWatchIfIdle(): void {
    if (!this.spaceWatch) return;
    if (this.getAllJobs().some((j) => j.status === "downloading")) return;
    clearInterval(this.spaceWatch);
    this.spaceWatch = null;
  }

  private async checkFreeSpace(): Promise<void> {
    const live = this.getAllJobs().filter((j) => j.status === "downloading");
    if (live.length === 0) {
      this.stopSpaceWatchIfIdle();
      return;
    }
    let free: number;
    try {
      free = await getFreeDiskStorageAsync();
    } catch {
      // Unknown free space: the transfer reports the truth, as pre-flight does.
      return;
    }
    if (!Number.isFinite(free)) return;
    for (const job of live) {
      const remaining = job.totalBytes - job.downloadedBytes;
      // The partial is kept, so freeing space and tapping Resume continues
      // from here rather than starting the gigabytes again.
      if (remaining > 0 && free < remaining) {
        await this.failJob(
          job.id,
          "Not enough storage space to finish this download — free some up, then Resume",
        );
      }
    }
  }

  /** Terminal failure that keeps the partial on disk, for the cases where
   *  resuming is still the right story (unlike cancel, which abandons). */
  private async failJob(jobId: string, message: string): Promise<void> {
    const entry = this.activeDownloads.get(jobId);
    if (!entry) return;
    this.forget(jobId);
    if (entry.task) {
      // pauseAsync() resolves the in-flight downloadAsync() to null, which
      // lands in reportPaused() and would flip the row from "failed" straight
      // back to "paused". The cancelling flag is the existing guard for that
      // (see cancelDownload), so this borrows it rather than adding a second
      // mechanism.
      this.cancelling.add(jobId);
      // Stop the bytes first: a job marked failed while the socket is live
      // keeps writing into a file the row no longer claims to be tracking.
      await entry.task.pauseAsync().catch(() => {});
    }
    const failedJob: DownloadJob = { ...entry.job, status: "failed", error: message };
    this.activeDownloads.set(jobId, { ...entry, job: failedJob, task: null });
    entry.progressCallback(failedJob);
    entry.completeCallback(failedJob, false);
    this.callbacks.onProgress?.(failedJob);
    this.callbacks.onComplete?.(failedJob, false);
    this.stopSpaceWatchIfIdle();
    // Cleared only AFTER the terminal event is published: whichever order the
    // native side resolves the paused downloadAsync() in, reportPaused now
    // either ran before this block (and "failed" overwrote it) or runs after
    // (and the flag swallows it). Clearing earlier loses that second case.
    this.cancelling.delete(jobId);
  }

  private callbacks: {
    onProgress?: DownloadProgressCallback;
    onComplete?: DownloadCompleteCallback;
  } = {};

  /** Set global progress callback */
  setProgressCallback(callback: DownloadProgressCallback): void {
    this.callbacks.onProgress = callback;
  }

  /** Set global complete callback */
  setCompleteCallback(callback: DownloadCompleteCallback): void {
    this.callbacks.onComplete = callback;
  }

  /** Start a new download.
   *
   * resumeData continues a partial file (`Range: bytes=N-`, native
   * append) after the app died mid-flight — the Expo equivalent of
   * PocketPal's worker resume. When the server ignores Range (200
   * instead of 206) the partial is dropped and fetched cleanly, once:
   * appending a full body onto a partial would corrupt the GGUF.
   */
  async startDownload(
    job: DownloadJob,
    progressCallback?: DownloadProgressCallback,
    completeCallback?: DownloadCompleteCallback,
    resumeData?: string,
  ): Promise<void> {
    const onProgress = progressCallback || (() => {});
    const onComplete = completeCallback || (() => {});
    const fail = (message: string, code?: DownloadErrorCode): never => {
      const failedJob: DownloadJob = {
        ...job,
        status: "failed",
        error: message,
        errorCode: code,
      };
      this.forget(job.id);
      this.activeDownloads.set(job.id, {
        job: failedJob,
        task: this.activeDownloads.get(job.id)?.task ?? null,
        progressCallback: onProgress,
        completeCallback: onComplete,
      });
      onProgress(failedJob);
      onComplete(failedJob, false);
      this.callbacks.onProgress?.(failedJob);
      this.callbacks.onComplete?.(failedJob, false);
      this.stopSpaceWatchIfIdle();
      throw new Error(message);
    };

    // Nullable: assigned inside startTask; closures run after it.
    let task: DownloadResumable | null = null;
    try {
      const destPath = getModelsDirectoryPath() + job.fileName;

      // Ensure directory exists (legacy API expects string)
      await makeDirectoryAsync(getModelsDirectoryPath(), { intermediates: true });
      this.startSpaceWatch();

      const handleProgress = (progress: DownloadProgressData) => {
        if (this.cancelling.has(job.id)) return;
        const totalBytes = progress.totalBytesWritten;
        const expected = progress.totalBytesExpectedToWrite;
        // The throttle, before any allocation. A completed transfer always
        // gets its last tick through, same guard as the Android emitter's
        // `|| totalBytesWritten == totalBytesExpectedToWrite`.
        const now = Date.now();
        const last = this.lastEmit.get(job.id) ?? 0;
        if (now - last < ResumableDownloadService.EMIT_MS && totalBytes !== expected) {
          return;
        }
        this.lastEmit.set(job.id, now);
        const progressPercent =
          job.totalBytes > 0 ? Math.round((totalBytes / job.totalBytes) * 100) : 0;
        const updatedJob: DownloadJob = {
          ...job,
          status: "downloading",
          progress: progressPercent,
          downloadedBytes: totalBytes,
          totalBytes: job.totalBytes || expected,
          speedBytesPerSec: this.trackSpeed(job.id, totalBytes),
        };
        this.activeDownloads.set(job.id, {
          job: updatedJob,
          task: this.activeDownloads.get(job.id)?.task ?? null,
          progressCallback: onProgress,
          completeCallback: onComplete,
        });
        onProgress(updatedJob);
        this.callbacks.onProgress?.(updatedJob);
      };

      const startTask = (resume?: string): DownloadResumable => {
        const next = createDownloadResumable(
          job.downloadUrl,
          destPath,
          // A 4 GB pull outlives a foreground app. BACKGROUND hands the
          // transfer to a native session that keeps going when the app is
          // backgrounded, which is the difference between a download that
          // finishes and one that dies the moment the user switches apps
          // (PocketPal's DownloadWorker.kt:33 runs the same idea in a
          // WorkManager worker).
          //
          // Two consequences, both accepted:
          //  - Progress callbacks STOP while backgrounded and resume on
          //    foreground (FileSystem.d.ts:161-163). The bar freezes and
          //    catches up; nothing is lost, and reconcileInterrupted
          //    re-stats the file if the app was killed outright.
          //  - The native session retries a dead connection itself rather
          //    than failing, so the JS retry loop below is the backstop for
          //    the foreground case, not the primary recovery.
          //
          // Android currently ignores sessionType (no handling in
          // FileSystemLegacyModule.kt), so this buys iOS only today. Passing
          // it unconditionally costs nothing and picks up Android support
          // for free if expo adds it.
          { headers: job.headers, sessionType: FileSystemSessionType.BACKGROUND },
          handleProgress,
          resume,
        );
        task = next;
        this.activeDownloads.set(job.id, {
          job: { ...job, status: "downloading" },
          task: next,
          progressCallback: onProgress,
          completeCallback: onComplete,
        });
        return next;
      };

      const reportPaused = (): void => {
        // A cancel in progress resolves this same null path. Reporting
        // "paused" then would resurrect the card's Cancel button mid-abort.
        if (this.cancelling.has(job.id)) return;
        // Paused before completion: keep the task so resume works, and
        // report paused instead of sticking at downloading forever.
        const pausedJob: DownloadJob = { ...job, status: "paused" };
        this.activeDownloads.set(job.id, {
          job: pausedJob,
          task: this.activeDownloads.get(job.id)?.task ?? null,
          progressCallback: onProgress,
          completeCallback: onComplete,
        });
        onProgress(pausedJob);
        this.callbacks.onProgress?.(pausedJob);
        this.stopSpaceWatchIfIdle();
      };

      // Retry loop (PocketPal parity: DownloadWorker.kt:285 retries 5xx with
      // exponential backoff; :145 fails 4xx outright).
      //
      // The invariant every branch below defends: after the native writer has
      // run, the bytes on disk are whatever the server sent — appended onto
      // the partial when a resume token was used (FileOutputStream(file,
      // isResume), FileSystemLegacyModule.kt:926-927), and the writer never
      // checks the status. So a non-2xx body or an ignored Range both leave a
      // corrupt file, and the only safe move is to delete and re-request.
      let result: Awaited<ReturnType<DownloadResumable["downloadAsync"]>>;
      let complete = false;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        // Only the first attempt may resume. A retry starts clean precisely
        // because the failed body is already in the file.
        const usedResume = attempt === 0 && resumeData != null;
        result = await startTask(usedResume ? (resumeData ?? undefined) : undefined).downloadAsync();

        if (!result) {
          reportPaused();
          return;
        }

        if (usedResume && result.status === 200) {
          // The server ignored our Range and sent the whole file, which the
          // writer just APPENDED to the partial. That file is corrupt, so it
          // goes; the next attempt is fresh (usedResume is false by then) and
          // costs one attempt, which is honest — it is a second request.
          await deleteAsync(destPath, { idempotent: true }).catch(() => {});
          continue;
        }

        if (result.status === 200 || result.status === 206) {
          complete = true;
          break;
        }

        await deleteAsync(destPath, { idempotent: true }).catch(() => {});
        if (!isRetryableStatus(result.status) || attempt === MAX_ATTEMPTS - 1) {
          fail(describeHttpFailure(result.status), errorCodeForStatus(result.status));
        }
        // Throttle or blip: wait as long as the server asked, else our curve.
        await sleep(retryAfterMs(result.headers, attempt));
        // The tracked row is the authority on whether this transfer should
        // still be running. A cancel, a disk-full failJob, or a pause all move
        // it off "downloading", and the loop must not fire a fresh request
        // for a job the row has already settled.
        if (this.activeDownloads.get(job.id)?.job.status !== "downloading") return;
      }

      if (!complete || !result) {
        // Attempts ran out on the ignored-Range refetch. The partial is
        // already deleted above, so there is nothing to resume and nothing
        // corrupt left behind.
        await deleteAsync(destPath, { idempotent: true }).catch(() => {});
        fail("Download did not complete — tap Retry");
      }

      // Trust-but-verify: a short/overlong file must never read completed.
      // Retry re-stats the partial and resumes (or restarts when useless).
      if (job.totalBytes > 0) {
        try {
          const info = await getInfoAsync(destPath);
          const actual =
            info.exists && "size" in info && typeof info.size === "number" ? info.size : -1;
          if (actual !== job.totalBytes) {
            fail(
              `Size mismatch (${actual} of ${job.totalBytes} bytes) — tap Retry to continue`,
            );
          }
        } catch (error) {
          if (error instanceof Error && error.message.startsWith("Size mismatch")) throw error;
          // Unreadable destination: the next launch re-stats it.
        }
      }

      const completedJob: DownloadJob = {
        ...job,
        status: "completed",
        progress: 100,
        downloadedBytes: job.totalBytes,
        resumable: true,
      };
      this.forget(job.id);
      this.activeDownloads.set(job.id, {
        job: completedJob,
        task,
        progressCallback: onProgress,
        completeCallback: onComplete,
      });
      onProgress(completedJob);
      onComplete(completedJob, true);
      this.callbacks.onProgress?.(completedJob);
      this.callbacks.onComplete?.(completedJob, true);
      this.stopSpaceWatchIfIdle();
    } catch (error) {
      fail(error instanceof Error ? error.message : "Download failed");
    }
  }

  /** Pause a download */
  async pauseDownload(jobId: string): Promise<DownloadJob | null> {
    const entry = this.activeDownloads.get(jobId);
    if (!entry || !entry.task) {
      return null;
    }

    await entry.task.pauseAsync();

    const pausedJob: DownloadJob = {
      ...entry.job,
      status: "paused",
    };

    this.activeDownloads.set(jobId, {
      ...entry,
      job: pausedJob,
    });

    this.callbacks.onProgress?.(pausedJob);
    return pausedJob;
  }

  /** Resume a paused download.
   *
   * Idempotent on terminal/live states so stale UI taps can't throw:
   * completed re-fires success, downloading is a no-op. Only a missing
   * task or a dead (failed/cancelled) entry rejects — those need a
   * fresh startDownload, which the UI's Retry path already performs.
   */
  async resumeDownload(jobId: string): Promise<void> {
    const entry = this.activeDownloads.get(jobId);
    if (!entry || !entry.task) {
      throw new Error("Download not found or not resumable");
    }

    if (entry.job.status === "completed") {
      this.callbacks.onProgress?.(entry.job);
      this.callbacks.onComplete?.(entry.job, true);
      return;
    }

    if (entry.job.status === "downloading") {
      return;
    }

    if (entry.job.status !== "paused") {
      throw new Error("Download is not paused");
    }

    // Update status to downloading
    const resumedJob: DownloadJob = {
      ...entry.job,
      status: "downloading",
    };

    this.activeDownloads.set(jobId, {
      ...entry,
      job: resumedJob,
    });

    this.callbacks.onProgress?.(resumedJob);
    this.startSpaceWatch();

    try {
      const result = await entry.task.resumeAsync();

      if (!result) {
        const pausedJob: DownloadJob = { ...entry.job, status: "paused" };
        this.activeDownloads.set(jobId, { ...entry, job: pausedJob });
        this.callbacks.onProgress?.(pausedJob);
        return;
      }

      // A resume that comes back 200 did NOT honour our Range: the server sent
      // the whole file and the native writer APPENDED it to the partial
      // (FileSystemLegacyModule.kt:926-927). That file is corrupt and the old
      // code read it as a success. There is no clean way to salvage an append
      // whose seam we cannot see, so it goes; Retry restarts from scratch.
      const ignoredRange = result.status === 200;
      // Anything other than 206 here is either that case or an error, and in
      // both the body the server just sent is already sitting in the file.
      if (ignoredRange || result.status !== 206) {
        await deleteAsync(getModelsDirectoryPath() + entry.job.fileName, {
          idempotent: true,
        }).catch(() => {});
        throw new DownloadFailure(
          ignoredRange
            ? "The server restarted this file instead of resuming — tap Retry to start it again"
            : describeHttpFailure(result.status),
          errorCodeForStatus(result.status),
        );
      }

      // Trust-but-verify, matching the fresh path: a resume that produced the
      // wrong length is corrupt, however cleanly it reported.
      if (entry.job.totalBytes > 0) {
        const info = await getInfoAsync(
          getModelsDirectoryPath() + entry.job.fileName,
        ).catch(() => null);
        const actual =
          info?.exists && "size" in info && typeof info.size === "number" ? info.size : -1;
        if (actual !== -1 && actual !== entry.job.totalBytes) {
          await deleteAsync(getModelsDirectoryPath() + entry.job.fileName, {
            idempotent: true,
          }).catch(() => {});
          throw new Error(
            `Size mismatch (${actual} of ${entry.job.totalBytes} bytes) — tap Retry to continue`,
          );
        }
      }

      const completedJob: DownloadJob = {
        ...entry.job,
        status: "completed",
        progress: 100,
        downloadedBytes: entry.job.totalBytes,
      };

      this.activeDownloads.set(jobId, {
        ...entry,
        job: completedJob,
      });

      this.callbacks.onProgress?.(completedJob);
      this.callbacks.onComplete?.(completedJob, true);
      this.stopSpaceWatchIfIdle();
    } catch (error) {
      const failedJob: DownloadJob = {
        ...entry.job,
        status: "failed",
        error: error instanceof Error ? error.message : "Download failed",
        errorCode: failureCode(error),
      };

      this.activeDownloads.set(jobId, {
        ...entry,
        job: failedJob,
      });

      this.callbacks.onProgress?.(failedJob);
      this.callbacks.onComplete?.(failedJob, false);

      throw error;
    }
  }

  /** Cancel a download and delete partial file */
  async cancelDownload(jobId: string): Promise<void> {
    const entry = this.activeDownloads.get(jobId);
    if (!entry) {
      return;
    }

    // Mark cancelling BEFORE touching the task: cancelAsync() resolves the
    // in-flight downloadAsync() to null, which lands in reportPaused while
    // we are still awaiting here. The flag is what suppresses that.
    this.cancelling.add(jobId);
    try {
      if (entry.task) {
        await entry.task.cancelAsync();
      }

      // Delete partial file (legacy API expects string)
      const filePath = getModelsDirectoryPath() + entry.job.fileName;

      try {
        await deleteAsync(filePath, { idempotent: true });
      } catch {
        // Ignore deletion errors
      }
    } finally {
      // Cleared only after the terminal event is published below, so the
      // "cancelled" status can never be swallowed by the guard.
      this.cancelling.delete(jobId);
    }

    const cancelledJob: DownloadJob = {
      ...entry.job,
      status: "cancelled",
    };

    this.forget(jobId);
    this.activeDownloads.delete(jobId);
    this.stopSpaceWatchIfIdle();
    this.callbacks.onProgress?.(cancelledJob);
    this.callbacks.onComplete?.(cancelledJob, false);
  }

  /** Get current job status */
  getJob(jobId: string): DownloadJob | null {
    return this.activeDownloads.get(jobId)?.job || null;
  }

  /** Get all active downloads */
  getAllJobs(): DownloadJob[] {
    return Array.from(this.activeDownloads.values()).map((e) => e.job);
  }

  /** Check if a download is active */
  isDownloading(jobId: string): boolean {
    const job = this.activeDownloads.get(jobId)?.job;
    return job?.status === "downloading";
  }

  /** Delete a completed/failed/cancelled download from tracking */
  removeJob(jobId: string): void {
    this.forget(jobId);
    this.activeDownloads.delete(jobId);
    this.stopSpaceWatchIfIdle();
  }
}

// Singleton instance
export const downloadService = new ResumableDownloadService();
export { ResumableDownloadService };