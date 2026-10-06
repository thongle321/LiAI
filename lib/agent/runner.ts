/** Local agent loop: stream → dispatch talents → feed back (ADR-0009).
 *
 * Ports the pocketpal runAgent principles, not the file: a turn loop over
 * the CompletionEngine with tool-call dispatch through the local talent
 * registry, per-turn events for the store, and a forced-final pass when
 * the budget runs out. Outcomes are strings, never throws — engine
 * failures surface as run_failed and the run result stays well-formed.
 */

import type {
  CompletionEngine,
  CompletionMessage,
  EngineToolCall,
  ToolDefinition,
} from "../inference/engine.ts";
import type { SamplerParams } from "../inference/sampler.ts";
import type { TurnOutcomeFlags, ToolMetrics } from "../../types/chat.ts";
import { runTalent, type TalentSearchAuth } from "./registry.ts";

export interface AgentStep {
  id: string;
  tool: string;
  status: "done";
  input?: Record<string, unknown>;
  result?: string;
  /** False when the talent could not do its job. Undefined is not the same
   *  as true: absent means the row predates the discriminant, and renders
   *  conservatively rather than claiming a success nobody recorded. */
  ok?: boolean;
  /** Structured result for the renderer, never for the model. Rode an
   *  unchecked spread until C15 typed it, because the turn's step map
   *  reads it. */
  data?: Record<string, unknown>;
  /** Per-call cost of the GENERATION turn that produced this call (C15):
   *  streamed args → the tool-fragment count and the window from the
   *  first fragment; otherwise whole-turn usage from the turn start
   *  (the non-streaming remote path). Absent when neither was seen —
   *  absence is the cue. */
  metrics?: ToolMetrics;
}

