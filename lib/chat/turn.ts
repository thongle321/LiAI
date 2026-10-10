/** Local turn builder: text → engine + agent + persisted turns (ADR-0009/0010).
 *
 * The default TurnRunner behind send(): resolves history + system prompt
 * into agent messages, runs the local loop, persists both turns with
 * tool/usage provenance, and returns the bubble outcome. Store failures
 * are best-effort (the reply still renders); a missing engine rejects.
 */

import type { AgentStep, TurnBlock, TurnOutcomeFlags } from "../../types/chat.ts";
import type { ChatMessage } from "../../types/chat.ts";
import type { StoredTurn } from "./session-store.ts";
import type { TurnPaths } from "../../store/chat/types.ts";
import type {
  CompletionEngine,
  CompletionMessage,
  EngineSource,
} from "../inference/engine.ts";
import type { SamplerParams } from "../inference/sampler.ts";
import type { EffortLevel } from "../reasoning-capability.ts";
import { runLocalAgent } from "../agent/runner.ts";
import { talentDefinitions, type TalentSearchAuth } from "../agent/registry.ts";

/** First user message becomes the session title, truncated here. */
export const SESSION_TITLE_LEN = 48;

/** The slice of the session store a turn needs. Structural on purpose:
 *  a turn is the one place that must work with a fake, and this keeps
 *  the fake to three methods. The turn shape is the shared one, so the
 *  write contract has exactly one definition. */
export interface TurnSessionStore {
  create(): Promise<string>;
  /** `id` lets the slice pin the row id to the bubble's, so the two are
   *  one string. Optional here exactly as on `SessionStore.append`. */
  append(sessionId: string, turn: StoredTurn, id?: string): Promise<void>;
  setTitleIfEmpty(sessionId: string, title: string): Promise<void>;
}

export interface TurnOutcome {
  reply: string;
  /** Last non-empty reasoning, when the model emitted any. */
  reasoning?: string;
  sessionId: string;
  steps: AgentStep[];
  promptTokens: number;
  completionTokens: number;
  /** How the turn ended, when the engine reported it. Omitted entirely
   *  otherwise, so an unflagged turn stores no empty object. */
  outcome?: TurnOutcomeFlags;
  /** Ordered blocks as the model produced them. */
  blocks?: TurnBlock[];
}

export interface TurnDeps {
  ensureEngine(source: EngineSource): Promise<CompletionEngine>;
  getEngineSource(): Promise<EngineSource | null>;
  getStore(): Promise<TurnSessionStore | null>;
  getSearch(): Promise<TalentSearchAuth | null>;
  getSystemPrompt(): Promise<string | undefined>;
  /** Local-only thinking preference; `undefined` sends NO flag, leaving
   *  the model's chat template to decide (lib/inference/thinking.ts). */
  getThinking?: () => Promise<boolean | undefined>;
  /** Per-model graded effort; undefined sends NO kwarg (the model's own
   *  default reasoning depth stands). */
  getEffort?: () => Promise<EffortLevel | undefined>;
  /** Local-only jinja template preference; omitted keeps the native default. */
  getJinja?: () => Promise<boolean>;
  /** Local-only sampling params for THIS session, already resolved
   *  session-vs-preset; null falls back to the native default. Takes the
   *  id rather than reading the active pointer, because a turn that mints
   *  its own session is not the pointer until after it runs. */
  getSampler?: (sessionId: string) => Promise<SamplerParams | null>;
  /** Per-model stop words for THIS model; empty/absent sends none. */
  getStopWords?: () => Promise<string[]>;
  /** Per-model chat-template override; empty/absent uses the default. */
  getChatTemplate?: () => Promise<string>;
  /** Per-model generation-prompt override; undefined keeps default. */
  getAddGenerationPrompt?: () => Promise<boolean | undefined>;
  /** Data-uri → temp file path for multimodal turns; null = text-only. */
  saveImage(dataUri: string): Promise<string | null>;
  /** Remove the temp media files once the engine is done with them.
   *  Optional so existing test deps stay valid; the default is the real
   *  file deletion (see removeSavedImages). */
  removeImages?(paths: string[]): Promise<void>;
}

