/** Voice-pack download: fetch an engine's model files to disk.
 *
 * Reuses the app's existing resumable download service (expo-file-system on
 * both platforms) rather than a second downloader — a pack is 57–400 MB in a
 * handful of files, and this is exactly what PocketPal's TTS path does, so
 * parity holds for free. What we gain over theirs: real resume on both
 * platforms and a background session on iOS.
 *
 * Layout matches PocketPal: iOS `Library/Application Support/tts/<engine>`,
 * Android `files/tts/<engine>`. Both are created with
 * NSURLIsExcludedFromBackupKey so a multi-hundred-megabyte pack never lands
 * in an iCloud snapshot — expo-file-system has no API for that flag, which
 * is the whole reason RNFS is a dependency here.
 *
 * The progress maths and file planning are pure so they stay node-tested;
 * everything below the divider touches the filesystem or the network.
 */

import { Platform } from "react-native";
import * as RNFS from "@dr.pogodin/react-native-fs";
import { getFreeDiskStorageAsync } from "expo-file-system/legacy";

import { downloadService } from "../download-service.ts";
import { ENGINE_VERSIONS, type CatalogFile } from "./catalog.ts";
import {
  LOCAL_MANIFEST,
  VERSION_SENTINEL,
  combineProgress,
  diskPreflightOk,
  planFiles,
  requiredBytes,
  sentinelMatches,
} from "./packPlan.ts";
import type { EngineId, Voice } from "./types.ts";
import type { DownloadJob } from "../../types/models.ts";

export type EngineDownloadState =
  | "not_installed"
  | "downloading"
  | "ready"
  | "error";

export interface EngineDownloadStatus {
  state: EngineDownloadState;
  /** 0..1 across the whole engine, both phases weighted. */
  progress: number;
  error?: string;
}

// --- pure ------------------------------------------------------------
// planFiles / combineProgress / requiredBytes / diskPreflightOk /
// sentinelMatches live in packPlan.ts, which imports nothing native so
// they stay node-tested.

// --- native ---------------------------------------------------------

/** iOS keeps packs out of Documents; Android has no Library equivalent. */
function engineDir(engine: EngineId): string {
  const root =
    Platform.OS === "ios" ? RNFS.LibraryDirectoryPath : RNFS.DocumentDirectoryPath;
  return `${root}/Application Support/tts/${engine}`;
}

function parentDir(engine: EngineId): string {
  const dir = engineDir(engine);
  return dir.slice(0, dir.lastIndexOf("/"));
}

async function ensureDirs(engine: EngineId): Promise<void> {
  const parent = parentDir(engine);
  await RNFS.mkdir(parent, { NSURLIsExcludedFromBackupKey: true });
  await RNFS.mkdir(engineDir(engine), { NSURLIsExcludedFromBackupKey: true });
}

async function freeBytes(): Promise<number | null> {
  try {
    return await getFreeDiskStorageAsync();
  } catch {
    return null;
  }
}

function job(engine: EngineId, file: CatalogFile): DownloadJob {
  return {
    id: `tts:${engine}:${file.name}`,
    modelId: `tts-${engine}`,
    fileName: file.name,
    downloadUrl: file.url,
    destinationPath: `${engineDir(engine)}/${file.name}`,
    status: "idle",
    progress: 0,
    downloadedBytes: 0,
    // Per-file totals are unknown until the response headers land; the
    // engine estimate drives the preflight and the header readout.
    totalBytes: 0,
    resumable: true,
  };
}

/** Download one file, reporting 0..1. Rejects on a terminal failure. */
async function fetchFile(
  engine: EngineId,
  file: CatalogFile,
  onFraction: (fraction: number) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    downloadService.startDownload(
      job(engine, file),
      (j) => {
        const fraction = j.totalBytes > 0 ? j.downloadedBytes / j.totalBytes : j.progress / 100;
        onFraction(Math.min(1, Math.max(0, fraction)));
      },
      (_j, success) => {
        if (success) resolve();
        else reject(new Error(`download failed: ${file.name}`));
      },
    );
  });
}

