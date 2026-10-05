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
import { findProjectorFile, pairDownloadStep } from "../../lib/models/vision-pairing.ts";
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
    const isHf = "path" in file;
    const spec = isHf
      ? buildHfModelSpec(hfRefFor(modelId, get().searchResults), file)
      : buildPresetModelSpec(presetFor(modelId, get().presets), file);
    // Vision pairing (vision-series 01): the card already promises the
    // pair — now the downloader fetches it. Same helper as the card, so
    // the promise and the fetch can never drift. A repo with no mmproj
    // records no projector, and nothing about the download changes.
    const siblings = isHf
      ? (get().searchResults.find((r) => r.modelId === modelId)?.ggufFiles ??
        [])
      : presetFor(modelId, get().presets).files;
    const projector = findProjectorFile(file, siblings);
    if (projector) {
      spec.projector = {
        name: projector.name,
        size: projector.size,
        downloadUrl: projector.downloadUrl,
      };
    }
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
    const existing = get().getModel(specId);

    // Bytes on disk per file, so the pair's legs resume independently.
    // A partial file means the app died mid-flight: continue from its
    // bytes (Range resume) instead of restarting from zero.
    const onDiskBytes = async (name: string): Promise<number> => {
      try {
        const info = await LegacyFileSystem.getInfoAsync(
          `${LegacyFileSystem.documentDirectory}models/${name}`,
        );
        return info.exists && "size" in info && typeof info.size === "number"
          ? info.size
          : 0;
      } catch {
        // Unreadable destination: the transfer reports the truth.
        return 0;
      }
    };
    const mainBytes = await onDiskBytes(file.name);
    const projectorBytes = spec.projector
      ? await onDiskBytes(spec.projector.name)
      : 0;

    // Pair sequencing (vision-series 01): a whole main file on disk starts
    // the projector leg (the post-main handoff and the Retry path after a
    // projector failure); EVERYTHING on disk means "completed" — never a
    // full re-download of a finished file.
    const step = pairDownloadStep(
      spec.projector !== undefined,
      file.size > 0 && mainBytes >= file.size,
      spec.projector !== undefined && projectorBytes >= (spec.projector?.size ?? 1),
    );
    // Create/heal the row ONLY after the disk read (spec-review fix): a
    // completed row that heals its projector record before the truth is
    // known would briefly report can-see against a missing file.
    if (!existing) {
      get().addModel(spec);
    } else if (spec.projector && !existing.projector) {
      get().updateModel(specId, { projector: spec.projector });
    }
    if (step === "complete") {
      get().updateModel(specId, {
        downloadStatus: "completed",
        downloadProgress: 100,
        downloadedBytes: file.size,
        totalBytes: file.size,
        localPath: `${LegacyFileSystem.documentDirectory}models/${file.name}`,
        error: undefined,
      });
      return;
    }

    // This leg's file: the projector after the main leg, else the main.
    const activeFile = step === "projector" && spec.projector ? spec.projector : file;
    const partialBytes = activeFile === file ? mainBytes : projectorBytes;
    const resume = resumeDataForPartial(partialBytes, activeFile.size);
    const resumeProgress =
      resume !== null && activeFile.size > 0
        ? Math.round((partialBytes / activeFile.size) * 100)
        : 0;
    const auth = get().activeHfToken(token) ?? undefined;

    const job: DownloadJob = {
      id: `download-${generateId()}`,
      modelId: specId,
      fileName: activeFile.name,
      downloadUrl: activeFile.downloadUrl,
      // HF's CDN refuses anonymous clients: always identify (PocketPal
      // parity); the Bearer token rides along only to huggingface.co.
      headers: {
        "User-Agent": HF_USER_AGENT,
        ...(auth && isHuggingFaceUrl(activeFile.downloadUrl)
          ? { Authorization: `Bearer ${auth}` }
          : {}),
      },
      destinationPath: `${LegacyFileSystem.documentDirectory}models/${activeFile.name}`,
      status: "downloading",
      progress: resumeProgress,
      downloadedBytes: partialBytes,
      totalBytes: activeFile.size,
      resumable: true,
    };

    get().updateModel(specId, {
      downloadStatus: "downloading",
      downloadProgress: resumeProgress,
      totalBytes: activeFile.size,
      downloadedBytes: partialBytes,
      error: undefined,
    });

    // PocketPal parity: refuse before bytes move when the disk can't fit it.
    try {
      const free = await LegacyFileSystem.getFreeDiskStorageAsync();
      if (Number.isFinite(free) && free < activeFile.size) {
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
      const specNow = get().getModel(downloadJob.modelId);
      // Pair handoff (vision-series 01): the MAIN leg finishing while a
      // projector is still missing does NOT complete the model — the
      // projector leg starts (startSpecDownload re-reads the disk and
      // takes the "projector" step), and completion belongs to THAT leg.
      if (
        success &&
        specNow?.projector !== undefined &&
        downloadJob.fileName === specNow?.files[0]?.name
      ) {
        void get().startSpecDownload(
          specNow,
          specNow.files[0],
          get().activeHfToken() ?? undefined,
        );
        return;
      }
      if (success) {
        // Final completion (main-only model, or the projector leg): the
        // row carries the MAIN file's stats — the load-guard ceiling is
        // the model's footprint, not the projector's, and localPath is
        // where the engine loads from.
        const mainFile = specNow?.files[0];
        const mainSize = mainFile?.size ?? downloadJob.totalBytes;
        get().updateModel(downloadJob.modelId, {
          downloadStatus: "completed",
          downloadProgress: 100,
          downloadedBytes: mainSize,
          totalBytes: mainSize,
          localPath: mainFile
            ? `${LegacyFileSystem.documentDirectory}models/${mainFile.name}`
            : downloadJob.destinationPath,
        });
        // First download activates itself: no manual step, and a working
        // chat is never yanked away (only-when-none scope).
        if (!get().activeModelId) {
          get().setActiveModel(downloadJob.modelId, "local");
        }
        // ponytail: learn the ceiling from what actually succeeded.
        if (mainSize > get().largestSuccessfulBytes) {
          set({ largestSuccessfulBytes: mainSize });
          void get().saveMemoryGuard();
        }
      } else if (downloadJob.status !== "cancelled") {
        // A cancelled job is a user action, not a failure: without this
        // guard the cancel flow's own callback re-marked the row failed and
        // the card offered "Retry" instead of a clean "Download".
        // A projector-leg failure names itself, so the retry story is
        // readable (Retry re-runs only the projector leg).
        const message =
          specNow?.projector !== undefined &&
          downloadJob.fileName === specNow?.projector?.name
            ? `The projector for this vision model failed: ${downloadJob.error ?? "download failed"}`
            : downloadJob.error;
        get().updateModel(downloadJob.modelId, {
          downloadStatus: "failed",
          error: message,
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
