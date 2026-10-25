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
import type { EffortLevel } from "@/utils/reasoning-capability.ts";
import type { TurnOutcomeFlags, ToolMetrics, TurnBlock } from "@/types/chat.ts";
import {
  runTalent,
  type TalentOutcome,
  type TalentSearchAuth,
} from "./registry.ts";
import { seedReadUrlAllowlist } from "./allowlist.ts";

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
  /** The whole reply: every text segment, not only the last one. */
  text: string;
  /** Last non-empty reasoning the completions reported (cumulative). */
  reasoning?: string;
  steps: AgentStep[];
  /** Ordered blocks the way the model produced them. */
  blocks?: TurnBlock[];
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
  /** The consumer's Stop. Aborts every dispatched talent (network
   *  requests included) and prevents the loop from starting more. */
  signal?: AbortSignal;
  /** Local file paths for a multimodal first turn (llama media_paths). */
  imagePaths?: string[];
  /** Remote vision (04): the turn's images as data URIs for OpenAI
   *  content arrays; local engines ignore these. */
  imageDataUris?: string[];
  /** Local-only: jinja thinking blocks on/off for every loop turn. */
  enableThinking?: boolean;
  /** Local-only: graded reasoning effort for every loop turn. */
  reasoningEffort?: EffortLevel;
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
  /** Persisted steps of THIS session's earlier turns (PocketPal's
   *  sessionRows): web_search hit URLs and read_url links recorded before
   *  the last reload re-seed the allowlist, so a restored conversation
   *  still admits the URLs it once surfaced. */
  sessionSteps?: Array<{ tool?: string; data?: Record<string, unknown> }>;
  maxTurns?: number;
  onEvent: (event: AgentEvent) => void;
}

export const DEFAULT_MAX_TURNS = 5;

/** PocketPal #999: one reply may name several tools, and they are network
 *  work — four at a time keeps the reply responsive without tripping the
 *  providers' rate limits. */
const MAX_IN_FLIGHT_TOOL_CALLS = 4;

const BUDGET_EXHAUSTED_NUDGE =
  "(Tool budget exhausted. Answer now using only the information gathered above.)";

const NO_FUNCTION_NAME = "Unknown talent (no function name)";

