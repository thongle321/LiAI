/** Chat domain types: messages, steps, sessions.
 *
 * Stored turns (local Store rows) plus client-only render state
 * (streaming bubbles, errors).
 */

import type { ApiError } from "./api.ts";

/** One tool invocation behind a reply, in call order.
 *
 * `position` is the call index and the only ordering key: the Store's
 * child table is an unordered map, so nothing else preserves call order.
 * There is deliberately no status — a call is only ever written once it
 * has finished, so a "running" state had no writer and the bubble's
 * branch for it was unreachable. Add one back with the code that emits
 * it, not before.
 */
export interface AgentStep {
  /** Row identity, for a stable React key inside the bubble. */
  id: string;
  tool: string;
  input?: Record<string, unknown>;
  result?: string;
  /** False when the talent failed. ABSENT is not success: a row written
   *  before the discriminant existed reads as undefined, and renders
   *  conservatively rather than claiming a result nobody recorded. */
  ok?: boolean;
  /** Structured result for the renderer, never for the model. Absent for a
   *  tool with no structured shape, and for every row written before it. */
  data?: Record<string, unknown>;
  /** Per-call cost of the GENERATION turn that produced this call (C15,
   *  PocketPal ToolMetricsFooter semantics): the tokens the model spent
   *  producing it and that turn's wall-clock. Absent on rows written
   *  before the column existed — absence renders nothing, and that is
   *  the cue. A multi-tool turn replicates its total onto each call. */
  metrics?: ToolMetrics;
  position: number;
}

/** One tool call's cost (C15): generation tokens + wall-clock. Named
 *  so the store, the engine loop and the formatter share ONE shape
 *  instead of restating it. */
export type ToolMetrics = { tokens: number; durationMs: number };

export interface MessageUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Wall-clock figures for one finished turn. Plain numbers so it survives
 *  TinyBase and JSON export unchanged. Defined HERE rather than in the
 *  inference seam because both ends need it and restating a domain type
 *  is how two definitions end up drifting. */
export interface TurnTimings {
  /** Time to first token, ms. */
  promptMs: number;
  /** Generation rate; 0 when too fast to measure. */
  tokensPerSecond: number;
  /** Per-token generation cost, ms. */
  msPerToken: number;
  /** Prompt throughput, tokens/s — the reading that explains a slow
   *  first token. OPTIONAL, not zero-defaulted, so "the engine did not
   *  report it" (most remote endpoints) stays distinguishable from "the
   *  engine measured zero". The footer omits the segment when absent. */
  promptTokensPerSecond?: number;
}

/** How a turn ENDED, distinct from what it said. Persisted with the turn
 *  so a reloaded conversation still knows why it looks the way it does. */
export interface TurnOutcomeFlags {
  /** The reply could not fit the context window. Drives the context-full
   *  banner and its "More room" recovery. */
  contextFull?: boolean;
  /** The user pressed Stop, so this reply is a deliberate stopping point
   *  rather than a finished answer. */
  interrupted?: boolean;
  /** Present only when the engine reports timings. */
  timings?: TurnTimings;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Local creation time (ms) for the design's timestamp row. */
  at: number;
  /** Photos attached to this turn (G8), as data-uris. Live render state
   *  only: `StoredTurn` has no image field, so they are NOT persisted and
   *  a reloaded conversation is text-only. */
  images?: string[];
  error?: ApiError;
  /** Tool calls behind this reply, in order. */
  steps?: AgentStep[];
  /** Parsed reasoning behind this reply, when the model emitted any. */
  reasoning?: string;
  usage?: MessageUsage;
  /** How the turn ended. Absent when the engine reported nothing. */
  outcome?: TurnOutcomeFlags;
  /** True while tokens are still arriving. */
  streaming?: boolean;
}

/** One row of the session list, owned by the local Store (ADR-0012).
 * `updatedAt` is a wall clock for display; the store keeps a separate
 * monotonic counter for sort order. */
export interface SessionInfo {
  id: string;
  title: string;
  pinned: boolean;
  updatedAt: number;
}

/** One row in the drawer's history list (derived from SessionInfo). */
export interface ChatSession {
  id: string;
  title: string;
  pinned: boolean;
  at: number;
}
