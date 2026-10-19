/** Model management store, composed from focused slices.
 *
 * Public API is unchanged: import { useModelStore } from "../store/modelStore"
 * (that path re-exports this). Slices: catalog, downloads, remote, settings,
 * active, warnings, vision-heal, persistence.
 */

import { create } from "zustand";

import type { ModelStore } from "./types";
import { createActiveSlice } from "./active";
import { createCatalogSlice } from "./catalog";
import { createDownloadsSlice } from "./downloads";
import { createPersistenceSlice } from "./persistence";
import { createRemoteSlice } from "./remote";
import { createSettingsSlice } from "./settings";
import { createWarningsSlice } from "./warnings";
import { createVisionHealSlice } from "./vision-heal";

export type { ModelStore } from "./types";

export const useModelStore = create<ModelStore>()((...a) => ({
  ...createCatalogSlice(...a),
  ...createDownloadsSlice(...a),
  ...createRemoteSlice(...a),
  ...createSettingsSlice(...a),
  ...createActiveSlice(...a),
  ...createWarningsSlice()(...a),
  ...createVisionHealSlice()(...a),
  ...createPersistenceSlice(...a),
}));
