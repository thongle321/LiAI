/** HH:MM for timestamp rows (bubbles, history list),
 *  and the per-tool-call cost line (C15). */

import type { ToolMetrics } from "../types/chat.ts";

export function formatTime(at: number): string {
  const d = new Date(at);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** `1,500 tokens · 35s` for one tool call's cost, or null when there is
 *  nothing to report — no metrics recorded, or a tokens-0 engine. The
 *  absence IS the cue (older persisted calls render nothing, by
 *  design). Seconds floor at 1 so a real call never reads "0s". */
export function formatToolMetrics(metrics: ToolMetrics | undefined): string | null {
  if (metrics === undefined || metrics.tokens <= 0) return null;
  const seconds = Math.max(1, Math.round(metrics.durationMs / 1000));
  return `${metrics.tokens.toLocaleString("en-US")} tokens · ${seconds}s`;
}
