/** One-slot engine manager: local context cached by file, remote per provider.
 *
 * Switching models stops the old engine first so generation never answers
 * on the wrong model. Factories inject (tests pass fakes); the app wires
 * the llama loader + remote BYOK factory. Errors propagate — the turn
 * builder maps them to the bubble.
 */

import type { CompletionEngine, EngineSource } from "./engine.ts";
import type { RemoteApiProvider } from "../../types/models.ts";

export interface EngineLoader {
  loadLocal(filePath: string, mmprojPath?: string): Promise<{
    engine: CompletionEngine;
    release(): Promise<void>;
  }>;
  createRemote(
    provider: RemoteApiProvider,
    getKey: () => Promise<string | null>,
  ): CompletionEngine;
}

async function quiet(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {
    // Best-effort teardown only; a stuck context must not block the switch.
  }
}

export class EngineManager {
  private key: string | null = null;
  private engine: CompletionEngine | null = null;
  private release: (() => Promise<void>) | null = null;

  private readonly loader: EngineLoader;
  private readonly getRemoteKey: (providerId: string) => Promise<string | null>;

  constructor(
    loader: EngineLoader,
    getRemoteKey: (providerId: string) => Promise<string | null>,
  ) {
    this.loader = loader;
    this.getRemoteKey = getRemoteKey;
  }

  /** Engine for the source, reusing the slot when the key matches. */
  async ensure(source: EngineSource, mmprojPath?: string): Promise<CompletionEngine> {
    const key =
      source.kind === "local"
        ? `local:${source.fileName}`
        : `remote:${source.provider.id}`;
    if (this.engine && this.key === key) return this.engine;
    if (this.engine) await quiet(this.engine.stopCompletion());
    if (this.release) await quiet(this.release());
    this.engine = null;
    this.release = null;
    if (source.kind === "local") {
      const loaded = await this.loader.loadLocal(source.fileName, mmprojPath);
      this.engine = loaded.engine;
      this.release = loaded.release;
    } else {
      const provider = source.provider;
      this.engine = this.loader.createRemote(provider, () =>
        this.getRemoteKey(provider.id),
      );
    }
    this.key = key;
    return this.engine;
  }

  /** Stop and drop the slot (model switch, new conversation teardown). */
  async releaseAll(): Promise<void> {
    if (this.engine) await quiet(this.engine.stopCompletion());
    if (this.release) await quiet(this.release());
    this.engine = null;
    this.release = null;
    this.key = null;
  }
}
