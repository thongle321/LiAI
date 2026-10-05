/** Can the ACTIVE model see images this turn? (vision-series 03)
 *
 * The component-facing read of the ONE capability rule in
 * lib/inference/mmproj.ts — the same rule the send gate (send.ts) and
 * the engine load (mmproj attach) use. Synchronous by design: the rule
 * is pure over modelStore state, so the composer flips live on any
 * model switch with no effect, no async, and no disagreement with the
 * send path.
 */

import { useModelStore } from "../store/modelStore.ts";
import { specCanSeeImages } from "../lib/inference/mmproj.ts";

export function useMultimodalAvailable(): boolean {
  return useModelStore((s) =>
    specCanSeeImages(s.models, s.activeModelId, s.activeProviderType),
  );
}
