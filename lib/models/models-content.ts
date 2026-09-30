/** What the Models screen can render right now — in ONE place.
 *
 * The section components and the screen's empty state must agree on what
 * renders. They didn't: Ready returned null on an empty group and
 * Available was suppressed by `downloadedOnly`, so two leftover filter
 * flags (hfOnly + downloadedOnly, both persisted) rendered NOTHING and
 * the screen showed a blank body with no way to tell why. The rule that
 * matters for the screen is therefore stated once, here, beside the
 * rule Available uses for its own list.
 */

import { isPresetDownloaded } from "./file-state.ts";
import type { ModelSpec, PresetModel } from "../../types/models.ts";

/** Presets the Available section will render (finished ones live in Ready). */
export function downloadablePresets(
  presets: PresetModel[],
  models: ModelSpec[],
): PresetModel[] {
  return presets.filter((p) => !isPresetDownloaded(models, p));
}

export interface ModelsContentInput {
  readyVisible: boolean;
  availableVisible: boolean;
  /** The PocketPal `downloaded` filter: hides the Available section entirely. */
  downloadedOnly: boolean;
  downloadedCount: number;
  remoteCount: number;
  downloadableCount: number;
}

/** True when NO section will render a row. Each section's own rules:
 * Ready hides itself when empty (a "Ready to use (0)" header is dead UI);
 * Available hides itself when no preset is downloadable or downloadedOnly. */
export function modelsContentIsEmpty(c: ModelsContentInput): boolean {
  const readyShows = c.readyVisible && c.downloadedCount + c.remoteCount > 0;
  const availableShows =
    c.availableVisible && !c.downloadedOnly && c.downloadableCount > 0;
  return !readyShows && !availableShows;
}