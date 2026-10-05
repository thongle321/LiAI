/** Downloads slice: resumable GGUF downloads for on-device inference.
 *
 * Progress/completion always target the stored spec id (job.modelId), never
 * the raw preset/HF id the UI passed in — those differ, and targeting the
 * latter left cards stuck at "idle".
 */

import type { StateCreator } from "zustand";
import * as LegacyFileSystem from "expo-file-system/legacy";

import type { DownloadsSlice, ModelStore } from "./types";
import type { DownloadJob, PresetModel } from "../../types/models";
import type { HFModelSearchResult } from "../../types/models";
import {
  buildHfModelSpec,
  buildPresetModelSpec,
  HF_USER_AGENT,
  hfRefFromId,
  hfRefFromSearch,
  isHuggingFaceUrl,
} from "../../lib/models/huggingface";
import { downloadService } from "../../lib/download-service";
import { latestJobForModel } from "../../lib/models/download-jobs.ts";
import { resumeDataForPartial } from "../../lib/models/resume-state.ts";
import { asyncStorage, MEMORY_GUARD_KEY, generateId } from "./storage";

function hfRefFor(modelId: string, results: HFModelSearchResult[]) {
  const found = results.find((r) => r.modelId === modelId);
  return found ? hfRefFromSearch(found) : hfRefFromId(modelId);
}

function presetFor(modelId: string, presets: PresetModel[]): PresetModel {
  const preset = presets.find((p) => p.id === modelId);
  if (!preset) {
    throw new Error("Preset not found");
  }
  return preset;
}

/** Min gap between transient progress pushes to the store (~4 fps). The bar
 *  animates smoothly at this rate; the native tick can fire far faster. */
const PROGRESS_PUSH_MS = 250;
/** Last push time per model id, so throttle is per-download not global. */
const progressPushedAt = new Map<string, number>();

