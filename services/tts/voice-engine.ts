/** Voice engine execution seam (Phase 3.1).
 *
 *  Extracted from store/voice.ts so play/stop logic is testable with a fake
 *  engine instead of the whole native graph. The store keeps persisted state
 *  and playback-state transitions; this module owns engine resolution and
 *  the acquire/play/teardown flow. */
import { getEngine } from "./engineRegistry.ts";
import { ttsRuntime } from "./runtime.ts";
import type { Voice } from "./types.ts";

export interface VoiceEngineDeps {
  stop: () => Promise<void>;
}

export async function playVoice(
  text: string,
  voice: Voice,
  options: { speed?: number },
  deps: VoiceEngineDeps,
): Promise<void> {
  const engine = getEngine(voice.engine);
  try {
    const installed = await engine.isInstalled().catch(() => true);
    if (installed === false && voice.engine === "system") {
      await deps.stop();
      return;
    }
    // For neural engines, proceed even if isInstalled() is uncertain;
    // let the engine/runtime decide.
  } catch {
    // ignore
  }
  await ttsRuntime.acquire(engine, () => engine.play(text, voice));
}