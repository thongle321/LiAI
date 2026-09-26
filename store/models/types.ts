/** Model-store slices + the composed store type.
 *
 * All slice interfaces live here (not in the slice files) so the slice
 * factories can depend on `ModelStore` without a type cycle.
 */

import type {
  HFModelFile,
  HFModelSearchResult,
  ModelDownloadStatus,
  ModelSettings,
  ModelSpec,
  PresetModel,
  PresetModelFile,
  RemoteApiProvider,
  RemoteCaps,
} from "../../types/models";

export interface CatalogSlice {
  models: ModelSpec[];
  presets: PresetModel[];
  searchResults: HFModelSearchResult[];
  searchLoading: boolean;
  searchError: string | null;

  loadPresets: () => Promise<void>;
  searchModels: (query: string) => Promise<void>;
  getModelFiles: (modelId: string) => Promise<HFModelFile[]>;

  addModel: (model: ModelSpec) => void;
  removeModel: (modelId: string) => Promise<void>;
  updateModel: (modelId: string, updates: Partial<ModelSpec>) => void;
  /** Transient progress update: state only, NO disk write. For the
   *  high-frequency download tick, where persisting every byte thrashes
   *  AsyncStorage. Real status changes go through updateModel. */
  setModelProgress: (modelId: string, progress: Partial<ModelSpec>) => void;
  getModel: (modelId: string) => ModelSpec | undefined;
  addLocalModel: (sourceUri: string, fileName: string, size: number) => Promise<void>;
  saveModels: () => Promise<void>;
}

export interface DownloadsSlice {
  /** Mirrored from downloadService */
  activeDownloads: Map<string, ModelDownloadStatus>;
  /** Load-guard learned ceiling (PocketPal largestSuccessfulLoad parity) */
  largestSuccessfulBytes: number;

  saveMemoryGuard: () => Promise<void>;
  startDownload: (
    modelId: string,
    file: HFModelFile | PresetModelFile,
    token?: string,
  ) => Promise<void>;
  /** Start from an already-built spec (interrupted-resume re-entry). */
  startSpecDownload: (
    spec: ModelSpec,
    file: { name: string; size: number; downloadUrl: string },
    token?: string,
  ) => Promise<void>;
  /** Resume a killed download from its partial file (manual Resume). */
  resumeInterruptedDownload: (specId: string) => Promise<void>;
  /** Mark partial on-disk files paused after launch so Resume continues them. */
  reconcileInterrupted: () => Promise<void>;
  pauseDownload: (jobId: string) => Promise<void>;
  resumeDownload: (jobId: string) => Promise<void>;
  cancelDownload: (jobId: string) => Promise<void>;
  /** Pause/resume by stored spec id (UI rows don't track job ids). */
  pauseModelDownload: (specId: string) => Promise<void>;
  resumeModelDownload: (specId: string) => Promise<void>;
  syncDownloadStatus: () => void;
}

export interface RemoteSlice {
  remoteApis: RemoteApiProvider[];
  /** Probed provider snapshots + privacy notice (remoteCaps parity) */
  remoteCaps: Record<string, RemoteCaps>;
  privacyAcknowledged: boolean;

  saveRemoteApis: () => Promise<void>;
  saveRemoteCaps: () => Promise<void>;
  addRemoteApi: (provider: RemoteApiProvider) => Promise<void>;
  removeRemoteApi: (providerId: string) => Promise<void>;
  updateRemoteApi: (
    providerId: string,
    updates: Partial<RemoteApiProvider>,
  ) => Promise<void>;
  setActiveRemoteApi: (providerId: string | null) => void;
  validateRemoteApi: (provider: RemoteApiProvider) => Promise<boolean>;
  validateAndRecord: (provider: RemoteApiProvider) => Promise<boolean>;
  acknowledgePrivacy: () => void;
}

export interface SettingsSlice {
  hfToken: string | null;
  modelSettings: Record<string, ModelSettings>;

  saveModelSettings: () => Promise<void>;
  setHfToken: (token: string | null) => Promise<void>;
  getModelSettings: (modelId: string) => ModelSettings;
  updateModelSettings: (modelId: string, updates: Partial<ModelSettings>) => void;
}

export interface ActiveSlice {
  activeModelId: string | null;
  activeProviderType: "local" | "remote" | null;

  setActiveModel: (
    modelId: string | null,
    providerType?: "local" | "remote",
  ) => void;
  getActiveModel: () => ModelSpec | null;
}

export interface PersistenceSlice {
  loadPersisted: () => Promise<void>;
}

export type ModelStore = CatalogSlice &
  DownloadsSlice &
  RemoteSlice &
  SettingsSlice &
  ActiveSlice &
  PersistenceSlice;
