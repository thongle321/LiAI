/** Pending-row phase labels (chat-message-ui parity 02).
 *
 * The pending row's words: which talent is running, and how the row
 * reads once phase and elapsed share a line. Pure and English-only —
 * LiAI ships no translation layer (spec, Out of Scope).
 *
 * The name→label map is PocketPal's `TALENT_LABEL_KEYS`
 * (PendingIndicator.tsx:23-30) with its l10n keys resolved to the
 * strings they carry, plus its fallback chain verbatim: an unknown
 * name is "Preparing tool", and NO name is no label at all — the row
 * must not claim a tool is running when the model is writing text.
 */

const PHASE_LABELS: Record<string, string> = {
  render_html: "Building page",
  calculate: "Calculating",
  datetime: "Looking up time",
};

/** Generic label for a talent this map has no name for. */
const GENERIC_LABEL = "Preparing tool";

/** The phase to announce for `toolName`, or undefined when no tool is
 *  running. Absent is a first-class answer, not a fallback. */
export function phaseLabel(toolName?: string): string | undefined {
  const name = toolName?.trim();
  if (name === undefined || name === "") return undefined;
  return PHASE_LABELS[name] ?? GENERIC_LABEL;
}

/** Below this the count is noise ("1 tokens"); at it, the row starts
 *  speaking. PocketPal's MIN_TOKENS (PendingIndicator.tsx:16). */
export const MIN_TOOL_TOKENS = 10;

/** The row's label while a stopped turn unwinds. Shown ALONE. */
export const STOPPING_LABEL = "Stopping…";

/** The row's suffix. Parts are joined with a middle dot and absent
 *  parts are dropped, so `{ elapsed: 0 }` reads exactly as the row did
 *  before phases existed. The token count shows once it reaches
 *  MIN_TOOL_TOKENS, with locale separators. */
export function formatPendingSuffix(parts: {
  phase?: string;
  /** Tool-call fragments generated this call — never reply text. */
  tokens?: number;
  elapsed: number;
}): string {
  return [
    parts.phase,
    parts.tokens !== undefined && parts.tokens >= MIN_TOOL_TOKENS
      ? `${parts.tokens.toLocaleString()} tokens`
      : undefined,
    parts.elapsed > 0 ? `${parts.elapsed}s` : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join(" · ");
}

/** The row's whole text. A stopping turn suppresses everything else —
 *  phase, token count and elapsed describe a RUNNING turn, and this one
 *  is unwinding. Independent of the in-flight flag (the store clears
 *  `sending` the moment Stop is pressed, so this flag can only exist
 *  separately). */
export function formatPendingRow(parts: {
  stopping?: boolean;
  phase?: string;
  tokens?: number;
  elapsed: number;
}): string {
  if (parts.stopping === true) return STOPPING_LABEL;
  return formatPendingSuffix(parts);
}