/** A call that never ran, as an outcome the step list can carry. */
function cancelledOutcome(call: EngineToolCall): TalentOutcome {
  return {
    ok: false,
    content: `${call.name || NO_FUNCTION_NAME}: cancelled`,
  };
}

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
    sessionSteps,
    maxTurns = DEFAULT_MAX_TURNS,
    signal,
    onEvent,
  } = options;
  let messages = options.messages;
  const steps: AgentStep[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let text = "";
  let reasoning = "";
  // Runner-owned: every early exit (Stop, a thrown turn, the end of the
  // run) aborts what is still in flight, without mutating the caller's
  // signal. The consumer's signal only ever turns this one on.
  const toolController = new AbortController();
  const started: Promise<TalentOutcome>[] = [];
  // The runner is the one layer holding both the signal and the engine, so
  // it owns the abort → stopCompletion translation (PocketPal #999). The
  // store's Stop also stops the engine directly; this covers the other
  // abort paths (abandoning the conversation) and keeps a stopped turn from
  // decoding on behind a view that is already gone.
  let pendingCompletion: Promise<unknown> | null = null;
  const onAbort = () => {
    toolController.abort();
    if (pendingCompletion !== null) void engine.stopCompletion();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) toolController.abort();
  // Without a caller signal the talents see exactly what they saw before:
  // no signal at all (PocketPal's `signal ? toolController.signal : undefined`).
  const toolSignal = signal !== undefined ? toolController.signal : undefined;
  // Ordered narrative. A tool call ends the current text/reasoning
  // segment: text spoken after the call is a NEW block, not more of the
  // same paragraph. Tool segments reference the same id the flat steps
  // list carries, so nothing is duplicated.
  const blocks: TurnBlock[] = [];
  let textSeg: { kind: "text"; text: string } | null = null;
  let reasoningSeg: { kind: "reasoning"; text: string } | null = null;
  // Function-scoped, not per-iteration: the outer catch returns from
  // outside the loop, and the LAST turn's ending is what this answer's
  // ending is.
  let endFlags: TurnOutcomeFlags | undefined;

  onEvent({ type: "run_started" });
  // The read_url allowlist is process-global. Every run resets it and
  // re-seeds from exactly ONE definition of trusted sources (PocketParity
  // seedReadUrlAllowlist): user-written text in the ASSEMBLED messages,
  // plus this session's persisted search-hit URLs and read_url links.
  // Assistant text, tool arguments and fenced tool summaries are never a
  // source, so a URL approved in an EARLIER conversation can never be
  // fetched from a later one (audit finding 4).
  seedReadUrlAllowlist(messages, sessionSteps ?? []);

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
      // This engine turn gets its OWN text and reasoning segments: text
      // spoken after a tool call belongs to a different paragraph.
      textSeg = null;
      reasoningSeg = null;
      try {
        const completion = engine.completion(
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
            ...(options.reasoningEffort !== undefined
              ? { reasoningEffort: options.reasoningEffort }
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
              if (delta !== "") {
                if (textSeg === null) {
                  textSeg = { kind: "text", text: delta };
                  blocks.push(textSeg);
                } else {
                  textSeg.text += delta;
                }
              }
              onEvent({ type: "token", text: delta });
            },
            // Cumulative, like llama.rn's reasoning_content: the store
            // replaces, never appends.
            onReasoning: (cumulative) => {
              if (cumulative === "") return;
              reasoning = cumulative;
              if (reasoningSeg === null) {
                reasoningSeg = { kind: "reasoning", text: cumulative };
                blocks.push(reasoningSeg);
              } else {
                reasoningSeg.text = cumulative;
              }
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
        pendingCompletion = completion;
        try {
          outcome = await completion;
        } finally {
          pendingCompletion = null;
        }
      } catch (err) {
        onEvent({
          type: "run_failed",
          error: err instanceof Error ? err.message : String(err),
        });
        return { text, steps, promptTokens, completionTokens, hitMaxTurns: false, ...(blocks.length > 0 ? { blocks } : {}) };
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
      // Reconcile the segment log with what the turn actually produced:
      // a scripted engine can skip the streaming callbacks entirely.
      if (turnText !== "") {
        // A freshly-annotated alias: closure assignments above are
        // invisible to the narrowing pass, which would otherwise keep
        // `textSeg` pinned to null.
        const seg = textSeg as { kind: "text"; text: string } | null;
        if (seg === null) {
          textSeg = { kind: "text", text: turnText };
          blocks.push(textSeg);
        } else {
          seg.text = turnText;
        }
      }
      if (outcome.reasoning) {
        const seg = reasoningSeg as { kind: "reasoning"; text: string } | null;
        if (seg === null) {
          reasoningSeg = { kind: "reasoning", text: outcome.reasoning };
          blocks.push(reasoningSeg);
        } else {
          seg.text = outcome.reasoning;
        }
      }
      // Every segment speaks, not only the last one: the reply is the
      // whole narrative the model produced around its tool calls.
      text = text === "" ? turnText : turnText === "" ? text : `${text}\n\n${turnText}`;

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
        blocks.push({ kind: "tool", stepId: call.id });
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
          ...(blocks.length > 0 ? { blocks } : {}),
        };
      }

      const toolMessages: CompletionMessage[] = [
        {
          role: "assistant",
          content: turnText,
          tool_calls: allowed,
        },
      ];
      // Start events for the WHOLE reply land first: the UI flips to the
      // tool phase once, then rows settle as results arrive. Outcomes are
      // still consumed in call order, so the model's tool messages match
      // the assistant's tool_calls regardless of network order.
      for (const call of allowed) {
        onEvent({ type: "tool_call_started", call });
      }
      const slots = allowed.map(() => {
        let resolve!: (outcome: TalentOutcome) => void;
        let reject!: (error: unknown) => void;
        const promise = new Promise<TalentOutcome>((res, rej) => {
          resolve = res;
          reject = rej;
        });
        // `await` on a slot is the only consumer; an unhandled rejection
        // before that await must not trip the runner's own handlers.
        promise.catch(() => {});
        return { promise, resolve, reject };
      });
      let nextCall = 0;
      let inFlight = 0;
      const pump = () => {
        while (nextCall < allowed.length) {
          // A Stop lands before the next slot leaves the queue: the call
          // never runs, and its outcome still occupies the call's slot.
          if (toolController.signal.aborted) {
            for (; nextCall < allowed.length; nextCall += 1) {
              slots[nextCall].resolve(cancelledOutcome(allowed[nextCall]));
            }
            return;
          }
          if (inFlight >= MAX_IN_FLIGHT_TOOL_CALLS) return;
          const slot = slots[nextCall];
          const call = allowed[nextCall];
          const pending = runTalent(call.name, call.arguments, {
            fetchImpl,
            search,
            ...(toolSignal !== undefined ? { signal: toolSignal } : {}),
          });
          nextCall += 1;
          inFlight += 1;
          started.push(pending);
          pending.then(slot.resolve, slot.reject).then(() => {
            inFlight -= 1;
            pump();
          });
        }
      };
      pump();
      for (let index = 0; index < allowed.length; index += 1) {
        const call = allowed[index];
        // Named `talent`, not `outcome`: the engine's `outcome` is already
        // in scope from the loop above, and shadowing it is how two very
        // different results get confused for each other.
        const talent = await slots[index].promise;
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
        blocks.push({ kind: "tool", stepId: call.id });
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
      // A stopped reply ends where the user stopped it: no tool messages
      // for a turn the next generation will never be asked to continue.
      if (toolController.signal.aborted) break;
      messages = [...requestMessages, ...toolMessages];
      // Loop continues; the forced-final pass answers next iteration.
    }
    // Only an aborted run reaches here (every other exit returns from
    // inside the loop). It ended the way the user asked: partial text and
    // the cancelled calls, never a forced final answer.
    onEvent({ type: "run_finished" });
    return {
      text,
      ...(reasoning !== "" ? { reasoning } : {}),
      steps,
      promptTokens,
      completionTokens,
      hitMaxTurns: false,
      ...(endFlags !== undefined ? { outcome: endFlags } : {}),
      ...(blocks.length > 0 ? { blocks } : {}),
    };
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
      ...(blocks.length > 0 ? { blocks } : {}),
    };
  } finally {
    signal?.removeEventListener("abort", onAbort);
    toolController.abort();
    // An exit before every slot was awaited must not leave a fetch
    // running against an unloaded context.
    await Promise.allSettled(started);
  }
}
