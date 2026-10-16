/** Kokoro tracer (issue 02) — reusable download bridge over sherpa-onnx.
 *
 * Wraps the library's built-in download manager for the TTS category (spec
 * Q4) and maps its progress callbacks onto PocketPal's DownloadState
 * machine — `not_installed | downloading | paused | ready | error` +
 * percent — which ticket 03's Zustand store consumes directly.
 *
 * Stopping a transfer uses the manager's PAUSE, not an abort: the shipped
 * docs make `pauseDownload` the non-destructive stop ("keeps partial
 * bytes", resumable with `resumeDownload`), while the `AbortSignal` path
 * runs `cleanupCanceledDownload`, which unlinks the archive, the extracted
 * directory and the ready marker. Aborting therefore throws away the bytes
 * the user already paid for, so nothing here aborts.
 *
 * The native module is imported DYNAMICALLY for the same reason
 * services/chat//keep-awake.ts's is: plain-Node tests exercise this module with a
 * fake API injected through the loader, and `react-native-sherpa-onnx/download`
 * is a native package a static import would drag into the test run. Metro
 * still bundles it statically for the app.
 *
 * Naming note: the docs site shows `downloadModelByCategory(...)`-style
 * helpers, but the installed 0.4.4 package exports category-first
 * functions (`downloadModel(category, id, opts)`); the bridge wraps what
 * the package actually ships.
 */

import type {
  ModelCategory,
  ModelMeta,
  Progress,
  ProgressPhase,
} from "react-native-sherpa-onnx/download";

export type TtsModelState =
  | "not_installed"
  | "downloading"
  | "paused"
  | "ready"
  | "error";

export interface TtsModelStatus {
  state: TtsModelState;
  /** 0..100. NOT monotonic: the archive reports up to 100, then tar.bz2
   *  extraction restarts near 0. Read `phase` before showing it. */
  percent: number;
  phase?: ProgressPhase;
  error?: string;
}

/** The slice of the manager's `DownloadState` the bridge reads, narrowed so
 *  tests can build one from two numbers. */
export interface IncompleteTtsDownload {
  modelId: string;
  bytesDownloaded?: number;
  totalBytes?: number;
}

/** The subset of `react-native-sherpa-onnx/download` the bridge uses.
 *  Structural, so tests inject a fake and the real module satisfies it. */
export interface SherpaTtsDownloadApi {
  refreshModels(
    category: ModelCategory,
    options?: { forceRefresh?: boolean; signal?: AbortSignal },
  ): Promise<ModelMeta[]>;
  downloadModel(
    category: ModelCategory,
    id: string,
    options?: {
      onProgress?: (progress: Progress) => void;
      signal?: AbortSignal;
    },
  ): Promise<{ modelId: string; localPath: string }>;
  pauseDownload(category: ModelCategory, id: string): Promise<void>;
  resumeDownload(
    category: ModelCategory,
    id: string,
    options?: {
      onProgress?: (progress: Progress) => void;
      signal?: AbortSignal;
    },
  ): Promise<{ modelId: string; localPath: string }>;
  getIncompleteDownloads(
    category: ModelCategory,
  ): Promise<IncompleteTtsDownload[]>;
  isModelDownloaded(category: ModelCategory, id: string): Promise<boolean>;
  getModelPath(category: ModelCategory, id: string): Promise<string | null>;
  deleteModel(category: ModelCategory, id: string): Promise<void>;
}

/** `ModelCategory.Tts` without a runtime import: jest type-strips
 *  this module, and the package's enum is not erasable syntax. */
const TTS_CATEGORY = "tts" as ModelCategory;

/** Clamp a 0..100 percent to whole points. Shared with the UI rules
 *  (voiceUi.ts) — the bridge clamps at the source, the UI re-clamps
 *  because the status is plain data that may cross a process boundary. */
export function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}

