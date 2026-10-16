/** The model card's action row, copied from PocketPal's
 * `renderActionButtons` (pocketpal-ai/src/screens/ModelsScreen/ModelCard/
 * ModelCard.tsx:377-586).
 *
 * Pure: the card draws whatever this returns. Every branch there is one
 * line of logic, and getting it wrong means a card that offers Delete on
 * a model with no file, so it is tested rather than read.
 *
 * Divergence: PocketPal has no paused state, so its download branch is a
 * single Cancel. Ours keeps Pause/Resume inside the same primary slot —
 * a capability the reference does not have, kept by request.
 */

import type { ModelSpec } from "../../types/models.ts";

/** In flight or paused — the states that show a progress bar. Spelled out
 *  here rather than imported from `components/models/model-bits.tsx`: a lib
 *  module must not reach up into components, and this is two comparisons. */
function inProgress(status: ModelSpec["downloadStatus"]): boolean {
  return status === "downloading" || status === "paused";
}

export type CardAction =
  | "cancel"
  | "download"
  | "load"
  | "offload"
  | "settings"
  /** X: takes the model off the list, nothing on disk goes away. */
  | "remove"
  /** Trash: deletes the downloaded file. */
  | "delete"
  | "expand";

export function cardActions({
  status,
  isActive,
  downloadable,
}: {
  status: ModelSpec["downloadStatus"];
  isActive: boolean;
  /** The card is a bookmark with no file yet — PocketPal's not-downloaded
   *  branch, which offers Download instead of Load/Offload. */
  downloadable: boolean;
}): CardAction[] {
  // Downloading is its own row: one wide Cancel and nothing else
  // (:426-453). Ours carries the progress bar and Pause/Resume in the
  // same slot.
  if (inProgress(status)) return ["cancel"];
  if (downloadable) return ["download", "settings", "remove", "expand"];
  return [
    isActive ? "offload" : "load",
    "settings",
    "delete",
    "expand",
  ];
}

/** The header's status dot: shown only when a file is on disk, green when
 *  loaded and grey when merely downloaded (:314-327). */
export function statusDotState({
  status,
  isActive,
}: {
  status: ModelSpec["downloadStatus"];
  isActive: boolean;
}): "active" | "idle" | null {
  if (status !== "completed") return null;
  return isActive ? "active" : "idle";
}
