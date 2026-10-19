/** The one definition of what the model store puts on disk.
 *
 *  Everything that reads or writes the persisted model state goes through
 *  here: the persist middleware's `partialize`, the legacy migration's
 *  write, and the change detector that decides whether a write is needed at
 *  all. One shape, one owner — a second writer cannot invent a second
 *  format, which is exactly how the catalog ended up writing a bare array
 *  over the middleware's blob.
 */

import type {
  ModelSettings,
  ModelSpec,
  RemoteApiProvider,
  RemoteCaps,
} from "@/types/models";
import type { HFSearchFilters } from "./types";

/** The Hub search filters a fresh install starts with.
 *
 *  The migration used to default to "downloads" while the store started at
 *  "relevance", so an upgraded user silently got a different sort. One
 *  default, both paths. */
export const DEFAULT_SEARCH_FILTERS: HFSearchFilters = {
  author: "",
  sortBy: "relevance",
};

/** The persisted slice of the model store. */
export interface PersistedModelState {
  models: ModelSpec[];
  remoteApis: RemoteApiProvider[];
  activeModelId: string | null;
  activeProviderType: "local" | "remote" | null;
  modelSettings: Record<string, ModelSettings>;
  largestSuccessfulBytes: number;
  remoteCaps: Record<string, RemoteCaps>;
  privacyAcknowledged: boolean;
  useHfToken: boolean;
  toolCompatWarnedModels: string[];
  pendingProjectionCleanup: string[];
  searchFilters: HFSearchFilters;
}

/** A model as it goes to disk.
 *
 *  The apiKey never goes to disk — it lives in SecureStore. The byte
 *  counters do not either: they are live transfer state, re-derived from
 *  the native downloader at launch (resume reads the partial file, not
 *  these fields). Leaving them in would make every progress tick a write
 *  of the whole catalog. */
export function persistedModel(model: ModelSpec): ModelSpec {
  return {
    ...model,
    apiKey: undefined,
    downloadProgress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    speedBytesPerSec: undefined,
  };
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
  state: PersistedModelState,
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
