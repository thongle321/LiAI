/** Downloads slice: resumable GGUF downloads + backend upload.
 *
 * Progress/completion always target the stored spec id (job.modelId), never
 * the raw preset/HF id the UI passed in — those differ, and targeting the
 * latter left cards stuck at "idle".
 */

import type { StateCreator } from "zustand";
import * as LegacyFileSystem from "expo-file-system/legacy";

import type { DownloadsSlice, ModelStore } from "./types";
import type { DownloadJob, PresetModel, PresetModelFile } from "../../types/models";
import type { HFModelSearchResult } from "../../types/models";
import {
  buildHfModelSpec,
  buildPresetModelSpec,
  hfRefFromId,
  hfRefFromSearch,
} from "../../lib/models/huggingface";
import { downloadService } from "../../lib/download-service";
import { uploadService } from "../../lib/upload-service";
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

  startDownload: async (modelId, file, token) => {
    const spec =
      "path" in file
        ? buildHfModelSpec(hfRefFor(modelId, get().searchResults), file)
        : buildPresetModelSpec(presetFor(modelId, get().presets), file);
    const specId = spec.id;

    // Create the spec once; a re-download keeps its existing row.
    if (!get().getModel(specId)) {
      get().addModel(spec);
    }

    const job: DownloadJob = {
      id: `download-${generateId()}`,
      modelId: specId,
      fileName: file.name,
      downloadUrl: file.downloadUrl,
      destinationPath: `${LegacyFileSystem.documentDirectory}models/${file.name}`,
      status: "downloading",
      progress: 0,
      downloadedBytes: 0,
      totalBytes: file.size,
      resumable: true,
    };

    get().updateModel(specId, {
      downloadStatus: "downloading",
      downloadProgress: 0,
      totalBytes: file.size,
      downloadedBytes: 0,
    });

    // The service's callbacks are global (last registered wins); keying each
    // update off the job's own modelId makes re-registration harmless.
    downloadService.setProgressCallback((downloadJob) => {
      get().updateModel(downloadJob.modelId, {
        downloadStatus: downloadJob.status,
        downloadProgress: downloadJob.progress,
        downloadedBytes: downloadJob.downloadedBytes,
        totalBytes: downloadJob.totalBytes,
        error: downloadJob.error,
      });
      get().syncDownloadStatus();
    });

    downloadService.setCompleteCallback((downloadJob, success) => {
      if (success) {
        get().updateModel(downloadJob.modelId, {
          downloadStatus: "completed",
          downloadProgress: 100,
          downloadedBytes: downloadJob.totalBytes,
          localPath: downloadJob.destinationPath,
        });
        // ponytail: learn the ceiling from what actually succeeded.
        if (downloadJob.totalBytes > get().largestSuccessfulBytes) {
          set({ largestSuccessfulBytes: downloadJob.totalBytes });
          void get().saveMemoryGuard();
        }
      } else {
        get().updateModel(downloadJob.modelId, {
          downloadStatus: "failed",
          error: downloadJob.error,
        });
      }
      get().syncDownloadStatus();
    });

    try {
      await downloadService.startDownload(job);
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

  cancelDownload: async (jobId) => {
    const job = downloadService.getJob(jobId);
    if (job) {
      get().updateModel(job.modelId, {
        downloadStatus: "idle",
        downloadProgress: 0,
        downloadedBytes: 0,
      });
    }
    await downloadService.cancelDownload(jobId);
    get().syncDownloadStatus();
  },

  syncDownloadStatus: () => {
    const activeDownloads = new Map(
      downloadService.getAllJobs().map((job) => [job.id, job.status]),
    );
    set({ activeDownloads });
  },

  uploadToBackend: async (modelId) => {
    const model = get().getModel(modelId);
    if (!model || model.origin === "remote_api") {
      return false;
    }

    const file = model.files[0];
    if (!file) {
      return false;
    }

    // ponytail: downloads live in models/, imports in models/local/.
    const base = LegacyFileSystem.documentDirectory ?? "";
    let filePath = `${base}models/${file.name}`;
    try {
      const info = await LegacyFileSystem.getInfoAsync(filePath);
      if (!info.exists) {
        filePath = `${base}models/local/${file.name}`;
      }
    } catch {
      // Fall through with default path
    }

    try {
      const result = await uploadService.uploadModel(filePath, file.name);
      return result.success;
    } catch {
      return false;
    }
  },
});
