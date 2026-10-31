/** llama.rn native error wording, matched by shape.
 *
 * PocketParity: pocketpal-ai/src/utils/llamaRnErrors.ts (whole file). The
 * native layer throws these strings; each one means something a raw
 * "Completion failed: …" dump would hide, so the turn handler classifies
 * before it surfaces anything. Pure, so it lives in `utils/` — the store
 * and any future caller share ONE definition of the wording.
 */

export const LLAMA_RN_ERROR_PATTERNS = {
  /** Prompt-processing overflow: the prompt itself exceeds n_ctx.
   * llama.rn throws "Context is full" before any token is generated, so
   * it never reaches the normal completion result. */
  contextFull: /context is full/i,
  /** Low-RAM devices can fail to allocate the speculative draft context
   * at first completion (the load-time memory check has no term for it). */
  speculativeInit: /failed to create draft context/i,
  /** Native tool-call parser throws on truncated JSON when the model ran
   * out of context mid-args (most often `render_html` with a long string). */
  toolArgsParse: /Failed to parse tool call arguments as JSON/i,
};
