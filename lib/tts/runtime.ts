import Speech from "@pocketpalai/react-native-speech";

import type { Engine, EngineId } from "./types.ts";

/**
 * Single-slot coordinator for the TTS native runtime.
 *
 * The fork's `Speech` module is global — only one engine has its model
 * loaded at a time. This owns the truth ("which engine is loaded in
 * native land") and serializes every swap. Engines route play/stop
 * through `acquire()`, which guarantees the requested engine is active
 * before the work runs.
 */
class TTSRuntime {
  private activeEngineId: EngineId | null = null;
  /** FIFO chain — guarantees no concurrent swaps. */
  private opMutex: Promise<unknown> = Promise.resolve();

  /** Run `fn` with `engine` guaranteed to be the active native engine. */
  async acquire<T>(engine: Engine, fn: () => Promise<T>): Promise<T> {
    return this.serialize(async () => {
      if (this.activeEngineId !== engine.id) {
        if (this.activeEngineId !== null) await this.releaseInternal();
        await engine.loadInto();
        this.activeEngineId = engine.id;
      }
      return fn();
    });
  }

  /** Release the active engine's native resources. No-op when idle. */
  async release(): Promise<void> {
    await this.serialize(async () => this.releaseInternal());
  }

  /**
   * Stop in-flight playback. Serialized with `acquire` so a later
   * `acquire()` runs AFTER the stop — otherwise a fire-and-forget stop
   * can cancel an utterance that was ordered later in JS but reached
   * native first.
   */
  async stop(): Promise<void> {
    await this.serialize(async () => {
      if (this.activeEngineId === null) return;
      try {
        await Speech.stop();
      } catch (err) {
        console.warn("[ttsRuntime] stop failed:", err);
      }
    });
  }

  getActiveEngineId(): EngineId | null {
    return this.activeEngineId;
  }

  /** Test-only reset — clears state and the mutex chain. */
  _resetForTests(): void {
    this.activeEngineId = null;
    this.opMutex = Promise.resolve();
  }

  private async releaseInternal(): Promise<void> {
    const prev = this.activeEngineId;
    if (prev === null) return;
    // System holds no neural resources; release() is a no-op there.
    if (prev !== "system") {
      try {
        await Speech.release();
      } catch (err) {
        console.warn(`[ttsRuntime] release failed for ${prev}:`, err);
      }
    }
    this.activeEngineId = null;
  }

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.opMutex.then(fn, fn);
    // Keep the chain alive even if `fn` rejects; the caller still sees it.
    this.opMutex = next.catch(() => undefined);
    return next;
  }
}

export const ttsRuntime = new TTSRuntime();