/** Tool-call token counter for the pending row (parity 03).
 *
 * Counts the fragments spent assembling a tool call — the delta events
 * llama.rn fires once per streamed token while the model writes the
 * call's JSON. Reply text goes through the same stream but is NEVER
 * counted: a reply-text delta is `delta("reply")`, and this counter's
 * whole point is that only `delta("tool")` ticks it. That split is the
 * honesty invariant from the ticket — the number on the row is tool-call
 * work, not a proxy for "the model is typing".
 *
 * Pure and mutable, not React state: the send slice ticks it on every
 * fragment and mirrors the value into a single store field, so a ticking
 * count never re-renders the message list — only the row that reads it.
 */

/** Which stream a delta belongs to. */
export type DeltaKind = "tool" | "reply";

export interface ToolTokenCounter {
  /** Feed one streamed delta. Only tool-call fragments tick the count.
   *  The first fragment after a call settles starts that call's count
   *  over — the reset lives at each tool call's start. */
  delta: (kind: DeltaKind) => number;
  /** The in-flight call's fragments are done (the call started running). */
  settleCall: () => void;
  /** A new turn begins: the count and the call span both reset. */
  turnStart: () => void;
  count: () => number;
}

export function createToolTokenCounter(): ToolTokenCounter {
  let count = 0;
  // True between a call's first fragment and its settle: the span
  // during which the count belongs to THAT call.
  let open = false;
  return {
    delta(kind: DeltaKind): number {
      if (kind !== "tool") return count;
      if (!open) {
        open = true;
        count = 0;
      }
      count += 1;
      return count;
    },
    settleCall(): void {
      open = false;
    },
    turnStart(): void {
      open = false;
      count = 0;
    },
    count(): number {
      return count;
    },
  };
}
