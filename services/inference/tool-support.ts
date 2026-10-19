/** Does this model support tool calling? Ask llama.cpp, don't guess.
 *
 * PocketPal parity (`pocketpal-ai/src/screens/ChatScreen/ChatScreen.tsx:148`):
 * when a companion declares talents and the active model advertises no
 * tool support, warn once per model. The verdict comes from llama.rn's
 * jinja metadata — the chat template already knows whether it can render
 * a `tools` array, so a family name-list here would be a worse copy of
 * knowledge we can simply query.
 *
 * Three-valued on purpose, like thinking-detection.ts: `true`/`false` are
 * facts and get persisted to `ModelSpec.supportsTools`. `undefined` means
 * "could not tell" — the context carries no model metadata at all — and
 * MUST NOT be written as `false`, or a context that simply did not report
 * would permanently mark a tool-capable model as incapable.
 */

/** The slice of llama.rn's context this reads.
 *
 *  `LlamaContextLike` in ./local-engine.ts carries the same shape, so a
 *  loaded context can be handed straight in. */
export interface ToolSupportProbe {
  model?: {
    chatTemplates?: {
      jinja?: {
        defaultCaps?: { tools?: boolean; toolCalls?: boolean };
        toolUse?: boolean;
        toolUseCaps?: { tools?: boolean; toolCalls?: boolean };
      };
    };
  };
}

/** Does the loaded context support tool calling? undefined = could not tell.
 *
 *  A context with no `model` at all could not tell: llama.rn always
 *  attaches one, so its absence means the metadata never reached us and
 *  the honest answer is "unknown", not "no".
 *
 *  A context WITH a model but no jinja block means the template reported
 *  no capabilities — llama.rn always emits the block
 *  (`RNLlamaJSI.cpp` modelDetailsJson), so this is a real "no".
 */
export function hasToolSupport(ctx: ToolSupportProbe): boolean | undefined {
  if (!ctx.model) return undefined;
  const jinja = ctx.model.chatTemplates?.jinja;
  if (!jinja) return false;
  // Tool support surfaces in four independent places in llama.rn's jinja
  // metadata: the default template's caps, the "tool_use" variant's
  // validity flag, and that variant's own caps. Any one is sufficient;
  // only warn when all of them are absent.
  return (
    jinja.defaultCaps?.tools === true ||
    jinja.defaultCaps?.toolCalls === true ||
    jinja.toolUse === true ||
    jinja.toolUseCaps?.tools === true ||
    jinja.toolUseCaps?.toolCalls === true
  );
}
