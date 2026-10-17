/** One-slot engine manager: local context cached by file, remote per provider.
 *
 * Switching models stops the old engine first so generation never answers
 * on the wrong model. Factories inject (tests pass fakes); the app wires
 * the llama loader + remote BYOK factory. Errors propagate — the turn
 * builder maps them to the bubble.
 */

import type { CompletionEngine, EngineSource } from "./engine.ts";
import type { LlamaInitParams } from "./local-engine.ts";
import type { RemoteApiProvider } from "@/types/models.ts";

export interface EngineLoader {
  loadLocal(
    filePath: string,
    mmprojPath?: string,
    init?: LlamaInitParams,
  ): Promise<{
    engine: CompletionEngine;
    release(): Promise<void>;
  }>;
  createRemote(
    provider: RemoteApiProvider,
    getKey: () => Promise<string | null>,
  ): CompletionEngine;
}

/** Slot key fragment: ANY field the loader reads at init time belongs
 *  here — a field left out means a setting the user changes that does
 *  nothing while the slot stays warm (audit finding 1). */
function initKey(init: LlamaInitParams): string {
  return [
    init.n_ctx,
    init.n_gpu_layers,
    init.use_mlock ? 1 : 0,
    init.use_mmap ? 1 : 0,
    init.n_batch,
    init.n_ubatch,
    init.n_threads,
    init.flash_attn_type,
    init.cache_type_k,
    init.cache_type_v,
    init.speculative ? 1 : 0,
    init.spec_draft_n_gpu_layers,
    init.spec_draft_cache_type_k,
    init.spec_draft_cache_type_v,
    // The four the key used to ignore: each one reaches the loader.
    init.no_extra_bufts ? 1 : 0,
    (init.devices ?? []).join(","),
    init.model_draft ?? "none",
    init.image_max_tokens ?? 0,
  ].join("/");
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
  async ensure(
    source: EngineSource,
    mmprojPath?: string,
    init?: LlamaInitParams,
  ): Promise<CompletionEngine> {
    const key =
      source.kind === "local"
        ? `local:${source.fileName}:${mmprojPath ?? "none"}:${init ? initKey(init) : "default"}`
        : `remote:${source.provider.id}`;
    if (this.engine && this.key === key) return this.engine;
    if (this.engine) await quiet(this.engine.stopCompletion());
    if (this.release) await quiet(this.release());
    this.engine = null;
    this.release = null;
    if (source.kind === "local") {
      const loaded = await this.loader.loadLocal(source.fileName, mmprojPath, init);
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

  /** Stop the live generation without dropping the loaded model. */
  async stopActive(): Promise<void> {
    if (this.engine) await quiet(this.engine.stopCompletion());
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
