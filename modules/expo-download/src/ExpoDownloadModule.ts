/** Android-native model downloads (WorkManager-backed).
 *
 * ANDROID ONLY, and the import is lazy on purpose: `requireNativeModule`
 * throws when the native side is missing, so a top-level import would break
 * iOS — and the web — the moment this file is touched. Every caller goes
 * through {@link androidDownload}, which returns null off Android instead.
 *
 * Why the module exists: iOS gets background-surviving transfers from
 * expo-file-system's `FileSystemSessionType.BACKGROUND`, which hands the
 * transfer to a real background NSURLSession. Android ignores `sessionType`
 * entirely, so there the transfer dies with the app process. WorkManager does
 * not. See `android/.../DownloadWorker.kt`.
 *
 * PROGRESS IS POLLED. `onDownloadEvent` carries transitions, but the native
 * event emitter drops events whenever the JS object is gone — which is
 * exactly the case this module exists for. `getActiveDownloads()` is the
 * contract; events are an optimisation on top.
 */
import { NativeModule, requireNativeModule } from "expo";
import type { EventSubscription } from "expo-modules-core";
import { Platform } from "react-native";

/** Mirrors Kotlin's `DownloadState`, lowercased. `queued` is the one state
 *  the JS `ModelDownloadStatus` vocabulary has no word for: WorkManager has
 *  accepted the job but not started the worker. */
export type NativeDownloadState =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface NativeDownload {
  id: string;
  modelId: string;
  fileName: string;
  destinationPath: string;
  expectedTotal: number;
  state: NativeDownloadState;
  downloadedBytes: number;
  error?: string;
  errorCode?: "authentication";
}

export interface NativeDownloadRequest {
  id: string;
  modelId: string;
  url: string;
  fileName: string;
  destinationPath: string;
  expectedTotal: number;
  /** HF LFS content id. Sent as a quoted If-Range entity-tag; a bare hex
   *  string is malformed and the server is free to ignore the header. */
  ifRange?: string;
  headers?: Record<string, string>;
}

declare class ExpoDownloadModule extends NativeModule<ExpoDownloadEvents> {
  pingAsync(): Promise<string>;
  startDownload(request: NativeDownloadRequest): Promise<void>;
  pauseDownload(id: string): Promise<void>;
  resumeDownload(id: string): Promise<void>;
  /** Retry a FAILED download. Distinct from resume, which refuses anything
   *  that is not PAUSED — mirroring pocketpal-ai's separate retry verb. */
  retryDownload(id: string): Promise<void>;
  /** Delete the record entirely. Terminal is not forgotten. */
  forgetDownload(id: string): Promise<void>;
  cancelDownload(id: string): Promise<void>;
  /** Every record the worker has, read from the same durable store it writes.
   *  This is what a cold-started app calls to find downloads it never saw. */
  getActiveDownloads(): Promise<NativeDownload[]>;
  /** Resolves when the download is no longer live, or null if it still is. */
  awaitDownload(id: string): Promise<NativeDownload | null>;
}

type ExpoDownloadEvents = {
  onDownloadEvent: (event: NativeDownload) => void;
};

let cached: ExpoDownloadModule | null | undefined;

/** The native module on Android, or null anywhere else. Never throws: the
 *  whole point is that the iOS path keeps working without it. */
export function androidDownload(): ExpoDownloadModule | null {
  if (Platform.OS !== "android") return null;
  if (cached === undefined) {
    try {
      cached = requireNativeModule<ExpoDownloadModule>("ExpoDownload");
    } catch {
      // Native side not built yet (fresh clone, or a prebuild that predates
      // this module). Callers fall back to the legacy downloader.
      cached = null;
    }
  }
  return cached;
}

/** Subscribe to download transitions. A no-op off Android. */
export function addDownloadListener(
  listener: (event: NativeDownload) => void,
): () => void {
  const mod = androidDownload();
  if (!mod) return () => {};
  const sub: EventSubscription = mod.addListener("onDownloadEvent", listener);
  return () => sub.remove();
}