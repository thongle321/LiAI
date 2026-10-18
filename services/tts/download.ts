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
 * fake API injected through its loader, and `react-native-sherpa-onnx/download`
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

/** Internal state machine for one in-flight transfer. Extracted so the
 *  transitions (start → progress → ready/paused/error) are testable in
 *  isolation from the native loader; the loader is injected. */
class TtsDownloadController {
  private active: AbortController | null = null;
  private activeModelId: string | null = null;
  private lastPercent = 0;
  private lastPhase: ProgressPhase | undefined;

  constructor(private readonly load: () => Promise<SherpaTtsDownloadApi>) {}

  private isPause(error: unknown): boolean {
    return error instanceof Error && error.name === "PauseError";
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  async refresh(options?: { forceRefresh?: boolean }): Promise<ModelMeta[]> {
    const api = await this.load();
    return api.refreshModels(TTS_CATEGORY, options);
  }

  async localPath(modelId: string): Promise<string | null> {
    const api = await this.load();
    return api.getModelPath(TTS_CATEGORY, modelId);
  }

  async status(modelId: string): Promise<TtsModelStatus> {
    const api = await this.load();
    const downloaded = await api.isModelDownloaded(TTS_CATEGORY, modelId);
    return downloaded
      ? { state: "ready", percent: 100 }
      : { state: "not_installed", percent: 0 };
  }

  async run(
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
    const api = await this.load();
    const controller = new AbortController();
    this.active = controller;
    this.activeModelId = modelId;
    this.lastPercent = 0;
    this.lastPhase = undefined;
    onStatus({ state: "downloading", percent: 0, phase: "downloading" });
    try {
      await api.refreshModels(TTS_CATEGORY, { signal: controller.signal });
      const result = await call(api, {
        signal: controller.signal,
        onProgress: (progress) => {
          this.lastPercent = clampPercent(progress.percent);
          this.lastPhase = progress.phase;
          onStatus({
            state: "downloading",
            percent: this.lastPercent,
            phase: progress.phase,
          });
        },
      });
      onStatus({ state: "ready", percent: 100 });
      return result.localPath;
    } catch (error) {
      if (this.isPause(error) || controller.signal.aborted) {
        onStatus({
          state: "paused",
          percent: this.lastPercent,
          phase: this.lastPhase ?? "downloading",
        });
        return null;
      }
      onStatus({ state: "error", percent: 0, error: this.message(error) });
      throw error;
    } finally {
      if (this.active === controller) {
        this.active = null;
        this.activeModelId = null;
      }
    }
  }

  download(
    modelId: string,
    onStatus: (status: TtsModelStatus) => void,
  ): Promise<string | null> {
    return this.run(modelId, onStatus, (api, options) =>
      api.downloadModel(TTS_CATEGORY, modelId, options),
    );
  }

  resume(
    modelId: string,
    onStatus: (status: TtsModelStatus) => void,
  ): Promise<string | null> {
    return this.run(modelId, onStatus, (api, options) =>
      api.resumeDownload(TTS_CATEGORY, modelId, options),
    );
  }

  async pause(modelId?: string): Promise<void> {
    const id = this.activeModelId ?? modelId;
    if (id === null || id === undefined) return;
    const api = await this.load();
    await api.pauseDownload(TTS_CATEGORY, id);
  }

  async incomplete(): Promise<Record<string, number>> {
    const api = await this.load();
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

  async remove(modelId: string): Promise<void> {
    const api = await this.load();
    await api.deleteModel(TTS_CATEGORY, modelId);
  }
}

export function createTtsDownloadBridge(load: () => Promise<SherpaTtsDownloadApi>) {
  const controller = new TtsDownloadController(load);
  return {
    refresh: (options?: { forceRefresh?: boolean }) => controller.refresh(options),
    localPath: (modelId: string) => controller.localPath(modelId),
    status: (modelId: string) => controller.status(modelId),
    download: (modelId: string, onStatus: (status: TtsModelStatus) => void) =>
      controller.download(modelId, onStatus),
    resume: (modelId: string, onStatus: (status: TtsModelStatus) => void) =>
      controller.resume(modelId, onStatus),
    pause: (modelId?: string) => controller.pause(modelId),
    incomplete: () => controller.incomplete(),
    remove: (modelId: string) => controller.remove(modelId),
  };
}

/** The app's bridge over the real download manager. */
export const ttsDownloads = createTtsDownloadBridge(
  () => import("react-native-sherpa-onnx/download"),
);
