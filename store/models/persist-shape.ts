/** The one definition of what the model store puts on disk.
 *
 *  The persist middleware's `partialize` and the legacy migration's write
 *  both go through here, so a second writer cannot invent a second format —
 *  which is exactly how the catalog ended up writing a bare array over the
 *  middleware's blob. Whether a write is needed at all is decided by the
 *  deduped storage adapter (services/storage/persist-helpers.ts), not here.
 *  The read side is the merge cascade in store/models/index.ts. */

import type {
  ModelSettings,
  ModelSpec,
  RemoteApiProvider,
  RemoteCaps,
} from "@/types/models";
import type { HFSearchFilters, ModelStore } from "./types";

/** The Hub search filters a fresh install starts with.
 *
 *  The migration used to default to "downloads" while the store started at
 *  "relevance", so an upgraded user silently got a different sort. One
 *  default, both paths. */
export const DEFAULT_SEARCH_FILTERS: HFSearchFilters = {
  author: "",
  sortBy: "relevance",
};

/** A model as it goes to disk.
 *
 *  The apiKey never goes to disk — it lives in SecureStore. Neither do the
 *  transfer counters: they are live download state. An in-flight download
 *  re-derives its progress from the native downloader at launch, and a
 *  finished download does not need them — the size on screen comes from the
 *  model's file list. Leaving them in would make every progress tick a write
 *  of the whole catalog. */
export type PersistedModel = Omit<
  ModelSpec,
  "downloadProgress" | "downloadedBytes" | "totalBytes" | "speedBytesPerSec"
>;

/** The state the persisted slice is built from: the live store state. Declared
 *  once here by picking the persisted fields off `ModelStore`, so a rename or a
 *  new field only has to be made in one place. */
export type ModelStateSource = Pick<
  ModelStore,
  | "models"
  | "remoteApis"
  | "activeModelId"
  | "activeProviderType"
  | "modelSettings"
  | "largestSuccessfulBytes"
  | "remoteCaps"
  | "privacyAcknowledged"
  | "useHfToken"
  | "toolCompatWarnedModels"
  | "pendingProjectionCleanup"
  | "searchFilters"
>;

/** The persisted slice of the model store. */
export type PersistedModelState = Omit<ModelStateSource, "models"> & {
  models: PersistedModel[];
};

/** A model as it goes to disk: metadata only, no key, no transfer counters. */
export function persistedModel(model: ModelSpec): PersistedModel {
  const {
    downloadProgress,
    downloadedBytes,
    totalBytes,
    speedBytesPerSec,
    ...rest
  } = model;
  return { ...rest, apiKey: undefined };
}

/** A remote provider as it goes to disk: metadata only, never the key. */
export function persistedRemoteApi(
  provider: RemoteApiProvider,
): RemoteApiProvider {
  return { ...provider, apiKey: "" };
}

/** The whole persisted slice, from a state that carries at least these
 *  fields. The store satisfies it structurally; so does a state rebuilt by
 *  the legacy migration. */
export function persistedState(
  state: ModelStateSource,
): PersistedModelState {
  return {
    models: state.models.map(persistedModel),
    remoteApis: state.remoteApis.map(persistedRemoteApi),
    activeModelId: state.activeModelId,
    activeProviderType: state.activeProviderType,
    modelSettings: state.modelSettings,
    largestSuccessfulBytes: state.largestSuccessfulBytes,
    remoteCaps: state.remoteCaps,
    privacyAcknowledged: state.privacyAcknowledged,
    useHfToken: state.useHfToken,
    toolCompatWarnedModels: state.toolCompatWarnedModels,
    pendingProjectionCleanup: state.pendingProjectionCleanup,
    searchFilters: state.searchFilters,
  };
}
