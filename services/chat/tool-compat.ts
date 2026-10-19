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

/** The notice's identity, so the owner can tell it apart from the other
 *  notice that shares the chat's warning slot. */
export const TOOL_COMPAT_CODE = "tool-compat";

export interface ToolCompatFacts {
  /** "local" | "remote" | null — a remote provider's tool support is the
   *  server's business and is never probed, so it never warns. */
  providerType: "local" | "remote" | null;
  /** The companion's declared talents. Empty = nothing to call. */
  talentNames: string[];
  /** The model's verdict: true = supports tools, false = does not,
   *  undefined = never probed (unknown). */
  supportsTools: boolean | undefined;
}

export interface ToolCompatInput extends ToolCompatFacts {
  /** The warned-set already contains this model. */
  alreadyWarned: boolean;
}

/** Do this (companion, model) pair MISMATCH?
 *
 *  Every condition is a veto, so the order below is only about which
 *  reason to name in a comment — the verdict is the same either way.
 *
 *  `supportsTools === undefined` vetoes the warning: "never probed" is
 *  not "probed and found wanting", and a model that was never loaded
 *  must not be accused of lacking a capability.
 *
 *  This is the CONDITION, not the verdict on whether to raise the notice:
 *  the warned-set does not change whether a pair mismatches, only whether
 *  the user has already been told about it. */
export function toolCompatMismatch(facts: ToolCompatFacts): boolean {
  if (facts.providerType !== "local") return false;
  if (facts.talentNames.length === 0) return false;
  if (facts.supportsTools !== false) return false;
  return true;
}

/** Should we warn about this (companion, model) pair?
 *
 *  A mismatch the user has not been told about yet. */
export function shouldWarnToolCompat(input: ToolCompatInput): boolean {
  if (input.alreadyWarned) return false;
  return toolCompatMismatch(input);
}