export const createDownloadsSlice: StateCreator<ModelStore, [], [], DownloadsSlice> = (
  set,
  get,
) => ({
  activeDownloads: new Map(),
  largestSuccessfulBytes: 0,

  saveMemoryGuard: async () => {
    try {
      await asyncStorage.setItem(
        MEMORY_GUARD_KEY,
        JSON.stringify(get().largestSuccessfulBytes),
      );
    } catch (e) {
      console.warn("Failed to save memory guard:", e);
    }
  },

  clearDownloadError: (specId) => {
    // The reason only — the failed state stays, so the row still says
    // Retry after the dialog is dismissed (C1).
    if (get().getModel(specId)?.error === undefined) return;
    get().updateModel(specId, { error: undefined });
  },

  startDownload: async (modelId, file, token) => {
    const spec =
      "path" in file
        ? buildHfModelSpec(hfRefFor(modelId, get().searchResults), file)
        : buildPresetModelSpec(presetFor(modelId, get().presets), file);
    await get().startSpecDownload(spec, file, token);
  },

  startSpecDownload: async (spec, file, token) => {
    const specId = spec.id;

    // One live job per model: double-taps and retries must not stack tasks
    // on the same file (stale entries made resume grab dead jobs and throw).
    const live = latestJobForModel(downloadService.getAllJobs(), specId);
    if (live && (live.status === "downloading" || live.status === "paused")) return;
    for (const stale of downloadService
      .getAllJobs()
      .filter((j) => j.modelId === specId)) {
      downloadService.removeJob(stale.id);
    }

    // Create the spec once; a re-download keeps its existing row.
    if (!get().getModel(specId)) {
      get().addModel(spec);
    }

    // A partial file means the app died mid-flight: continue from its
    // bytes (Range resume) instead of restarting from zero.
    let partialBytes = 0;
    try {
      const info = await LegacyFileSystem.getInfoAsync(
        `${LegacyFileSystem.documentDirectory}models/${file.name}`,
      );
      if (info.exists && "size" in info && typeof info.size === "number") {
        partialBytes = info.size;
      }
    } catch {
      // Unreadable destination: the transfer reports the truth.
    }
    const resume = resumeDataForPartial(partialBytes, file.size);
    const resumeProgress =
      resume !== null && file.size > 0
        ? Math.round((partialBytes / file.size) * 100)
        : 0;
    const auth = get().activeHfToken(token) ?? undefined;

    const job: DownloadJob = {
      id: `download-${generateId()}`,
      modelId: specId,
      fileName: file.name,
      downloadUrl: file.downloadUrl,
      // HF's CDN refuses anonymous clients: always identify (PocketPal
      // parity); the Bearer token rides along only to huggingface.co.
      headers: {
        "User-Agent": HF_USER_AGENT,
        ...(auth && isHuggingFaceUrl(file.downloadUrl)
          ? { Authorization: `Bearer ${auth}` }
          : {}),
      },
      destinationPath: `${LegacyFileSystem.documentDirectory}models/${file.name}`,
      status: "downloading",
      progress: resumeProgress,
      downloadedBytes: partialBytes,
      totalBytes: file.size,
      resumable: true,
    };

    get().updateModel(specId, {
      downloadStatus: "downloading",
      downloadProgress: resumeProgress,
      totalBytes: file.size,
      downloadedBytes: partialBytes,
      error: undefined,
    });

    // PocketPal parity: refuse before bytes move when the disk can't fit it.
    try {
      const free = await LegacyFileSystem.getFreeDiskStorageAsync();
      if (Number.isFinite(free) && free < file.size) {
        get().updateModel(specId, {
          downloadStatus: "failed",
          error: "Not enough storage space to download the model",
        });
        return;
      }
    } catch {
      // Unknown free space: attempt anyway, the transfer reports the truth.
    }

    // The service's callbacks are global (last registered wins); keying each
    // update off the job's own modelId makes re-registration harmless.
    downloadService.setProgressCallback((downloadJob) => {
      // Persist only on a real status transition (idle->downloading,
      // ->paused, ->failed). Progress bytes go through the transient path so
      // a many-per-second tick never hits AsyncStorage (the models screen
      // went unresponsive). Resume reads the partial file on disk, so a
      // slightly-stale in-memory bar never costs a byte.
      const prevStatus = get().getModel(downloadJob.modelId)?.downloadStatus;
      if (prevStatus !== downloadJob.status) {
        get().updateModel(downloadJob.modelId, {
          downloadStatus: downloadJob.status,
          error: downloadJob.error,
        });
      }
      // Throttle the transient push so the bar animates smoothly (~4 fps)
      // instead of re-rendering every preset card on every native tick.
      // pocketpal ships the unthrottled version; that is the hotspot.
      const now = Date.now();
      const last = progressPushedAt.get(downloadJob.modelId) ?? 0;
      if (now - last >= PROGRESS_PUSH_MS) {
        progressPushedAt.set(downloadJob.modelId, now);
        get().setModelProgress(downloadJob.modelId, {
          downloadProgress: downloadJob.progress,
          downloadedBytes: downloadJob.downloadedBytes,
          totalBytes: downloadJob.totalBytes,
          speedBytesPerSec: downloadJob.speedBytesPerSec,
        });
        // syncDownloadStatus builds a fresh Map and notifies subscribers, so
        // it rides the same throttle — running it every tick was the last
        // per-tick store notification.
        get().syncDownloadStatus();
      }
    });

    downloadService.setCompleteCallback((downloadJob, success) => {
      if (success) {
        get().updateModel(downloadJob.modelId, {
          downloadStatus: "completed",
          downloadProgress: 100,
          downloadedBytes: downloadJob.totalBytes,
          localPath: downloadJob.destinationPath,
        });
        // First download activates itself: no manual step, and a working
        // chat is never yanked away (only-when-none scope).
        if (!get().activeModelId) {
          get().setActiveModel(downloadJob.modelId, "local");
        }
        // ponytail: learn the ceiling from what actually succeeded.
        if (downloadJob.totalBytes > get().largestSuccessfulBytes) {
          set({ largestSuccessfulBytes: downloadJob.totalBytes });
          void get().saveMemoryGuard();
        }
      } else if (downloadJob.status !== "cancelled") {
        // A cancelled job is a user action, not a failure: without this
        // guard the cancel flow's own callback re-marked the row failed and
        // the card offered "Retry" instead of a clean "Download".
        get().updateModel(downloadJob.modelId, {
          downloadStatus: "failed",
          error: downloadJob.error,
        });
      }
      get().syncDownloadStatus();
    });

    try {
      await downloadService.startDownload(job, undefined, undefined, resume ?? undefined);
    } catch (error) {
      get().updateModel(specId, {
        downloadStatus: "failed",
        error: error instanceof Error ? error.message : "Download failed",
      });
    }
  },

  pauseDownload: async (jobId) => {
    await downloadService.pauseDownload(jobId);
    get().syncDownloadStatus();
  },

  resumeDownload: async (jobId) => {
    await downloadService.resumeDownload(jobId);
    get().syncDownloadStatus();
  },

  pauseModelDownload: async (specId) => {
    try {
      const job = latestJobForModel(downloadService.getAllJobs(), specId);
      if (!job) return;
      await get().pauseDownload(job.id);
    } catch {
      // Best-effort: the row keeps its last state, Retry restarts cleanly.
    }
  },

  resumeModelDownload: async (specId) => {
    try {
      const job = latestJobForModel(downloadService.getAllJobs(), specId);
      if (job) {
        await get().resumeDownload(job.id);
        return;
      }
    } catch {
      // Dead job handle: fall through to the partial-file resume below.
    }
    await get().resumeInterruptedDownload(specId);
  },

  cancelModelDownload: async (specId) => {
    // Cancel, not pause: the service deletes the partial file, so this
    // abandons the download rather than parking it. No fallback resume
    // path exists on purpose — there is nothing left on disk to resume.
    const job = latestJobForModel(downloadService.getAllJobs(), specId);
    if (!job) return;
    await get().cancelDownload(job.id);
  },

  resumeInterruptedDownload: async (specId) => {
    try {
      const spec = get().getModel(specId);
      const file = spec?.files[0];
      if (!spec || !file) return;
      await get().startSpecDownload(
      spec,
      file,
      get().activeHfToken() ?? undefined,
    );
    } catch {
      // Best-effort: the row keeps its state, tapping retries.
    }
  },

  reconcileInterrupted: async () => {
    const dir = `${LegacyFileSystem.documentDirectory}models/`;
    for (const spec of get().models) {
      if (spec.downloadStatus === "completed" || spec.origin === "remote_api") continue;
      const file = spec.files[0];
      if (!file || !(file.size > 0)) continue;
      try {
        const info = await LegacyFileSystem.getInfoAsync(dir + file.name);
        if (!info.exists || !("size" in info) || typeof info.size !== "number") continue;
        if (info.size >= file.size) {
          // Whole file on disk but never marked: killed at the finish line.
          get().updateModel(spec.id, {
            downloadStatus: "completed",
            downloadProgress: 100,
            downloadedBytes: file.size,
            totalBytes: file.size,
            localPath: dir + file.name,
            error: undefined,
          });
        } else if (resumeDataForPartial(info.size, file.size) !== null) {
          // Partial file: manual Resume continues it, nothing auto-starts.
          get().updateModel(spec.id, {
            downloadStatus: "paused",
            downloadProgress: Math.round((info.size / file.size) * 100),
            downloadedBytes: info.size,
            totalBytes: file.size,
            error: undefined,
          });
        }
      } catch {
        // Unreadable file: leave the row as loaded.
      }
    }
    get().syncDownloadStatus();
  },

  cancelDownload: async (jobId) => {
    const job = downloadService.getJob(jobId);
    // Reset AFTER the service resolves, not before: the service's terminal
    // "cancelled" event carries the last known byte count, so an early reset
    // was immediately overwritten and left a stale 40% on the row. Awaiting
    // first also keeps the card on its real state while the abort is in
    // flight, then it snaps straight to Download.
    await downloadService.cancelDownload(jobId);
    if (job) {
      get().updateModel(job.modelId, {
        downloadStatus: "idle",
        downloadProgress: 0,
        downloadedBytes: 0,
      });
    }
    get().syncDownloadStatus();
  },

  syncDownloadStatus: () => {
    const activeDownloads = new Map(
      downloadService.getAllJobs().map((job) => [job.id, job.status]),
    );
    set({ activeDownloads });
  },
});