export type AgentEvent =
  | { type: "run_started" }
  | { type: "token"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool_call_started"; call: EngineToolCall }
  | { type: "tool_call_delta" }
  | { type: "tool_call_finished"; outcome: { callId: string; tool: string; result: string; ok: boolean } }
  | { type: "run_finished" }
  | { type: "run_failed"; error: string };

export interface AgentResult {
  text: string;
  /** Last non-empty reasoning the completions reported (cumulative). */
  reasoning?: string;
  steps: AgentStep[];
  promptTokens: number;
  completionTokens: number;
  hitMaxTurns: boolean;
  /** How the turn ended. Taken from the LAST engine turn: an earlier turn
   *  filling the context is not how THIS answer finished, and OR-ing
   *  every turn would mark a turn that recovered as failed. */
  outcome?: TurnOutcomeFlags;
}

export interface AgentRunOptions {
  engine: CompletionEngine;
  messages: CompletionMessage[];
  tools: ToolDefinition[];
  /** Local file paths for a multimodal first turn (llama media_paths). */
  imagePaths?: string[];
  /** Remote vision (04): the turn's images as data URIs for OpenAI
   *  content arrays; local engines ignore these. */
  imageDataUris?: string[];
  /** Local-only: jinja thinking blocks on/off for every loop turn. */
  enableThinking?: boolean;
  /** Local-only: jinja chat template on/off for every loop turn. */
  jinja?: boolean;
  /** Local-only: resolved sampling params for every loop turn. */
  sampler?: SamplerParams;
  /** Per-model stop words applied to every loop turn. */
  stop?: string[];
  /** Per-model chat-template override (llama.rn only). */
  chatTemplate?: string;
  /** Per-model generation-prompt override (llama.rn only). */
  addGenerationPrompt?: boolean;
  fetchImpl: typeof fetch;
  search: TalentSearchAuth | null;
  userTexts?: string[];
  maxTurns?: number;
  onEvent: (event: AgentEvent) => void;
}

export const DEFAULT_MAX_TURNS = 5;

const BUDGET_EXHAUSTED_NUDGE =
  "(Tool budget exhausted. Answer now using only the information gathered above.)";

function advertisedName(call: EngineToolCall, tools: ToolDefinition[]): boolean {
  return tools.some((t) => t.function.name === call.name);
}

function parseArgs(argsJson: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(argsJson || "{}");
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Run the turn loop; resolves with the final text + step provenance. */
export async function runLocalAgent(options: AgentRunOptions): Promise<AgentResult> {
  const {
    engine,
    tools,
    fetchImpl,
    search,
    userTexts,
    maxTurns = DEFAULT_MAX_TURNS,
    onEvent,
  } = options;
  let messages = options.messages;
  const steps: AgentStep[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let text = "";
  let reasoning = "";
  // Function-scoped, not per-iteration: the outer catch returns from
  // outside the loop, and the LAST turn's ending is what this answer's
  // ending is.
  let endFlags: TurnOutcomeFlags | undefined;

  onEvent({ type: "run_started" });

  try {
    for (let turn = 0; ; turn += 1) {
      const turnStartedAt = Date.now();
      // Parity fact-check (C15): llama.rn fires onToolCalls once per
      // token while tool args stream, each with the accumulated set —
      // the count of those fires is PocketPal's tool-carrying-delta
      // count. Per turn, reset with the turn.
      let toolFragmentCalls = 0;
      let firstToolCallAt: number | null = null;
      const forcedFinal = turn >= maxTurns;
      const requestMessages =
        forcedFinal && turn > 0
          ? [
              ...messages,
              { role: "user", content: BUDGET_EXHAUSTED_NUDGE } as CompletionMessage,
            ]
          : messages;
      let turnText = "";
      let turnCalls: EngineToolCall[] = [];
      let outcome;
      try {
        outcome = await engine.completion(
          {
            messages: requestMessages,
            ...(forcedFinal ? {} : tools.length > 0 ? { tools } : {}),
            ...(turn === 0 && options.imagePaths && options.imagePaths.length > 0
              ? { imagePaths: options.imagePaths }
              : {}),
            ...(turn === 0 && options.imageDataUris && options.imageDataUris.length > 0
              ? { imageDataUris: options.imageDataUris }
              : {}),
            ...(options.enableThinking !== undefined
              ? { enableThinking: options.enableThinking }
              : {}),
            ...(options.jinja !== undefined ? { jinja: options.jinja } : {}),
            ...(options.sampler ? { sampler: options.sampler } : {}),
            ...(options.stop && options.stop.length > 0
              ? { stop: options.stop }
              : {}),
            ...(options.chatTemplate && options.chatTemplate.trim() !== ""
              ? { chatTemplate: options.chatTemplate }
              : {}),
            ...(options.addGenerationPrompt !== undefined
              ? { addGenerationPrompt: options.addGenerationPrompt }
              : {}),
          },
          {
            onToken: (delta) => {
              turnText += delta;
              onEvent({ type: "token", text: delta });
            },
            // Cumulative, like llama.rn's reasoning_content: the store
            // replaces, never appends.
            onReasoning: (cumulative) => {
              if (cumulative === "") return;
              reasoning = cumulative;
              onEvent({ type: "reasoning", text: cumulative });
            },
            onToolCalls: (calls) => {
              if (calls.length > 0) {
                toolFragmentCalls += 1;
                firstToolCallAt ??= Date.now();
                // llama.rn fires once per streamed token while args
                // assemble — this event IS the token count's honest
                // source. Reply text travels onToken, never this one.
                onEvent({ type: "tool_call_delta" });
              }
              turnCalls = calls;
            },
          },
        );
      } catch (err) {
        onEvent({
          type: "run_failed",
          error: err instanceof Error ? err.message : String(err),
        });
        return { text, steps, promptTokens, completionTokens, hitMaxTurns: false };
      }
      // C3: promptTokens is occupancy — tokens HELD against the window —
      // so the LAST step's figure is the thread's (every step shares one
      // KV cache; summing per-step residency would multiply-count it).
      // Generated tokens are genuinely per-step work: those add up.
      promptTokens = outcome.promptTokens;
      completionTokens += outcome.completionTokens;
      // The LAST turn's ending is this answer's ending. `hitMaxTurns` is
      // tracked separately: a forced final turn is a truncation too, but
      // of the tool loop rather than the context window, and the two mean
      // different things to a reader.
endFlags = {
      ...(outcome.contextFull !== undefined ||
      outcome.interrupted !== undefined ||
      outcome.stoppedEarly !== undefined
        ? {
            contextFull: outcome.contextFull,
            interrupted: outcome.interrupted,
            stoppedEarly: outcome.stoppedEarly,
          }
        : {}),
      ...(outcome.timings !== undefined ? { timings: outcome.timings } : {}),
    };
      // Outcome text wins (scripted engines); streamed tokens fill the gap.
      if (outcome.text) turnText = outcome.text;
      if (outcome.reasoning) reasoning = outcome.reasoning;
      if (outcome.toolCalls.length > 0) turnCalls = outcome.toolCalls;
      text = turnText;

      // C15 + parity fact-check: per-call cost of THIS generation turn,
      // replicated onto each call of a multi-tool turn (the same
      // overstatement PocketPal's ToolMetricsFooter accepts).
      //
      // Tokens: two or more fragment fires PROVE the args streamed
      // token-by-token, so their count is PocketPal's delta count — the
      // tokens actually spent producing the call. A single fire is the
      // non-streaming remote path (whole body at once) or an
      // outcome-only engine, where whole-turn usage is the only
      // measurable figure. Duration anchors at the first fragment when
      // streaming, else at the turn start — PocketPal's two windows.
      // Absent when neither fragments nor tokens were seen: absence is
      // the cue.
      const streamed = toolFragmentCalls >= 2;
      const anchor =
        streamed && firstToolCallAt !== null ? firstToolCallAt : turnStartedAt;
      const tokens = streamed ? toolFragmentCalls : outcome.completionTokens;
      const stepMetrics =
        tokens > 0 ? { tokens, durationMs: Date.now() - anchor } : undefined;
      const allowed = forcedFinal
        ? []
        : turnCalls.filter((c) => advertisedName(c, tools));
      const rejected = forcedFinal ? [] : turnCalls.filter((c) => !advertisedName(c, tools));
      for (const call of rejected) {
        // A rejected call never ran, so it certainly did not succeed.
        // Without `ok` here it reads as UNKNOWN and renders as a result,
        // which is the exact bug this discriminant exists to kill.
        const rejectedReason = `Talent "${call.name}" is not enabled for this run`;
        steps.push({
          id: call.id,
          tool: call.name,
          status: "done",
          result: rejectedReason,
          ok: false,
          ...(stepMetrics !== undefined ? { metrics: stepMetrics } : {}),
        });
      }
      if (allowed.length === 0) {
        onEvent({ type: "run_finished" });
        return {
          text,
          ...(reasoning !== "" ? { reasoning } : {}),
          steps,
          promptTokens,
          completionTokens,
          hitMaxTurns: forcedFinal,
          ...(endFlags !== undefined ? { outcome: endFlags } : {}),
        };
      }

      const toolMessages: CompletionMessage[] = [
        {
          role: "assistant",
          content: turnText,
          tool_calls: allowed,
        },
      ];
      for (const call of allowed) {
        onEvent({ type: "tool_call_started", call });
        // Named `talent`, not `outcome`: the engine's `outcome` is already
        // in scope from the loop above, and shadowing it is how two very
        // different results get confused for each other.
        const talent = await runTalent(call.name, call.arguments, {
          fetchImpl,
          search,
          userTexts,
        });
        const input = parseArgs(call.arguments);
        steps.push({
          id: call.id,
          tool: call.name,
          status: "done",
          ...(input ? { input } : {}),
          result: talent.content,
          ok: talent.ok,
          // Rides to the store so a settled turn's renderer can draw the
          // structured shape instead of parsing the fenced markdown.
          ...(talent.data !== undefined ? { data: talent.data } : {}),
          ...(stepMetrics !== undefined ? { metrics: stepMetrics } : {}),
        });
        onEvent({
          type: "tool_call_finished",
          outcome: {
            callId: call.id,
            tool: call.name,
            result: talent.content,
            ok: talent.ok,
          },
        });
        toolMessages.push({
          role: "tool",
          content: talent.content,
          tool_call_id: call.id,
        });
      }
      messages = [...requestMessages, ...toolMessages];
      // Loop continues; the forced-final pass answers next iteration.
    }
  } catch (err) {
    onEvent({
      type: "run_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      text,
      ...(reasoning !== "" ? { reasoning } : {}),
      steps,
      promptTokens,
      completionTokens,
      hitMaxTurns: false,
      ...(endFlags !== undefined ? { outcome: endFlags } : {}),
    };
  }
}
