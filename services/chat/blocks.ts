/** A turn's ordered block list: the one splitter for every reader.
 *
 * A turn written by the NEW model carries `blocks` straight from the
 * runner. A turn written by the PREVIOUS one (reasoning string, whole
 * reply, flat step list) is read through `blocksOf`, which derives the
 * block list from those fields — so old conversations render with the
 * same split and nothing is rewritten on disk.
 *
 * Pure and node-testable on purpose: ordering and grouping are pinned
 * here because the renderer cannot execute under node.
 */

import type { AgentStep, TurnBlock } from "../../types/chat.ts";

export interface TurnLike {
  text: string;
  reasoning?: string;
  steps?: AgentStep[];
  blocks?: TurnBlock[];
}

/** The turn's ordered blocks. Recorded blocks win verbatim; otherwise
 * split the legacy fields — reasoning first, then the reply, then the
 * tool calls in call order. That is exactly the layout the old row
 * rendered, so history does not reflow. */
export function blocksOf(turn: TurnLike): TurnBlock[] {
  if (Array.isArray(turn.blocks) && turn.blocks.length > 0) return turn.blocks;
  const blocks: TurnBlock[] = [];
  if (turn.reasoning !== undefined && turn.reasoning !== "") {
    blocks.push({ kind: "reasoning", text: turn.reasoning });
  }
  if (turn.text !== "") blocks.push({ kind: "text", text: turn.text });
  const steps = turn.steps ? [...turn.steps].sort((a, b) => a.position - b.position) : [];
  for (const step of steps) blocks.push({ kind: "tool", stepId: step.id });
  return blocks;
}

/** Every text segment of the turn, joined — the one string copy and
 * read-aloud both mean. Tool calls and reasoning are not prose the
 * user asked for on the clipboard, so they are not here. */
export function turnText(turn: TurnLike): string {
  return blocksOf(turn)
    .filter((b): b is { kind: "text"; text: string } => b.kind === "text")
    .map((b) => b.text)
    .filter((t) => t.trim() !== "")
    .join("\n\n");
}

/** Validate a parsed value as a TurnBlock array. Unknown entries are
 * dropped rather than kept, so a malformed backup or a hand-edited
 * cell degrades to fewer blocks, never a crash in the renderer.
 * Returns undefined when nothing usable survives. */
export function sanitizeBlocks(value: unknown): TurnBlock[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const blocks: TurnBlock[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    const raw = entry as Record<string, unknown>;
    if (raw["kind"] === "reasoning" || raw["kind"] === "text") {
      if (typeof raw["text"] === "string") {
        blocks.push({ kind: raw["kind"], text: raw["text"] });
      }
    } else if (raw["kind"] === "tool") {
      if (typeof raw["stepId"] === "string") {
        blocks.push({ kind: "tool", stepId: raw["stepId"] });
      }
    }
  }
  return blocks.length > 0 ? blocks : undefined;
}
