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
} from "../../services/models/huggingface";
import { platformDownloadService, failureCode } from "../../services/downloads/download-service";
import { latestJobForModel } from "../../services/models/download-jobs.ts";
import { resumeDataForPartial, classifyFileOnDisk } from "../../services/models/resume-state.ts";
import { findProjectorFile, pairDownloadStep } from "../../services/models/vision-pairing.ts";
import { readGgufMetadata } from "../../services/models/gguf-header.ts";
import { modelFitsOnDevice } from "../../utils/storage-fit.ts";
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

  startDownload: async (modelId, file, token, options) => {
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
    // "Download text only" (VisionDownloadSheet): no pair at all, and the
    // switch is persisted so the card shows the model as text-only.
    const visionEnabled = options?.visionEnabled !== false;
    const projector = visionEnabled
      ? (options?.projector ?? findProjectorFile(file, siblings))
      : undefined;
    if (projector) {
      spec.projector = {
        name: projector.name,
        size: projector.size,
        downloadUrl: projector.downloadUrl,
      };
    }
    if (spec.supportsVision) {
      spec.visionEnabled = visionEnabled;
    }
    await get().startSpecDownload(spec, file, token);
  },

  startSpecDownload: async (spec, file, token) => {
    const specId = spec.id;

    // One live job per model: double-taps and retries must not stack tasks
    // on the same file (stale entries made resume grab dead jobs and throw).
    const live = latestJobForModel(platformDownloadService.getAllJobs(), specId);
    if (live && (live.status === "downloading" || live.status === "paused")) return;
    for (const stale of platformDownloadService
      .getAllJobs()
      .filter((j) => j.modelId === specId)) {
      platformDownloadService.removeJob(stale.id);
    }

    // Create the spec once; a re-download keeps its existing row.
    const existing = get().getModel(specId);

    // Bytes on disk per file, so the pair's legs resume independently.
    // A partial file means the app died mid-flight: continue from its
    // bytes (Range resume) instead of restarting from zero.
    const onDiskBytes = async (name: string): Promise<number> => {
      try {
        const info = await LegacyFileSystem.getInfoAsync(
          `${LegacyFileSystem.documentDirectory ?? ""}models/${name}`,
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
// HF's LFS content id, when we have one: the resume validator below.
// PresetModelFile has no oid (only HFModelFile does), hence the `in` check.
const oid: string | undefined = "oid" in file ? file.oid : undefined;

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
        // If-Range closes the splice hole: a resume (Range: bytes=N-) against
        // a repo whose file changed would otherwise append the NEW bytes to
        // the OLD partial and land on exactly the right length with a wrong
        // middle. HF answers 200 instead of 206 when the validator fails,
        // and the service already restarts cleanly on that. Ignored by
        // servers when no Range is sent, so a fresh download is unaffected.
        //
        // The value MUST be a quoted entity-tag (RFC 7232 s3.2): HF serves
        // LFS files with ETag: "<lfs-sha256>", which is the oid. A bare hex
        // string is a malformed tag, so the server cannot match it and is
        // entitled to ignore the whole header — which would leave the
        // splice exactly as unprotected as sending nothing at all.
        ...(oid ? { "If-Range": `"${oid}"` } : {}),
      },
      destinationPath: `${LegacyFileSystem.documentDirectory}models/${activeFile.name}`,
      status: "downloading",
      progress: resumeProgress,
      downloadedBytes: partialBytes,
      totalBytes: activeFile.size,
      resumable: true,
    };

    // PocketPal parity: refuse before bytes move when the disk can't fit it.
    // FAILS CLOSED — a free-space read that throws leaves `free` null, which
    // the pure decision blocks on. This reverses our old fail-open policy: a
    // transfer that runs out reports its own failure honestly, a refused one
    // explains itself here. Blast radius: a device whose read ALWAYS throws
    // can never start a download. Reverting is one line (treat null as fit).
    let free: number | null = null;
    try {
      const reading = await LegacyFileSystem.getFreeDiskStorageAsync();
      free = Number.isFinite(reading) ? reading : null;
    } catch {
      // Unreadable free space is not permission to fill the disk.
    }
    if (
      !modelFitsOnDevice({
        modelBytes: activeFile.size,
        // The projector leg runs AFTER this one, so the main leg's
        // requirement is the pair — a vision model that only half fits
        // does not fit.
        ...(step === "main" && spec.projector
          ? { projectorBytes: spec.projector.size }
          : {}),
        freeBytes: free,
      })
    ) {
      get().updateModel(specId, {
        downloadStatus: "failed",
        error:
          free === null
            ? "Not enough storage space to download: free space on this device could not be determined"
            : "Not enough storage space to download the model",
      });
      return;
    }

    // No notification permission is requested (removed): the Android
    // worker's foreground-service notification is what lifts WorkManager's
    // ten-minute cap on a multi-GB transfer, and it is posted whether or not
    // the user has answered any prompt — on Android 13+ it stays suppressed
    // until the permission is granted from system settings.
    get().updateModel(specId, {
      downloadStatus: "downloading",
      downloadProgress: resumeProgress,
      totalBytes: activeFile.size,
      downloadedBytes: partialBytes,
      error: undefined,
    });

    // The service's callbacks are global (last registered wins); keying each
    // update off the job's own modelId makes re-registration harmless.
    platformDownloadService.setProgressCallback((downloadJob) => {
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
      // One transient push per emitted tick. There is deliberately no gate here:
//      // progress is already throttled once, at the emitter, in
      // download-service.ts (PocketPal's per-byte-loop throttle). A second
      // gate in the store was only ever a second place to forget one.
      get().setModelProgress(downloadJob.modelId, {
        downloadProgress: downloadJob.progress,
        downloadedBytes: downloadJob.downloadedBytes,
        totalBytes: downloadJob.totalBytes,
        speedBytesPerSec: downloadJob.speedBytesPerSec,
      });
    });

    platformDownloadService.setCompleteCallback((downloadJob, success) => {
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
        // Nothing selects the model here: activation is an explicit Load
        // (PocketPal parity), so the row flipping to Downloaded is the whole
        // of what a finished download does.
        // The file is whole: read what it says about itself while it is
        // still known-fresh. Fire-and-forget — metadata is a bonus, and
        // the row is already correct without it.
        void get().refreshGgufMetadata(downloadJob.modelId);
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
          errorCode: downloadJob.errorCode,
        });
      }
    });

    try {
      await platformDownloadService.startDownload(job, undefined, undefined, resume ?? undefined);
    } catch (error) {
      get().updateModel(specId, {
        downloadStatus: "failed",
        error: error instanceof Error ? error.message : "Download failed",
        errorCode: failureCode(error),
      });
    }
  },

  /** Recovery for a 401: drop the token and try the download again.
   *
   * Distinct from disableHfTokenAndRetry, which re-runs a search. This
   * re-runs the download, because the thing that failed was a transfer and
   * the user is looking at a model card, not a search box. Only 401 gets
   * here — 403 means the account cannot read the repo, and no token state
   * we can reach from this screen changes that. */
  retryWithoutToken: async (specId) => {
    get().setUseHfToken(false);
    const spec = get().getModel(specId);
    const file = spec?.files[0];
    if (!spec || !file) return;
    // Clearing the code first: the card would otherwise keep offering a
    // button for a failure this action is about to supersede.
    get().updateModel(specId, { error: undefined, errorCode: undefined });
    await get().startSpecDownload(spec, file, undefined);
  },

  pauseDownload: async (jobId) => {
    await platformDownloadService.pauseDownload(jobId);
  },

  resumeDownload: async (jobId) => {
    await platformDownloadService.resumeDownload(jobId);
  },

  pauseModelDownload: async (specId) => {
    try {
      const job = latestJobForModel(platformDownloadService.getAllJobs(), specId);
      if (!job) return;
      await get().pauseDownload(job.id);
    } catch {
      // Best-effort: the row keeps its last state, Retry restarts cleanly.
    }
  },

  resumeModelDownload: async (specId) => {
    try {
      const job = latestJobForModel(platformDownloadService.getAllJobs(), specId);
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
    const job = latestJobForModel(platformDownloadService.getAllJobs(), specId);
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

  startProjectorDownload: async (specId) => {
    try {
      const spec = get().getModel(specId);
      const file = spec?.files[0];
      if (!spec || !file || !spec.projector) return;
      // startSpecDownload already sequences: the main file is whole, so
      // pairDownloadStep picks the "projector" leg. No second downloader.
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
    // Native wins, and this runs BEFORE reconcileWithNative adopts anything
    // (persistence.ts keeps the disk pass first, deliberately). The worker
    // reconciles disk-vs-DB itself against the SERVER's adopted total (the
    // serverTotal block and the end-of-transfer size check in
    // DownloadWorker.kt), while this pass classifies by the CATALOG's size —
    // so on a file whose real size no longer matches the catalog
    // (re-quantized upstream), this pass would mark a completed download
    // "paused" or DELETE it as corrupt before adoption could correct it.
    // Read-only peek; the mirror stays untouched.
    const nativeKnown = new Set(
      (await platformDownloadService.knownModelIds?.()) ?? [],
    );
    for (const spec of get().models) {
      if (nativeKnown.has(spec.id)) continue;
      // Already whole: nothing to reconcile, but it may predate the GGUF
      // metadata read — backfill it here, once, from the file at rest.
      // That is the whole point of the second hook: a model downloaded
      // before this feature gains its metadata without a re-fetch.
      if (spec.downloadStatus === "completed") {
        if (spec.origin !== "remote_api" && !spec.ggufMetadata) {
          await get().refreshGgufMetadata(spec.id);
        }
        continue;
      }
      if (spec.origin === "remote_api") continue;
      const file = spec.files[0];
      if (!file || !(file.size > 0)) continue;
      try {
        const info = await LegacyFileSystem.getInfoAsync(dir + file.name);
if (!info.exists || !("size" in info) || typeof info.size !== "number") continue;
      // `===`, not `>=`: an oversized file is the fingerprint of an error
      // body appended onto a partial by the native writer, and calling that
      // "completed" hands the user a corrupt model that loads and misbehaves.
      const state = classifyFileOnDisk(info.size, file.size);
      if (state === "complete") {
          // Whole file on disk but never marked: killed at the finish line.
          get().updateModel(spec.id, {
            downloadStatus: "completed",
            downloadProgress: 100,
            downloadedBytes: file.size,
            totalBytes: file.size,
            localPath: dir + file.name,
            error: undefined,
          });
        } else if (state === "corrupt") {
          // Overshoot: nothing here is resumable and nothing is whole. It
          // used to match neither branch and simply sit on disk forever,
          // holding gigabytes the user cannot reclaim from the UI. Delete it
          // and hand the row back so Download works again.
          await LegacyFileSystem.deleteAsync(dir + file.name, { idempotent: true }).catch(
            () => {
              // Unremovable: leave the row honest about why it cannot load.
            },
          );
          get().updateModel(spec.id, {
            downloadStatus: "idle",
            downloadProgress: 0,
            downloadedBytes: 0,
            totalBytes: file.size,
            error: "A partial download was left corrupt on disk — tap Download to start again",
          });
        } else if (state === "partial") {
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
  },

  refreshGgufMetadata: async (specId) => {
    const spec = get().getModel(specId);
    const file = spec?.files[0];
    // Remote models have no file at rest, and their context length is the
    // server's configured setting — a different fact from a trained
    // maximum, so it must never be written here. Already-populated rows
    // are left alone: this is a read, not a re-read on every start.
    if (!spec || !file || spec.origin === "remote_api" || spec.ggufMetadata) {
      return;
    }
    const metadata = await readGgufMetadata(
      LegacyFileSystem.documentDirectory ?? "",
      file.name,
    );
    if (metadata) get().updateModel(specId, { ggufMetadata: metadata });
  },

  cancelDownload: async (jobId) => {
    const job = platformDownloadService.getJob(jobId);
    // Reset AFTER the service resolves, not before: the service's terminal
    // "cancelled" event carries the last known byte count, so an early reset
    // was immediately overwritten and left a stale 40% on the row. Awaiting
    // first also keeps the card on its real state while the abort is in
    // flight, then it snaps straight to Download.
    await platformDownloadService.cancelDownload(jobId);
    if (job) {
      get().updateModel(job.modelId, {
        downloadStatus: "idle",
        downloadProgress: 0,
        downloadedBytes: 0,
      });
    }
  },
});
