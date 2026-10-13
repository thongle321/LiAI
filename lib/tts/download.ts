/** Kokoro tracer (issue 02) — reusable download bridge over sherpa-onnx.
 *
 * Wraps the library's built-in download manager for the TTS category (spec
 * Q4) and maps its progress callbacks onto PocketPal's DownloadState
 * machine — `not_installed | downloading | ready | error` + percent — which
 * ticket 03's Zustand store consumes directly.
 *
 * The native module is imported DYNAMICALLY for the same reason
 * lib/chat/keep-awake.ts's is: plain-Node tests exercise this module with a
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
} from "react-native-sherpa-onnx/download";

export type TtsModelState = "not_installed" | "downloading" | "ready" | "error";

export interface TtsModelStatus {
  state: TtsModelState;
  /** 0..100 across download + extraction. */
  percent: number;
  error?: string;
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
  isModelDownloaded(category: ModelCategory, id: string): Promise<boolean>;
  getModelPath(category: ModelCategory, id: string): Promise<string | null>;
}

/** `ModelCategory.Tts` without a runtime import: node --test type-strips
 *  this module, and the package's enum is not erasable syntax. */
const TTS_CATEGORY = "tts" as ModelCategory;

function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}

export function createTtsDownloadBridge(
  load: () => Promise<SherpaTtsDownloadApi>,
) {
  /** The single in-flight download's controller. The store's runtime is
   *  single-slot by design (spec Q14), so one controller is enough. */
  let active: AbortController | null = null;

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

  /** Download a model, reporting every state transition. Resolves with the
   *  local path; rejects on failure or abort (both already reported). */
  async function download(
    modelId: string,
    onStatus: (status: TtsModelStatus) => void,
  ): Promise<string> {
    const api = await load();
    const controller = new AbortController();
    active = controller;
    onStatus({ state: "downloading", percent: 0 });
    try {
      const result = await api.downloadModel(TTS_CATEGORY, modelId, {
        signal: controller.signal,
        onProgress: (progress) =>
          onStatus({ state: "downloading", percent: clampPercent(progress.percent) }),
      });
      onStatus({ state: "ready", percent: 100 });
      return result.localPath;
    } catch (error) {
      if (controller.signal.aborted) {
        // The manager keeps partial files for resume, so a cancel lands
        // back in not_installed — the next download continues where it left
        // off — rather than in error.
        onStatus({ state: "not_installed", percent: 0 });
        throw error;
      }
      onStatus({
        state: "error",
        percent: 0,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      if (active === controller) active = null;
    }
  }

  /** Cancel the in-flight download (no-op when idle). */
  function abort(): void {
    active?.abort();
  }

  return { refresh, localPath, status, download, abort };
}

/** The app's bridge over the real download manager. */
export const ttsDownloads = createTtsDownloadBridge(
  () => import("react-native-sherpa-onnx/download"),
);
