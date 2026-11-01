/** The global chat preset, read from storage.
 *
 *  This is the baseline every per-companion override layers over at chat time
 *  (store/chat/index.ts: preset → companion tuning), so a settings sheet that
 *  resolves its draft over anything else shows numbers the model never runs.
 *
 *  DEVICE ONLY: services/chat/tinybase.ts imports expo-sqlite, so it is reached
 *  by dynamic import and never at module scope. Storage that cannot answer
 *  falls back to the built-in defaults rather than failing the sheet.
 */

import { DEFAULT_SAMPLER, type SamplerParams } from "../inference/sampler.ts";

export async function loadGlobalPreset(): Promise<SamplerParams> {
  try {
    const { getSessionStore } = await import("./tinybase.ts");
    const store = await getSessionStore().catch(() => null);
    const global = store
      ? await store.getGlobalChatSettings().catch(() => null)
      : null;
    return global ?? { ...DEFAULT_SAMPLER };
  } catch {
    return { ...DEFAULT_SAMPLER };
  }
}
