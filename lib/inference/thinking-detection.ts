/** Does this model think? Ask llama.cpp, don't guess.
 *
 * PocketPal parity (`pocketpal-ai/src/utils/thinkingCapabilityDetection.ts`):
 * after the context loads, ask it to format a chat with thinking enabled
 * and look for a thinking start tag. llama.cpp's jinja layer already knows
 * this for 25+ model families, so a family name-list here would be a worse
 * copy of knowledge we can simply query.
 *
 * Three-valued on purpose. `true`/`false` are facts and get persisted to
 * `ModelSpec.reasoning`. `undefined` means "could not tell" — the API was
 * missing or threw — and MUST NOT be written as `false`, or a transient
 * failure would permanently classify a reasoner as a plain model (and the
 * composer would never offer the thinking toggle again).
 */

/** The slice of llama.rn's formatted-chat result this reads. */
export interface ThinkingChatProbe {
  getFormattedChat?: (
    messages: Array<{ role: string; content: string }>,
    template?: string | null,
    params?: { jinja?: boolean; enable_thinking?: boolean },
  ) => Promise<unknown>;
}

/** Read the verdict off a formatted-chat result, or undefined if it has
 *  no verdict we can read.
 *
 *  A jinja result object IS a readable answer: a non-empty thinking tag
 *  means the model thinks, and anything else in that shape means it does
 *  not (PocketParity — ModelStore's detection treats a returned result
 *  without a tag as `supported: false`). Returning undefined for the
 *  missing-key case instead would leave every ordinary non-reasoner
 *  permanently unclassified, and its toggle permanently hidden.
 *
 *  Only shapes we cannot read at all — a non-object, or a tag that is not
 *  a string — are undefined, and those must never be persisted as false. */
export function readingFromFormattedChat(result: unknown): boolean | undefined {
  if (result === null || typeof result !== "object") return undefined;
  if (!("thinking_start_tag" in result)) return false;
  const tag = (result as { thinking_start_tag?: unknown }).thinking_start_tag;
  if (typeof tag !== "string") return undefined;
  // An empty tag is not a start tag: jinja reports the variable only when
  // the template actually branches on thinking.
  return tag !== "";
}

/** Does the loaded context support thinking? undefined = could not tell. */
export async function detectThinkingCapability(
  ctx: ThinkingChatProbe,
): Promise<boolean | undefined> {
  if (typeof ctx.getFormattedChat !== "function") return undefined;
  try {
    const result = await ctx.getFormattedChat(
      [{ role: "user", content: "test" }],
      null,
      { jinja: true, enable_thinking: true },
    );
    return readingFromFormattedChat(result);
  } catch {
    // Detection is not critical: a model that can't be probed keeps its
    // current classification rather than being downgraded to "no".
    return undefined;
  }
}