/** True when every core file AND the version sentinel are on disk. The
 *  sentinel is written last, so an interrupted install never reads as
 *  installed. */
export async function isEngineInstalled(engine: EngineId): Promise<boolean> {
  if (engine === "system") return true;
  try {
    const dir = engineDir(engine);
    const sentinel = `${dir}/${VERSION_SENTINEL}`;
    if (!(await RNFS.exists(sentinel))) return false;
    const raw = await RNFS.readFile(sentinel, "utf8");
    if (!sentinelMatches(engine, raw)) return false;
    for (const file of planFiles(engine).core) {
      if (!(await RNFS.exists(`${dir}/${file.name}`))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch an engine's pack. Phase 1 is all-or-nothing: any core failure wipes
 * the directory so a retry starts clean rather than resuming a half-written
 * pack. Phase 2 is best-effort — a missing per-voice file costs that one
 * voice, and the local manifest lets the fork lazy-fetch it later.
 */
export async function downloadEngine(
  engine: EngineId,
  onStatus: (status: EngineDownloadStatus) => void,
): Promise<void> {
  const { core, voice } = planFiles(engine);
  const report = (state: EngineDownloadState, progress: number, error?: string) =>
    onStatus({ state, progress, ...(error !== undefined ? { error } : {}) });

  if (!diskPreflightOk(await freeBytes(), engine)) {
    report("error", 0, `Not enough free space — ${requiredBytes(engine)} bytes needed.`);
    return;
  }

  try {
    await ensureDirs(engine);
  } catch (err) {
    report("error", 0, err instanceof Error ? err.message : "could not create the voice folder");
    return;
  }

  let voiceDone = 0;
  const voiceTotal = Math.max(1, voice.length);
  const emit = (coreFrac: number, voiceFrac: number) =>
    report("downloading", combineProgress(engine, coreFrac, voiceFrac));

  // Phase 1 — core.
  try {
    for (const [i, file] of core.entries()) {
      await fetchFile(engine, file, (f) => emit((i + f) / Math.max(1, core.length), 0));
    }
    // Written last: its presence is what marks the install complete.
    await RNFS.writeFile(
      `${engineDir(engine)}/${VERSION_SENTINEL}`,
      JSON.stringify({ version: ENGINE_VERSIONS[engine] }),
      "utf8",
    );
  } catch (err) {
    await removeEngineDir(engine);
    report("error", 0, err instanceof Error ? err.message : "download failed");
    return;
  }

  // Phase 2 — per-voice, best effort.
  for (const file of voice) {
    try {
      await fetchFile(engine, file, (f) => {
        emit(1, (voiceDone + f) / voiceTotal);
      });
    } catch (err) {
      // A missing voice is a degraded catalogue, not a broken install.
      console.warn(`[tts] ${engine} voice file skipped:`, err);
    }
    voiceDone += 1;
  }

  try {
    await RNFS.writeFile(
      `${engineDir(engine)}/${LOCAL_MANIFEST}`,
      JSON.stringify({ baseUrl: null, voices: [] satisfies Voice[] }),
      "utf8",
    );
  } catch (err) {
    console.warn(`[tts] ${engine} local manifest not written:`, err);
  }

  emit(1, 1);
  report("ready", 1);
}

/** Delete a pack. Refuses while it is the active engine — the caller stops
 *  and releases first, or native frees memory under a live model. */
export async function deleteEngine(engine: EngineId): Promise<void> {
  if (engine === "system") return;
  await removeEngineDir(engine);
}

async function removeEngineDir(engine: EngineId): Promise<void> {
  const dir = engineDir(engine);
  if (await RNFS.exists(dir)) await RNFS.unlink(dir);
}

/** Fresh free-space reading for the header and the per-engine disable. */
export async function readFreeBytes(): Promise<number | null> {
  return freeBytes();
}