/** Best-effort deletion of this turn's temp media files.
 *
 *  WHY: `saveImage` writes one JPEG per attachment into
 *  `documentDirectory/chat-images/` and NOTHING else in the app ever
 *  cleans that directory — every photo a user sends otherwise stays on
 *  disk for the life of the install, on a device that is already
 *  holding multi-GB GGUFs (audit finding 2). The engine only reads the
 *  path during its completion, so the file is dead weight the moment
 *  runLocalAgent settles.
 *
 *  Dynamic import, like every other native touch in this graph: plain
 *  Node tests import this module, and a failure to load or delete must
 *  never take down a turn whose answer is already in. */
async function removeSavedImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    const FS = await import("expo-file-system/legacy");
    await Promise.all(
      paths.map((path) => FS.deleteAsync(path, { idempotent: true })),
    );
  } catch {
    // Best-effort: an undeletable temp file must not fail the turn.
  }
}

function toAgentMessages(
  history: ChatMessage[],
  text: string,
  systemPrompt: string | undefined,
  includeThinking: boolean,
): CompletionMessage[] {
  const messages: CompletionMessage[] = [];
  if (systemPrompt && systemPrompt.trim() !== "") {
    messages.push({ role: "system", content: systemPrompt });
  }
  for (const m of history) {
    if ((m.role !== "user" && m.role !== "assistant") || m.text.trim() === "") {
      continue;
    }
    messages.push({
      role: m.role,
      content: m.text,
      // include_thinking_in_context: prior reasoning goes back as
      // reasoning_content, read by llama.cpp's chat parser and dropped
      // again when the flag is off — user turns never carry it.
      ...(m.role === "assistant" && includeThinking && m.reasoning
        ? { reasoning_content: m.reasoning }
        : {}),
    });
  }
  messages.push({ role: "user", content: text });
  return messages;
}

function userTextsOf(history: ChatMessage[]): string[] {
  return history.filter((m) => m.role === "user").map((m) => m.text);
}

