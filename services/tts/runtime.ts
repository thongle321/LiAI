/** Single-slot coordinator for the TTS native runtime (ticket 03 /
 * spec Q14) — the pocketpal technique on LiAI's stack.
 *
 * Only one neural engine can hold the native slot at a time. Engine
 * wrappers route `play()` through `acquire()`, which guarantees the
 * requested engine is the active one (releasing the previous slot and
 * loading the new engine on a swap) before invoking the work fn.
 * All operations run on one FIFO mutex, so concurrent acquires queue
 * rather than race.
 *
 * `stop()` is serialized behind any in-flight acquire — the property
 * that keeps a fire-and-forget stop from cancelling a later-ordered
 * utterance. Note the flip side: while an engine's play fn is holding
 * the slot, serialized `stop()` waits for it. The store's immediate
 * stop path therefore calls `engine.stop()` directly (pocketpal's
 * store does the same); runtime `stop()` is for lifecycle teardown
 * between acquires.
 */

import type { Engine, EngineId } from "./types.ts";

export class TTSRuntime {
  /** The engine currently holding the native slot; null when released. */
  private active: Engine | null = null;
  /** FIFO chain of pending operations — guarantees no concurrent swaps. */
  private opMutex: Promise<unknown> = Promise.resolve();

  /** Run `fn` with `engine` guaranteed to be the active engine. */
  async acquire<T>(engine: Engine, fn: () => Promise<T>): Promise<T> {
    return this.serialize(async () => {
      if (this.active?.id !== engine.id) {
        await this.releaseInternal();
        await engine.loadInto();
        this.active = engine;
      }
      return fn();
    });
  }

  /** Release the active engine's slot. No-op when nothing is active. */
  async release(): Promise<void> {
    await this.serialize(() => this.releaseInternal());
  }

  /** Stop the active engine's playback, serialized with `acquire`. */
  async stop(): Promise<void> {
    await this.serialize(async () => {
      if (this.active === null) return;
      try {
        await this.active.stop();
      } catch (err) {
        console.warn("[ttsRuntime] stop failed:", err);
      }
    });
  }

  /** Read-only view of which engine holds the slot. */
  getActiveEngineId(): EngineId | null {
    return this.active?.id ?? null;
  }

  private async releaseInternal(): Promise<void> {
    const prev = this.active;
    if (prev === null) return;
    this.active = null;
    // A slot swap must not leave the previous engine audible.
    try {
      await prev.stop();
    } catch (err) {
      console.warn(`[ttsRuntime] release failed for ${prev.id}:`, err);
    }
  }

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.opMutex.then(fn, fn);
    // Keep the chain alive even if `fn` rejects. Swallow only here; the
    // returned promise still propagates the rejection to the caller.
    this.opMutex = next.catch(() => undefined);
    return next;
  }
}

/** The app's runtime singleton. */
export const ttsRuntime = new TTSRuntime();
