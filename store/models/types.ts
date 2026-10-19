/** Model-store slices + the composed store type.
 *
 * All slice interfaces live here (not in the slice files) so the slice
 * factories can depend on `ModelStore` without a type cycle.
 */

import type {
  HFModelFile,
  HFModelSearchResult,
  ModelFile,
  ModelSettings,
  ModelSpec,
  PresetModel,
  PresetModelFile,
  RemoteApiProvider,
  RemoteCaps,
} from "@/types/models";
import type { HFSortBy } from "@/services/models/hf-format.ts";

/** A Hub failure the UI can branch on: `authentication` is what offers
 * the Disable-Token-&-Retry escape hatch. */
export interface HFSearchError {
  message: string;
  code: "authentication" | "network" | "unknown";
}

/** The two filter-sheet values, persisted like the section filters. */
export interface HFSearchFilters {
  author: string;
  sortBy: HFSortBy;
}

export interface CatalogSlice {
  models: ModelSpec[];
  presets: PresetModel[];
  /** Session-only: presets dismissed from "Available to Download".
   *  PocketPal's removeModelFromList is an in-memory splice too — a
   *  dismissed preset returns on the next launch (ModelStore.ts:1004). */
  dismissedPresetIds: string[];
  searchResults: HFModelSearchResult[];
  searchLoading: boolean;
  searchLoadingMore: boolean;
  /** The "Loading more" footer only shows when this is set. */
  nextPageLink: string | null;
  searchError: HFSearchError | null;
  /** The query behind the current results (the token-retry re-runs it). */
  searchQuery: string;
  searchFilters: HFSearchFilters;

  loadPresets: () => Promise<void>;
  /** Drop a preset from "Available to Download" until restart or reset. */
  dismissPreset: (presetId: string) => void;
  /** Runs the search for `query` with the current filters, replacing the
   *  results. An empty query is a real search (PocketParity): the Hub
   *  answers with its default relevance listing. */
  searchModels: (query: string) => Promise<void>;
  /** Appends the next page. No-op while a page is in flight or once the
   *  Hub has returned three short pages in a row (PocketPal's guard). */
  loadMoreModels: () => Promise<void>;
  getModelFiles: (modelId: string) => Promise<HFModelFile[]>;
  setSearchFilters: (patch: Partial<HFSearchFilters>) => void;
  /** Drop the token flag and retry — the auth-error escape hatch. */
  disableHfTokenAndRetry: () => Promise<void>;

  /** Save a model WITHOUT downloading it: it joins the catalog as a
   *  not-downloaded HF spec and shows in "Available to download". */
  bookmarkModel: (result: HFModelSearchResult, file: HFModelFile) => void;
  /** The saved spec for a file, if one is bookmarked. */
  getModelByOid: (oid: string) => ModelSpec | undefined;
  isBookmarked: (oid: string) => boolean;
  /** Removes a bookmark. Refuses (returns false) for a downloaded model
   *  — that is a delete, not an un-bookmark. */
  removeBookmark: (modelId: string) => boolean;

  addModel: (model: ModelSpec) => void;
  removeModel: (modelId: string) => Promise<void>;
  updateModel: (modelId: string, updates: Partial<ModelSpec>) => void;
  /** Per-model vision switch. false = load blind even with a projector. */
  setVisionEnabled: (modelId: string, enabled: boolean) => void;
  /** Pair a different sibling projector and mark it as the active one.
   *  The fetch is a separate action (DownloadsSlice): recording and
   *  downloading are different jobs and the UI wants both. */
  setProjector: (modelId: string, projector: ModelFile) => void;
  /** Unpair + delete the projector file. Dependents (models sharing that
   *  exact file) are returned so the caller can name them in the confirm. */
  detachProjector: (modelId: string) => Promise<string[]>;
  /** Transient progress update: state only, NO disk write. For the
   *  high-frequency download tick, where persisting every byte thrashes
   *  AsyncStorage. Real status changes go through updateModel. */
  setModelProgress: (modelId: string, progress: Partial<ModelSpec>) => void;
  getModel: (modelId: string) => ModelSpec | undefined;
  addLocalModel: (sourceUri: string, fileName: string, size: number) => Promise<void>;
}

export interface DownloadsSlice {
  /** Load-guard learned ceiling (PocketPal largestSuccessfulLoad parity) */
  largestSuccessfulBytes: number;

