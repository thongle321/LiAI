/** Structured output hook: acquires the engine slot, calls the engine
 *  with a JSON schema, and returns the parsed result.
 *
 *  Mirrors PocketPal's `useStructuredOutput` but uses LiAI's
 *  EngineManager singleton. The generation runs through the same
 *  serialized slot as chat turns, so it won't race with an active turn.
 */

import { useCallback, useRef, useState } from "react";

import { getManager } from "@/store/chat/index.ts";
import type { CompletionRequest, CompletionEngine, CompletionOutcome, EngineSource } from "@/services/inference/engine.ts";
import { selectEngineSource } from "@/services/inference/engine.ts";
import { useModelStore } from "@/store/model-store.ts";
import { DEFAULT_SAMPLER } from "@/services/inference/sampler.ts";

interface UseStructuredOutputReturn {
  /** Call the engine with a prompt and JSON schema. Returns parsed JSON. */
  generate: (prompt: string, schema: object) => Promise<Record<string, unknown> | undefined>;
  isGenerating: boolean;
  isBusy: boolean;
  /** Stop an in-flight generation. */
  stop: () => void;
  /** Cancel and release the engine slot. */
  cancel: () => void;
  error: string | null;
}

export function useStructuredOutput(): UseStructuredOutputReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leaseRef = useRef<{ abort: () => void } | null>(null);
  const cancelledRef = useRef(false);

  const activeModelId = useModelStore((s) => s.activeModelId);
  const activeProviderType = useModelStore((s) => s.activeProviderType);
  const models = useModelStore((s) => s.models);
  const remoteApis = useModelStore((s) => s.remoteApis);

  const stop = useCallback(() => {
    leaseRef.current?.abort();
    setIsGenerating(false);
  }, []);

  const cancel = useCallback(() => {
    setIsBusy(false);
    if (!leaseRef.current) {
      return;
    }
    cancelledRef.current = true;
    leaseRef.current.abort();
  }, []);

  const generate = useCallback(
    async (prompt: string, schema: object): Promise<Record<string, unknown> | undefined> => {
      cancelledRef.current = false;
      setIsBusy(false);
      const manager = getManager();

      // Determine the engine source (same logic as chat turns)
      const source = selectEngineSource({
        activeModelId,
        activeProviderType,
        models,
        remoteApis,
      });
      if (!source) {
        setError("No active model selected");
        return undefined;
      }

      const lease = await acquireLease(manager, source);
      if (!lease) {
        if (manager.isLoaded()) {
          setIsBusy(true);
          return undefined;
        }
        setError("Model not loaded");
        return undefined;
      }

      const onAbort = () => lease.engine.stopCompletion();
      try {
        leaseRef.current = lease;
        setIsGenerating(true);
        setError(null);

        const request: CompletionRequest = {
          messages: [{ role: "user", content: prompt }],
          responseFormat: {
            type: "json_schema",
            json_schema: {
              strict: true,
              schema,
            },
          },
          sampler: { ...DEFAULT_SAMPLER, temperature: 0.2, topP: 0.9, topK: 40 },
          enableThinking: false,
        };

        const outcome = await lease.engine.completion(request, {
          onToken: () => {},
        });

        if (cancelledRef.current) return undefined;

        return JSON.parse(outcome.text) as Record<string, unknown>;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to generate";
        setError(errorMessage);
        throw err;
      } finally {
        lease.signal?.removeEventListener?.("abort", onAbort);
        lease.end();
        leaseRef.current = null;
        setIsGenerating(false);
      }
    },
    [activeModelId, activeProviderType, models, remoteApis],
  );

  return {
    generate,
    isGenerating,
    isBusy,
    stop,
    cancel,
    error,
  };
}

/** Lease for a single structured generation. Mirrors PocketPal's
 *  GenerationLease but uses LiAI's EngineManager.ensure() which
 *  already handles slot serialization. */
interface GenerationLease {
  engine: CompletionEngine;
  end: () => Promise<void>;
  abort: () => void;
  signal: { addEventListener: (event: string, listener: () => void, options?: { once?: boolean }) => void; removeEventListener: (event: string, listener: () => void) => void };
}

async function acquireLease(
  manager: { ensure: (source: EngineSource) => Promise<CompletionEngine> },
  source: EngineSource,
): Promise<GenerationLease | null> {
  try {
    const engine = await manager.ensure(source);
    return {
      engine,
      end: async () => {},
      abort: () => engine.stopCompletion(),
      signal: {
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    };
  } catch {
    return null;
  }
}