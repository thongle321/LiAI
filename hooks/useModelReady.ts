/** Can a turn actually be answered right now? (voice + vision precondition)
 *
 * The gate is the engine's own `selectEngineSource`, NOT `activeModelId`
 * alone. A persisted id whose file was deleted — or that never finished
 * downloading — rehydrates as non-null, so a naive `activeModelId !== null`
 * check lights the mic while the engine would return null and the turn
 * would die on "no model active" (the tap appears live but does nothing).
 * selectEngineSource additionally requires a completed local download or a
 * valid remote provider, so this can only ever under-report, never hide a
 * model that is genuinely ready.
 *
 * The chat store's `connection` is deliberately not used: it is only
 * refreshed by checkHealth() from ChatScreen and can go stale.
 */

import { useModelStore } from "@/store/model-store.ts";
import { selectEngineSource } from "@/services/inference/engine.ts";

export function useModelReady(): boolean {
  return useModelStore(
    (s) =>
      selectEngineSource({
        activeModelId: s.activeModelId,
        activeProviderType: s.activeProviderType,
        models: s.models,
        remoteApis: s.remoteApis,
      }) !== null,
  );
}