  /** Dismiss the failure dialog: clears the stored reason WITHOUT
   *  touching downloadStatus — the row keeps offering Retry (C1) —
   *  and a re-failure writes a fresh reason, reopening the dialog. */
  clearDownloadError: (specId: string) => void;
  startDownload: (
    modelId: string,
    file: HFModelFile | PresetModelFile,
    token?: string,
    /** VisionDownloadSheet's answer: text-only skips the projector leg, an
     *  explicit projector overrides the pairing rule. */
    options?: { visionEnabled?: boolean; projector?: ModelFile },
  ) => Promise<void>;
  /** Start from an already-built spec (interrupted-resume re-entry). */
  startSpecDownload: (
    spec: ModelSpec,
    // `oid` is HF's LFS content id: HFModelFile carries it, PresetModelFile
    // doesn't. It rides out as If-Range so a resume can never splice two
    // versions of the same path together.
    file: { name: string; size: number; downloadUrl: string; oid?: string },
    token?: string,
  ) => Promise<void>;
  /** Resume a killed download from its partial file (manual Resume). */
  resumeInterruptedDownload: (specId: string) => Promise<void>;
  /** Fetch ONLY the projector leg of a model whose LLM is already whole —
   *  the "Download projection model" action on a card. */
  startProjectorDownload: (specId: string) => Promise<void>;
  /** Mark partial on-disk files paused after launch so Resume continues them. */
  reconcileInterrupted: () => Promise<void>;
  /** Read the model's GGUF header at rest and store what it says, so the
   *  max trained context and the real KV-cache cost are known without
   *  loading the model. A no-op for remote models (their context length
   *  is the server's setting, not a model fact) and for rows that
   *  already carry metadata. */
  refreshGgufMetadata: (specId: string) => Promise<void>;
  pauseDownload: (jobId: string) => Promise<void>;
  resumeDownload: (jobId: string) => Promise<void>;
  cancelDownload: (jobId: string) => Promise<void>;
  /** Pause/resume by stored spec id (UI rows don't track job ids). */
  pauseModelDownload: (specId: string) => Promise<void>;
  resumeModelDownload: (specId: string) => Promise<void>;
  /** Abandon by stored spec id: cancels the job and deletes the partial
   * file, so the row returns to a plain Download (no resume). */
  cancelModelDownload: (specId: string) => Promise<void>;
  /** 401 recovery: drop the HF token and re-run the download. Only offered
   *  when the failure carries the "authentication" code — a 403 means the
   *  account cannot read the repo, which no token state changes. */
  retryWithoutToken: (specId: string) => Promise<void>;
}

export interface RemoteSlice {
  remoteApis: RemoteApiProvider[];
  /** Probed provider snapshots + privacy notice (remoteCaps parity) */
  remoteCaps: Record<string, RemoteCaps>;
  privacyAcknowledged: boolean;

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
  /** Attach the token to API requests. Kept as its own switch so a token
   *  that is causing auth failures can be parked without deleting it. */
  useHfToken: boolean;
  modelSettings: Record<string, ModelSettings>;

  /** Drop every per-model override (name/prompt/stop words) — PocketPal's
   *  resetModels restores each model's default settings; ours are stored
   *  centrally, so resetting = clearing the map. */
  resetModelSettings: () => Promise<void>;
  setHfToken: (token: string | null) => Promise<void>;
  setUseHfToken: (on: boolean) => Promise<void>;
  /** The token to send, honouring the Use HF Token switch. An explicit
   *  override wins: a caller passing one means it. */
  activeHfToken: (override?: string | null) => string | null;
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
  /** True once the persisted catalog, APIs, token and settings have been read
   * from disk. The app gates its first paint on this, so the chat screen can
   * never render "no model" against a store that simply hasn't read yet. */
  hydrated: boolean;
  /** Hydrate from disk. Single-flight and idempotent: the first caller
   * starts the read, concurrent callers await the same promise, and a call
   * after hydration returns immediately. */
  loadPersisted: () => Promise<void>;
}

export interface VisionHealSlice {
  /** Projector files the vision heal orphaned: the pairing that downloaded
   *  them is gone, the files are not. File NAMES, not model ids — LiAI's
   *  projector is an inline record on the model, not a model row. */
  pendingProjectionCleanup: string[];
  /** Re-derive the vision classification of a draft model (PocketPal's
   *  healDraftVisionClassification). */
  healDraftVisionClassification: () => Promise<void>;
  /** Delete the projector files the heal orphaned. */
  drainPendingProjectionCleanup: () => Promise<void>;
}

export interface WarningsSlice {
  /** Model ids the tool-compat notice has already been shown for.
   *  Persisted, so the notice stays a one-time thing across restarts
   *  (PocketPal parity: UIStore's `toolCompatWarnedModels`). */
  toolCompatWarnedModels: string[];
  /** Has this model already been warned about? */
  hasWarnedToolCompat: (modelId: string) => boolean;
  /** Record the warning and persist the set. Idempotent. */
  markToolCompatWarned: (modelId: string) => void;
}

export type ModelStore = CatalogSlice &
  DownloadsSlice &
  RemoteSlice &
  SettingsSlice &
  ActiveSlice &
  WarningsSlice &
  VisionHealSlice &
  PersistenceSlice;
