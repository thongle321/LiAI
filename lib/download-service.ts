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
  documentDirectory,
  type DownloadResumable,
  type DownloadProgressData,
} from "expo-file-system/legacy";
import type { DownloadJob } from "../types/models.ts";

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

class ResumableDownloadService {
  private activeDownloads: Map<string, {
    job: DownloadJob;
    task: DownloadResumable | null;
    progressCallback: DownloadProgressCallback;
    completeCallback: DownloadCompleteCallback;
  }> = new Map();

  /** Last progress mark per job: speed is bytes/dt, refreshed ≥500ms apart. */
  private speedMarks = new Map<string, { at: number; bytes: number; speed: number }>();

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
    const fail = (message: string): never => {
      const failedJob: DownloadJob = {
        ...job,
        status: "failed",
        error: message,
      };
      this.speedMarks.delete(job.id);
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
      throw new Error(message);
    };

    // Nullable: assigned inside startTask; closures run after it.
    let task: DownloadResumable | null = null;
    try {
      const destPath = getModelsDirectoryPath() + job.fileName;

      // Ensure directory exists (legacy API expects string)
      await makeDirectoryAsync(getModelsDirectoryPath(), { intermediates: true });

      const handleProgress = (progress: DownloadProgressData) => {
        const totalBytes = progress.totalBytesWritten;
        const expected = progress.totalBytesExpectedToWrite;
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
          { headers: job.headers },
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
      };

      let result = await startTask(resumeData).downloadAsync();

      if (!result) {
        reportPaused();
        return;
      }

      if (resumeData && result.status === 200) {
        try {
          await deleteAsync(destPath, { idempotent: true });
        } catch {
          // The fresh fetch below reports the truth.
        }
        result = await startTask().downloadAsync();
        if (!result) {
          reportPaused();
          return;
        }
      }

      if (result.status !== 200 && result.status !== 206) {
        fail(`HTTP ${result.status}`);
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
      this.speedMarks.delete(job.id);
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

    try {
      const result = await entry.task.resumeAsync();

      if (!result) {
        const pausedJob: DownloadJob = { ...entry.job, status: "paused" };
        this.activeDownloads.set(jobId, { ...entry, job: pausedJob });
        this.callbacks.onProgress?.(pausedJob);
        return;
      }

      if (result.status !== 200 && result.status !== 206) {
        throw new Error(`HTTP ${result.status}`);
      }

      {
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
      }
    } catch (error) {
      const failedJob: DownloadJob = {
        ...entry.job,
        status: "failed",
        error: error instanceof Error ? error.message : "Download failed",
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

    const cancelledJob: DownloadJob = {
      ...entry.job,
      status: "cancelled",
    };

    this.speedMarks.delete(jobId);
    this.activeDownloads.delete(jobId);
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
    this.speedMarks.delete(jobId);
    this.activeDownloads.delete(jobId);
  }
}

// Singleton instance
export const downloadService = new ResumableDownloadService();
export { ResumableDownloadService };