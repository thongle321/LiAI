/** Resumable download service using expo-file-system DownloadTask. */

import { File, Directory, Paths, DownloadTask, DownloadProgress } from "expo-file-system";
import { makeDirectoryAsync, deleteAsync, documentDirectory } from "expo-file-system/legacy";
import type { DownloadJob } from "../types/models.ts";

export interface DownloadProgressCallback {
  (job: DownloadJob): void;
}

export interface DownloadCompleteCallback {
  (job: DownloadJob, success: boolean): void;
}

function getModelsDirectoryPath(): string {
  // Use legacy documentDirectory for string path operations
  return (documentDirectory ?? "") + "models/";
}

function getModelsDirectory(): Directory {
  return new Directory(Paths.document, "models");
}

class ResumableDownloadService {
  private activeDownloads: Map<string, {
    job: DownloadJob;
    task: DownloadTask | null;
    progressCallback: DownloadProgressCallback;
    completeCallback: DownloadCompleteCallback;
  }> = new Map();

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

  /** Start a new download */
  async startDownload(
    job: DownloadJob,
    progressCallback?: DownloadProgressCallback,
    completeCallback?: DownloadCompleteCallback,
  ): Promise<void> {
    const onProgress = progressCallback || (() => {});
    const onComplete = completeCallback || (() => {});
    const fail = (message: string): never => {
      const failedJob: DownloadJob = {
        ...job,
        status: "failed",
        error: message,
      };
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

    let file: File;
    let task: DownloadTask;
    try {
      const modelsDir = getModelsDirectory();
      file = new File(modelsDir, job.fileName);

      // Ensure directory exists (legacy API expects string)
      await makeDirectoryAsync(getModelsDirectoryPath(), { intermediates: true });

      task = new DownloadTask(job.downloadUrl, file, {
        headers: job.headers,
        onProgress: (progress: DownloadProgress) => {
          const totalBytes = progress.bytesWritten;
          const progressPercent =
            job.totalBytes > 0 ? Math.round((totalBytes / job.totalBytes) * 100) : 0;
          const updatedJob: DownloadJob = {
            ...job,
            status: "downloading",
            progress: progressPercent,
            downloadedBytes: totalBytes,
            totalBytes: job.totalBytes || progress.totalBytes,
          };
          this.activeDownloads.set(job.id, {
            job: updatedJob,
            task,
            progressCallback: onProgress,
            completeCallback: onComplete,
          });
          onProgress(updatedJob);
          this.callbacks.onProgress?.(updatedJob);
        },
      });

      this.activeDownloads.set(job.id, {
        job: { ...job, status: "downloading" },
        task,
        progressCallback: onProgress,
        completeCallback: onComplete,
      });

      const result = await task.downloadAsync();

      if (!result) {
        // Paused before completion: keep the task so resume works, and
        // report paused instead of sticking at downloading forever.
        const pausedJob: DownloadJob = { ...job, status: "paused" };
        this.activeDownloads.set(job.id, {
          job: pausedJob,
          task,
          progressCallback: onProgress,
          completeCallback: onComplete,
        });
        onProgress(pausedJob);
        this.callbacks.onProgress?.(pausedJob);
        return;
      }

      const completedJob: DownloadJob = {
        ...job,
        status: "completed",
        progress: 100,
        downloadedBytes: job.totalBytes,
        resumable: true,
      };
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

    entry.task.pause();

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

  /** Resume a paused download */
  async resumeDownload(jobId: string): Promise<void> {
    const entry = this.activeDownloads.get(jobId);
    if (!entry || !entry.task) {
      throw new Error("Download not found or not resumable");
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

      if (result) {
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
      entry.task.cancel();
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
    this.activeDownloads.delete(jobId);
  }
}

// Singleton instance
export const downloadService = new ResumableDownloadService();
export { ResumableDownloadService };