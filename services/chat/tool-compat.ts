/** The companion-talent / model-capability mismatch, decided in one place.
 *
 * PocketPal parity (`pocketpal-ai/src/screens/ChatScreen/ChatScreen.tsx:148`):
 * a companion that declares talents needs a model that can call tools.
 * When the model advertises none, say so — once per model, so the notice
 * never becomes noise.
 *
 * Pure on purpose: the decision reads four facts and returns a verdict,
 * so it can be covered without a store, a screen or a loaded model. The
 * hook that owns the warning (hooks/useToolCompatWarning.ts) supplies the
 * facts; the store owns the warned-set.
 */

/** The copy, verbatim from PocketPal's `chat.toolCompatWarning`.
 *  LiAI has no runtime i18n, so this is a plain constant — like
 *  MULTIMODAL_WARNING in store/chat/send.ts. */
export const TOOL_COMPAT_WARNING =
  "This model may not support tool calling. Results may be unreliable.";

export interface ToolCompatInput {
  /** "local" | "remote" | null — a remote provider's tool support is the
   *  server's business and is never probed, so it never warns. */
  providerType: "local" | "remote" | null;
  /** The companion's declared talents. Empty = nothing to call. */
  talentNames: string[];
  /** The model's verdict: true = supports tools, false = does not,
   *  undefined = never probed (unknown). */
  supportsTools: boolean | undefined;
  /** The warned-set already contains this model. */
  alreadyWarned: boolean;
}

/** Should we warn about this (companion, model) pair?
 *
 *  Every condition is a veto, so the order below is only about which
 *  reason to name in a comment — the verdict is the same either way.
 *
 *  `supportsTools === undefined` vetoes the warning: "never probed" is
 *  not "probed and found wanting", and a model that was never loaded
 *  must not be accused of lacking a capability. */
export function shouldWarnToolCompat(input: ToolCompatInput): boolean {
  if (input.providerType !== "local") return false;
  if (input.talentNames.length === 0) return false;
  if (input.supportsTools !== false) return false;
  if (input.alreadyWarned) return false;
  return true;
}
