/** Chat domain types: messages, steps, sessions.
 *
 * Stored turns (Supabase rows) plus client-only render state
 * (streaming bubbles, errors).
 */

import type { ApiError } from "./api.ts";

/** One tool invocation surfaced in a bubble (Wave 2: running, then done). */
export interface AgentStep {
  /** Wire identity: running→done upserts match on this, so parallel
   * same-name calls keep their own results. Absent on history steps
   * (reloaded rows render done-only, never upsert). */
  id?: string;
  tool: string;
  status: "running" | "done";
  input?: Record<string, unknown>;
  result?: string;
}

export interface MessageUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Local creation time (ms) for the design's timestamp row. */
  at: number;
  /** Optional image ref — bubble shows the design's picture box when set. */
  image?: string;
  error?: ApiError;
  /** Tool calls behind this reply, in order. */
  steps?: AgentStep[];
  usage?: MessageUsage;
  /** True while tokens are still arriving. */
  streaming?: boolean;
}

/** One row of the Supabase-owned session list. */
export interface SessionInfo {
  id: string;
  title: string;
  pinned: boolean;
  updated_at: string;
}

/** One row in the drawer's history list (derived from SessionInfo). */
export interface ChatSession {
  id: string;
  title: string;
  pinned: boolean;
  at: number;
}
