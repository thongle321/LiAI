/** Remote BYOK engine: OpenAI-compatible completion (ADR-0008 fallback).
 *
 * Non-streaming request (RN fetch has no streaming body); the full reply
 * emits as one token. Tool calls project to the shared EngineToolCall
 * shape with fallback ids. AbortController gives stopCompletion teeth.
 */

import type {
  CompletionEngine,
  CompletionRequest,
  CompletionCallbacks,
  CompletionOutcome,
  EngineToolCall,
} from "./engine.ts";
import type { RemoteApiProvider } from "@/types/models.ts";
import { asRecord, positiveFinite } from "@/utils/guards.ts";

export interface RemoteEngineOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

/** The one rule for a stored timeout: finite and positive, else unset.
 *  Unset means "use the default" — never zero, never a negative timer.
 *  The predicate itself lives in utils/guards.ts; it is re-exported under
 *  this name so the issue-02 seam and its test stay put. */
export const normalizeTimeoutMs = positiveFinite;

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** OpenAI wire messages. Remote vision (04): when the turn carries data
 *  URIs, the LAST user message becomes a content array
 *  ([{type:'text'},…{type:'image_url'}]) — PocketPal's exact shape
 *  (useChatSession.ts:87-97). Exported for the request-builder tests. */
export function toWireMessages(request: CompletionRequest): Record<string, unknown>[] {
  const images = request.imageDataUris ?? [];
  const lastUser =
    images.length > 0
      ? request.messages.reduce(
          (found, m, i) => (m.role === "user" ? i : found),
          -1,
        )
      : -1;
  return request.messages.map((m, i) => {
    const base: Record<string, unknown> = {
      role: m.role,
      content:
        i === lastUser
          ? [
              { type: "text", text: m.content },
              ...images.map((url) => ({ type: "image_url", image_url: { url } })),
            ]
          : m.content,
    };
    if (m.tool_calls !== undefined) {
      base["tool_calls"] = m.tool_calls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: c.arguments },
      }));
    }
    if (m.tool_call_id !== undefined) base["tool_call_id"] = m.tool_call_id;
    if (m.name !== undefined) base["name"] = m.name;
    return base;
  });
}

function toEngineCalls(raw: unknown): EngineToolCall[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry, index) => {
    const row = asRecord(entry);
    const fn = row ? asRecord(row["function"]) : null;
    const name = fn ? asString(fn["name"]) : null;
    if (!name) return [];
    const id = asString(row?.["id"]) ?? `remote_${index}`;
    const args = fn ? asString(fn["arguments"]) ?? "{}" : "{}";
    return [{ id, name, arguments: args }];
  });
}

/** BYOK OpenAI-compatible engine; key arrives per call, never stored. */
export function createRemoteEngine(
  provider: RemoteApiProvider,
  getKey: () => Promise<string | null>,
  options: RemoteEngineOptions = {},
): CompletionEngine {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = normalizeTimeoutMs(options.timeoutMs) ?? DEFAULT_TIMEOUT_MS;  let controller: AbortController | null = null;
  // A stop can land while the async key lookup is still in flight —
  // remember it so the fetch below aborts instead of escaping.
  let stopped = false;

  return {
    async completion(
      request: CompletionRequest,
      callbacks: CompletionCallbacks,
    ): Promise<CompletionOutcome> {
      stopped = false;
      const key = await getKey().catch(() => null);
      if (stopped) {
        throw new Error("remote completion aborted");
      }
      if (!key || key.trim() === "") {
        throw new Error("remote key is required");
      }
      const baseUrl = provider.baseUrl.replace(/\/$/, "");
      controller = new AbortController();
      const timer = setTimeout(() => controller?.abort(), timeoutMs);
      try {
        const resp = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: provider.modelName,
            messages: toWireMessages(request),
            ...(request.tools && request.tools.length > 0
              ? { tools: request.tools }
              : {}),
            ...(request.stop && request.stop.length > 0
              ? { stop: request.stop }
              : {}),
            // Reasoning effort rides the provider's own channel (PocketPal
            // bodyExtras parity): OpenRouter takes a top-level
            // reasoning_effort, while llama-server/vLLM-style endpoints
            // ignore it and read chat_template_kwargs instead.
            ...(request.reasoningEffort !== undefined
              ? provider.providerType === "openrouter"
                ? { reasoning_effort: request.reasoningEffort }
                : {
                    chat_template_kwargs: {
                      reasoning_effort: request.reasoningEffort,
                    },
                  }
              : {}),
          }),
          signal: controller.signal,
        });
        if (!resp.ok) {
          const body = (await resp.json().catch(() => ({}))) as Record<string, unknown> | null;
          const message =
            (body && typeof body === "object" && asRecord(body["error"])
              ? (body["error"] as Record<string, unknown>)["message"]
              : body && typeof body === "object"
                ? body["message"]
                : undefined) ?? undefined;
          throw new Error(
            `remote completion failed (${resp.status})${message ? `: ${String(message)}` : ""}`,
          );
        }
        const payload: unknown = await resp.json();
        const choice = asRecord(payload)
          ? ((): Record<string, unknown> | null => {
              const choices = (payload as Record<string, unknown>)["choices"];
              if (!Array.isArray(choices) || choices.length === 0) return null;
              return asRecord(choices[0]);
            })()
          : null;
        const message = choice ? asRecord(choice["message"]) : null;
        const text = message ? (asString(message["content"]) ?? "") : "";
        const toolCalls = message ? toEngineCalls(message["tool_calls"]) : [];
        const usage = asRecord(payload) ? asRecord((payload as Record<string, unknown>)["usage"]) : null;
        // C3: OpenAI's contract makes prompt_tokens INCLUDE the cached
        // subset in prompt_tokens_details — summing both would double
        // count. Each key is guarded on its own: a server that omits the
        // total but reports the subset still yields real occupancy, and
        // only "nothing reported at all" lands on zero.
        const details = usage ? asRecord(usage["prompt_tokens_details"]) : null;
        const promptTokens =
          asNumber(usage?.["prompt_tokens"]) ??
          asNumber(details?.["cached_tokens"]) ??
          0;
        const completionTokens = usage ? (asNumber(usage["completion_tokens"]) ?? 0) : 0;
        // `finish_reason: "length"` means the response hit SOME token cap. On
        // an OpenAI-compatible endpoint we cannot tell the model's context
        // window from a server-side max_tokens, so we report the cut-short
        // fact and deliberately NOT claim the context is full — a false
        // "context full" banner on a remote turn would be worse than none.
        const hitLengthCap = choice?.["finish_reason"] === "length";
        if (text !== "") callbacks.onToken(text);
        callbacks.onToolCalls?.(toolCalls);
        return {
          text,
          toolCalls,
          promptTokens,
          completionTokens,
          stoppedEarly: hitLengthCap,
          contextFull: false,
          interrupted: false,
          // No timings: an OpenAI-compatible endpoint does not report them,
          // and inventing an estimate would put fiction in the turn footer.
        };
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error("remote completion aborted");
        }
        throw err instanceof Error ? err : new Error(String(err));
      } finally {
        clearTimeout(timer);
        controller = null;
      }
    },

    async stopCompletion(): Promise<void> {
      stopped = true;
      controller?.abort();
    },
  };
}
