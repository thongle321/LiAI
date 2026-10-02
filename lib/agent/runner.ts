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
import { runTalent, type TalentSearchAuth } from "./registry.ts";

export interface AgentStep {
  id: string;
  tool: string;
  status: "done";
  input?: Record<string, unknown>;
  result?: string;
}

export type AgentEvent =
  | { type: "run_started" }
  | { type: "token"; text: string }
  | { type: "tool_call_started"; call: EngineToolCall }
  | { type: "tool_call_finished"; outcome: { callId: string; tool: string; result: string } }
  | { type: "run_finished" }
  | { type: "run_failed"; error: string };

export interface AgentResult {
  text: string;
  steps: AgentStep[];
  promptTokens: number;
  completionTokens: number;
  hitMaxTurns: boolean;
}

export interface AgentRunOptions {
  engine: CompletionEngine;
  messages: CompletionMessage[];
  tools: ToolDefinition[];
  /** Local file paths for a multimodal first turn (llama media_paths). */
  imagePaths?: string[];
  /** Local-only: jinja thinking blocks on/off for every loop turn. */
  enableThinking?: boolean;
  /** Local-only: jinja chat template on/off for every loop turn. */
  jinja?: boolean;
  /** Local-only: resolved sampling params for every loop turn. */
  sampler?: SamplerParams;
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

  onEvent({ type: "run_started" });

  try {
    for (let turn = 0; ; turn += 1) {
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
            ...(options.enableThinking !== undefined
              ? { enableThinking: options.enableThinking }
              : {}),
            ...(options.jinja !== undefined ? { jinja: options.jinja } : {}),
            ...(options.sampler ? { sampler: options.sampler } : {}),
          },
          {
            onToken: (delta) => {
              turnText += delta;
              onEvent({ type: "token", text: delta });
            },
            onToolCalls: (calls) => {
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
      promptTokens += outcome.promptTokens;
      completionTokens += outcome.completionTokens;
      // Outcome text wins (scripted engines); streamed tokens fill the gap.
      if (outcome.text) turnText = outcome.text;
      if (outcome.toolCalls.length > 0) turnCalls = outcome.toolCalls;
      text = turnText;

      const allowed = forcedFinal
        ? []
        : turnCalls.filter((c) => advertisedName(c, tools));
      const rejected = forcedFinal ? [] : turnCalls.filter((c) => !advertisedName(c, tools));
      for (const call of rejected) {
        const result = `Talent "${call.name}" is not enabled for this run`;
        steps.push({ id: call.id, tool: call.name, status: "done", result });
      }
      if (allowed.length === 0) {
        onEvent({ type: "run_finished" });
        return {
          text,
          steps,
          promptTokens,
          completionTokens,
          hitMaxTurns: forcedFinal,
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
        const result = await runTalent(call.name, call.arguments, {
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
          result,
        });
        onEvent({
          type: "tool_call_finished",
          outcome: { callId: call.id, tool: call.name, result },
        });
        toolMessages.push({
          role: "tool",
          content: result,
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
    return { text, steps, promptTokens, completionTokens, hitMaxTurns: false };
  }
}