/** Build the store's TurnRunner from injectable seams (tests pass fakes). */
export function createTurnRunner(deps: TurnDeps) {
  return async (
    text: string,
    paths: TurnPaths,
    onToken?: (text: string) => void,
    onReasoning?: (cumulative: string) => void,
    onToolStart?: (toolName: string) => void,
    onToolDelta?: () => void,
  ): Promise<TurnOutcome> => {
    const trimmed = text.trim();
    if (trimmed === "") throw new Error("empty message");
    const source = await deps.getEngineSource();
    if (!source) throw new Error("no model active");
    const engine = await deps.ensureEngine(source);
    const store = await deps.getStore().catch(() => null);
    const sid = paths.sessionId ?? (await store?.create().catch(() => null)) ?? null;
    const sessionId = sid ?? `local-${Date.now().toString(36)}`;

    const search = await deps.getSearch().catch(() => null);
    const systemPrompt = await deps.getSystemPrompt().catch(() => undefined);
    const thinking = await deps.getThinking?.().catch(() => undefined);
    const effort = await deps.getEffort?.().catch(() => undefined);
    const jinja = await deps.getJinja?.().catch(() => undefined);
    const sampler = await deps.getSampler?.(sessionId).catch(() => null);
    const stopWords = (await deps.getStopWords?.().catch(() => [])) ?? [];
    const chatTemplate = (await deps.getChatTemplate?.().catch(() => "")) ?? "";
    const addGenerationPrompt = await deps
      .getAddGenerationPrompt?.()
      .catch(() => undefined);
// G8: every attached photo becomes a media path. One that fails to
    // save is dropped rather than failing the turn -- the text still went,
    // and losing a photo is better than losing the message.
    let imagePaths: string[] | undefined;
    if (paths.images !== undefined && paths.images.length > 0) {
      const saved: string[] = [];
      for (const dataUri of paths.images) {
            const path = await deps.saveImage(dataUri).catch(() => null);
            if (path !== null) saved.push(path);
      }
      if (saved.length > 0) imagePaths = saved;
    }

    let result: Awaited<ReturnType<typeof runLocalAgent>>;
    try {
      result = await runLocalAgent({
      engine,
      messages: toAgentMessages(
        paths.history,
        trimmed,
        systemPrompt,
        // A missing sampler means no override — default to including.
        sampler?.includeThinkingInContext !== false,
      ),
      tools: talentDefinitions(),
      // Local reads imagePaths (llama media_paths); remote reads the
      // data URIs (OpenAI content arrays — a server can't read our files).
      ...(imagePaths ? { imagePaths } : {}),
      ...(paths.images && paths.images.length > 0
        ? { imageDataUris: paths.images }
        : {}),
      ...(thinking !== undefined ? { enableThinking: thinking } : {}),
      ...(effort !== undefined ? { reasoningEffort: effort } : {}),
      ...(jinja !== undefined ? { jinja } : {}),
    ...(sampler ? { sampler } : {}),
      ...(stopWords.length > 0 ? { stop: stopWords } : {}),
      ...(chatTemplate.trim() !== "" ? { chatTemplate } : {}),
      ...(addGenerationPrompt !== undefined
        ? { addGenerationPrompt }
        : {}),
      fetchImpl: fetch,
      search,
      userTexts: userTextsOf(paths.history),
      onEvent: (event) => {
        if (event.type === "token" && event.text !== "") onToken?.(event.text);
        if (event.type === "reasoning" && event.text !== "") {
          onReasoning?.(event.text);
        }
        if (event.type === "tool_call_started") onToolStart?.(event.call.name);
        if (event.type === "tool_call_delta") onToolDelta?.();
      },
      });
    } finally {
      // The engine is done with the media files the moment the run settles
      // (success or failure): drop them before persisting the turn.
      await (deps.removeImages ?? removeSavedImages)(imagePaths ?? []);
    }
    // Backend parity: an empty reply with no tool provenance is a failed
    // turn (error bubble), never a persisted empty assistant message.
    if (result.text.trim() === "" && result.steps.length === 0) {
      throw new Error("empty reply");
    }
    const steps: AgentStep[] = result.steps.map((s, position) => ({
      id: s.id,
      tool: s.tool,
      position,
      ...(s.input ? { input: s.input } : {}),
      ...(s.result !== undefined ? { result: s.result } : {}),
      // The runner's full step contract (C15 + REGRESSION): this map
      // picked only some fields for the store's life, so `ok` and
      // `data` never reached the renderer from a LIVE turn — a failed
      // tool could not render as failed and structured surfaces always
      // looked empty. Metrics would have died in the same slot.
      ...(s.ok !== undefined ? { ok: s.ok } : {}),
      ...(s.data !== undefined ? { data: s.data } : {}),
      ...(s.metrics !== undefined ? { metrics: s.metrics } : {}),
    }));
    const usage = {
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      totalTokens: result.promptTokens + result.completionTokens,
    };
    // Best-effort persistence: a store failure must not blank the reply.
    // Retry re-answers a stored question, so it skips the user append.
    try {
      if (store) {
        if (!paths.retry) {
          await store.append(
            sessionId,
            { role: "user", content: trimmed, type: "text" },
            paths.userMessageId,
          );
          await store.setTitleIfEmpty(sessionId, trimmed.slice(0, SESSION_TITLE_LEN));
        }
        await store.append(
          sessionId,
          {
            role: "assistant",
            content: result.text,
            ...(result.reasoning !== undefined ? { reasoning: result.reasoning } : {}),
            type: "text",
            usage,
            steps,
            ...(result.outcome !== undefined ? { outcome: result.outcome } : {}),
            ...(result.blocks !== undefined ? { blocks: result.blocks } : {}),
          },
          paths.assistantMessageId,
        );
      }
    } catch {
      // Reply already resolved; persistence retries on the next turn.
    }
    return {
      reply: result.text,
      ...(result.reasoning !== undefined ? { reasoning: result.reasoning } : {}),
      sessionId,
      steps,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      ...(result.outcome !== undefined ? { outcome: result.outcome } : {}),
      ...(result.blocks !== undefined ? { blocks: result.blocks } : {}),
    };
  };
}
