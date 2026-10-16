
/** What the local engine actually sends to llama.rn (regression loop).
 *
 * Symptom this guards: EVERY reply comes back empty ("empty reply — tap to
 * retry", turn.ts:186) for one model. An empty completion has only a few
 * causes on this path, and the one this app controls is the params we
 * forward: `stop`, `chat_template` and `add_generation_prompt` are all
 * per-model settings that can silently kill generation at token 0.
 *
 * The rule pinned here: an UNTOUCHED model forwards none of them. Anything
 * else changes what llama.cpp does with every turn, for every model, and
 * the failure surfaces as an empty bubble rather than an error.
 */


import {
  createLocalEngine,
  type LlamaCompletionParams,
  type LlamaContextLike,
} from "../local-engine";
import { parseModelSettings } from "../../../utils/model-settings";

/** Captures exactly what would cross the JSI boundary. */
function capturingContext(): {
  ctx: LlamaContextLike;
  params: () => LlamaCompletionParams;
} {
  let captured: LlamaCompletionParams = { messages: [] };
  const ctx: LlamaContextLike = {
    completion: async (params) => {
      captured = params;
      return { text: "ok", content: "ok", tokens_predicted: 1, tokens_evaluated: 1 };
    },
    stopCompletion: async () => {},
    release: async () => {},
  };
  return { ctx, params: () => captured };
}

async function send(request: Parameters<
  ReturnType<typeof createLocalEngine>["completion"]
>[0]): Promise<LlamaCompletionParams> {
  const { ctx, params } = capturingContext();
  await createLocalEngine(ctx).completion(request, { onToken: () => {} });
  return params();
}

describe("engine params — untouched model", () => {
  it("forwards no stop, no template and no generation-prompt override", async () => {
    const params = await send({ messages: [{ role: "user", content: "Hello" }] });
    // Each of these, if present, can end generation before token 1.
    expect("stop" in params).toEqual(false);
    expect("chat_template" in params).toEqual(false);
    expect("add_generation_prompt" in params).toEqual(false);
  });

  it("reads the untouched settings as absent, not false", () => {
    // The tri-state: a plain `false` here is what would strip every model's
    // assistant cue (llama.cpp defaults to true) and yield empty replies.
    const s = parseModelSettings({});
    expect("addGenerationPrompt" in s).toEqual(false);
    expect(parseModelSettings({ addGenerationPrompt: false }).addGenerationPrompt).toEqual(false);
    expect(parseModelSettings({ addGenerationPrompt: true }).addGenerationPrompt).toEqual(true);
  });

  it("sends no enable_thinking for an unclassified model", async () => {
    // The forced-true bug: enable_thinking was resolved from a global
    // default for every model nobody had classified, overriding the GGUF
    // template's own choice. resolveThinking now returns undefined there,
    // and turn.ts forwards only what is defined.
    const params = await send({
      messages: [{ role: "user", content: "Hello" }],
    });
    expect("enable_thinking" in params).toEqual(false);
  });

  it("forwards enable_thinking both ways when it IS a real value", async () => {
    const off = await send({
      messages: [{ role: "user", content: "hi" }],
      enableThinking: false,
    });
    expect(off.enable_thinking).toEqual(false);
    const on = await send({
      messages: [{ role: "user", content: "hi" }],
      enableThinking: true,
    });
    expect(on.enable_thinking).toEqual(true);
  });

  it("forwards reasoning effort as chat_template_kwargs.reasoning_effort", async () => {
    // llama.rn 0.13.0-rc.7 has no named effort param: the supported
    // equivalent of llama.cpp's --reasoning-effort is the kwarg, which
    // llama.cpp merges into the jinja template input (chat.cpp:955).
    // A template that does not read it is unaffected.
    const params = await send({
      messages: [{ role: "user", content: "hi" }],
      reasoningEffort: "high",
    });
    expect(params.chat_template_kwargs).toEqual({ reasoning_effort: "high" });
  });

  it("omits chat_template_kwargs entirely when no effort is chosen", async () => {
    const params = await send({
      messages: [{ role: "user", content: "hi" }],
    });
    expect("chat_template_kwargs" in params).toEqual(false);
  });
});

describe("engine params — configured model", () => {
  it("forwards stop words flat, plus the EOS token", async () => {
    const params = await send({
      messages: [{ role: "user", content: "hi" }],
      stop: ["<|eot_id|>", "</s>"],
    });
    expect(params.stop).toEqual(["<|eot_id|>", "</s>"]);
  });

  it("omits stop entirely when the list is empty", async () => {
    const params = await send({
      messages: [{ role: "user", content: "hi" }],
      stop: [],
    });
    expect("stop" in params).toEqual(false);
  });

  it("forwards a custom chat template", async () => {
    const params = await send({
      messages: [{ role: "user", content: "hi" }],
      chatTemplate: "{{ messages }}",
    });
    expect(params.chat_template).toEqual("{{ messages }}");
  });

  it("forwards add_generation_prompt both ways — false is a real choice", async () => {
    const off = await send({
      messages: [{ role: "user", content: "hi" }],
      addGenerationPrompt: false,
    });
    expect(off.add_generation_prompt).toEqual(false);
    const on = await send({
      messages: [{ role: "user", content: "hi" }],
      addGenerationPrompt: true,
    });
    expect(on.add_generation_prompt).toEqual(true);
  });
});