export function createTtsDownloadBridge(
  load: () => Promise<SherpaTtsDownloadApi>,
) {
  /** The single in-flight download's controller and id. The store's runtime
   *  is single-slot by design (spec Q14), so one of each is enough. */
  let active: AbortController | null = null;
  let activeModelId: string | null = null;
  /** Last progress seen, so a pause reports where it stopped. */
  let lastPercent = 0;
  let lastPhase: ProgressPhase | undefined;

  /** The manager signals a deliberate pause with `PauseError`; the class is
   *  not erasable syntax, so match the name the package sets. */
  function isPause(error: unknown): boolean {
    return error instanceof Error && error.name === "PauseError";
  }

  function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /** Fetch the TTS model list (for the picker). Uses the manager's cache;
   *  `forceRefresh` re-fetches from the GitHub release registry. */
  async function refresh(options?: {
    forceRefresh?: boolean;
  }): Promise<ModelMeta[]> {
    const api = await load();
    return api.refreshModels(TTS_CATEGORY, options);
  }

  /** Where the model sits on the local disk, or null when not downloaded
   *  — the path that goes into `createTTS`/`createStreamingTTS` as
   *  `{ type: "file", path }` (spec Q4/Q8). */
  async function localPath(modelId: string): Promise<string | null> {
    const api = await load();
    return api.getModelPath(TTS_CATEGORY, modelId);
  }

  /** Reconcile one model's state from disk (store init / screen focus). */
  async function status(modelId: string): Promise<TtsModelStatus> {
    const api = await load();
    const downloaded = await api.isModelDownloaded(TTS_CATEGORY, modelId);
    return downloaded
      ? { state: "ready", percent: 100 }
      : { state: "not_installed", percent: 0 };
  }

  /** One download or resume, start to finish. Resolves with the local
   *  path, or null when the user paused it — a pause is a state the UI
   *  renders (Resume), never a rejection it would have to swallow. */
  async function run(
    modelId: string,
    onStatus: (status: TtsModelStatus) => void,
    call: (
      api: SherpaTtsDownloadApi,
      options: {
        onProgress: (progress: Progress) => void;
        signal: AbortSignal;
      },
    ) => Promise<{ modelId: string; localPath: string }>,
  ): Promise<string | null> {
    const api = await load();
    const controller = new AbortController();
    active = controller;
    activeModelId = modelId;
    lastPercent = 0;
    lastPhase = undefined;
    onStatus({ state: "downloading", percent: 0, phase: "downloading" });
    try {
      // sherpa resolves the id via getModelById, which reads ONLY the
      // on-disk registry cache and never fetches. On a fresh install that
      // cache is empty, so every download threw `Unknown model id: <id>`.
      // Costs nothing while the cache is fresh (TTL-guarded inside).
      await api.refreshModels(TTS_CATEGORY, { signal: controller.signal });
      const result = await call(api, {
        signal: controller.signal,
        onProgress: (progress) => {
          lastPercent = clampPercent(progress.percent);
          lastPhase = progress.phase;
          onStatus({
            state: "downloading",
            percent: lastPercent,
            phase: progress.phase,
          });
        },
      });
      onStatus({ state: "ready", percent: 100 });
      return result.localPath;
    } catch (error) {
      if (isPause(error) || controller.signal.aborted) {
        // The manager keeps the partial bytes (pauseDownload), so this is
        // a paused transfer to resume from — not a failure.
        onStatus({
          state: "paused",
          percent: lastPercent,
          phase: lastPhase ?? "downloading",
        });
        return null;
      }
      onStatus({ state: "error", percent: 0, error: message(error) });
      throw error;
    } finally {
      if (active === controller) {
        active = null;
        activeModelId = null;
      }
    }
  }

  /** Download a model from scratch, reporting every state transition. */
  function download(
    modelId: string,
    onStatus: (status: TtsModelStatus) => void,
  ): Promise<string | null> {
    return run(modelId, onStatus, (api, options) =>
      api.downloadModel(TTS_CATEGORY, modelId, options),
    );
  }

  /** Continue a paused transfer, keeping the bytes already fetched. */
  function resume(
    modelId: string,
    onStatus: (status: TtsModelStatus) => void,
  ): Promise<string | null> {
    return run(modelId, onStatus, (api, options) =>
      api.resumeDownload(TTS_CATEGORY, modelId, options),
    );
  }

  /** Pause the in-flight transfer, partial bytes kept (no-op when idle). */
  async function pause(modelId?: string): Promise<void> {
    const id = activeModelId ?? modelId;
    if (id === null || id === undefined) return;
    const api = await load();
    await api.pauseDownload(TTS_CATEGORY, id);
  }

  /** Transfers the manager still holds from a previous session, so a
   *  restart can offer Resume instead of starting a second transfer over
   *  the same archive path. */
  async function incomplete(): Promise<Record<string, number>> {
    const api = await load();
    const pending = await api.getIncompleteDownloads(TTS_CATEGORY);
    const percents: Record<string, number> = {};
    for (const entry of pending) {
      const total = entry.totalBytes ?? 0;
      percents[entry.modelId] =
        total > 0 && (entry.bytesDownloaded ?? 0) > 0
          ? clampPercent(((entry.bytesDownloaded ?? 0) / total) * 100)
          : 0;
    }
    return percents;
  }

  /** Delete a downloaded model from disk, reclaiming its bytes.
   *  Disk space before a download is already checked by the manager itself
   *  (`downloadModel` throws `Insufficient disk space`), so this exists for
   *  the other direction: giving the space back. */
  async function remove(modelId: string): Promise<void> {
    const api = await load();
    await api.deleteModel(TTS_CATEGORY, modelId);
  }

  return { refresh, localPath, status, download, resume, pause, incomplete, remove };
}

/** The app's bridge over the real download manager. */
export const ttsDownloads = createTtsDownloadBridge(
  () => import("react-native-sherpa-onnx/download"),
);
