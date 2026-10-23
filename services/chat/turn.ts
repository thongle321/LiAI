/** Local turn builder: text → engine + agent + persisted turns (ADR-0009/0010).
 *
 * The default TurnRunner behind send(): resolves history + system prompt
 * into agent messages, runs the local loop, persists both turns with
 * tool/usage provenance, and returns the bubble outcome. Store failures
 * are best-effort (the reply still renders); a missing engine rejects.
 */

import type { AgentStep, TurnBlock, TurnOutcomeFlags } from "@/types/chat.ts";
import type { ChatMessage } from "@/types/chat.ts";
import type { StoredTurn } from "./session-store.ts";
import type { TurnPaths } from "@/store/chat/types.ts";
import type {
  CompletionEngine,
  CompletionMessage,
  EngineSource,
} from "../inference/engine.ts";
import type { SamplerParams } from "../inference/sampler.ts";
import type { EffortLevel } from "@/utils/reasoning-capability.ts";
import { runLocalAgent, DEFAULT_MAX_TURNS } from "../agent/runner.ts";
import {
  collectSystemPromptFragments,
  deriveToolSchemas,
  type TalentSearchAuth,
} from "../agent/registry.ts";
import { toDataUris } from "../storage/images.ts";
import { VOICE_MODE_SYSTEM_PROMPT } from "@/constants/voice-mode-prompt.ts";

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
  /** Prior turns, for the read_url allowlist seed (PocketParity
   *  sessionRows). Optional so existing fakes stay valid; absent or null
   *  simply seeds nothing. */
  get?(sessionId: string): Promise<Array<{
    steps?: Array<{ tool?: string; data?: Record<string, unknown> }>;
  }> | null>;
  /** Bind the staged companion at session birth, before the first turn's
   *  resolutions read it. Optional so older fakes stay valid. */
  setSessionCompanion?(sessionId: string, companionId: string | null): Promise<unknown>;
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

export interface EngineDeps {
  ensureEngine(source: EngineSource): Promise<CompletionEngine>;
  getEngineSource(): Promise<EngineSource | null>;
}

export interface StoreDeps {
  getStore(): Promise<TurnSessionStore | null>;
  getSearch(): Promise<TalentSearchAuth | null>;
}

export interface PromptDeps {
  getSystemPrompt?(sessionId: string): Promise<string | undefined>;
  /** Pact allowlist for THIS session — the talent names its companion
   *  declares. Empty/absent = no tools at all (a chat with no companion sends
   *  none, PocketPal gating). Takes the id because a turn that mints its
   *  own session is not the pointer until after it runs. */
  getTalentNames?: (sessionId: string) => Promise<string[]>;
  /** Local-only thinking preference; `undefined` sends NO flag, leaving
   *  the model's chat template to decide (services/inference//thinking.ts).
   *  Session-aware: the session override (when settings_source is
   *  'custom') beats the per-model/global resolution. */
  getThinking?: (sessionId: string) => Promise<boolean | undefined>;
  /** Per-model graded effort; undefined sends NO kwarg (the model's own
   *  default reasoning depth stands). Session-aware, like getThinking. */
  getEffort?: (sessionId: string) => Promise<EffortLevel | undefined>;
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
  /** Consolidated turn-input resolver (Phase 1.2). When present, the
   *  runner calls it once per turn instead of the individual get* deps;
   *  individual deps remain the fallback for tests that inject them. */
  getTurnInputs?(sessionId: string): Promise<TurnInputs>;
}

export interface MediaDeps {
  /** Resolve a stored attachment into a file the engine can read.
   *  null = unusable, so the turn goes out as text only. */
  resolveImage(value: string): Promise<{ path: string; owned: boolean } | null>;
  /** Encode attachments as data URIs for a REMOTE provider, which
   *  cannot see our files. Optional so existing test deps stay valid;
   *  the default is the real read (services/storage/images.ts). */
  toDataUris?(images: string[]): Promise<string[]>;
  /** Remove the files THIS TURN created once the engine is done with
   *  them. Optional so existing test deps stay valid; the default is the
   *  real file deletion (see removeOwnedImages). */
  removeImages?(paths: string[]): Promise<void>;
}

export interface TurnDeps {
  engine: EngineDeps;
  store: StoreDeps;
  prompt: PromptDeps;
  media: MediaDeps;
}

/** Everything a turn needs from the world, resolved in one pass. */
export interface TurnInputs {
  engineSource: EngineSource | null;
  store: TurnSessionStore | null;
  search: TalentSearchAuth | null;
  systemPrompt: string | undefined;
  talentNames: string[];
  thinking: boolean | undefined;
  effort: EffortLevel | undefined;
  jinja: boolean;
  sampler: SamplerParams | null;
  stopWords: string[];
  chatTemplate: string;
  addGenerationPrompt: boolean | undefined;
}

/** Best-effort deletion of the files this turn wrote.
 *
 *  WHY: an attachment arrives either as a path - the picker's cache file
 *  or a camera frame, which the message history still renders and must
 *  therefore KEEP - or as a legacy data-uri, whose only copy on disk is
 *  the file we just decoded it into. Only the second kind is ours to
 *  delete; removing the first would blank a photo the user can see. The
 *  engine only reads the path during its completion, so an owned file is
 *  dead weight the moment runLocalAgent settles.
 *
 *  Dynamic import, like every other native touch in this graph: plain
 *  Node tests import this module, and a failure to load or delete must
 *  never take down a turn whose answer is already in. */
async function removeOwnedImages(paths: string[]): Promise<void> {
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

/** PocketPal's sessionRows for the allowlist seed: the steps of THIS
 *  session's assistant turns already persisted before this run — web
 *  search hit URLs and read_url links recorded before the last reload
 *  re-seed it, so a restored conversation still admits the URLs it once
 *  surfaced. Best-effort: an unreadable store seeds nothing. */
async function persistedStepsOf(
  store: TurnSessionStore | null,
  sessionId: string,
): Promise<Array<{ tool?: string; data?: Record<string, unknown> }>> {
  if (!store?.get) return [];
  try {
    const turns = await store.get(sessionId);
    return (turns ?? []).flatMap((turn: { steps?: Array<{ tool?: string; data?: Record<string, unknown> }> }) =>
      Array.isArray(turn.steps) ? turn.steps : [],
    );
  } catch {
    return [];
  }
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
    const source = await deps.engine.getEngineSource();
    if (!source) throw new Error("no model active");
    const engine = await deps.engine.ensureEngine(source);
    const store = await deps.store.getStore().catch(() => null);
    const sid = paths.sessionId ?? (await store?.create().catch(() => null)) ?? null;
    const sessionId = sid ?? `local-${Date.now().toString(36)}`;
    // Birth binding: the staged companion lands on the freshly minted row
    // BEFORE any resolution below reads it, so the FIRST turn already
    // runs with the persona's prompt and its pact's tools — and the
    // settings_source default ('companion') needs no write: absence IS 'companion'.
    if (
      store &&
      sid !== null &&
      paths.sessionId === null &&
      paths.companionId !== undefined &&
      store.setSessionCompanion
    ) {
      await store.setSessionCompanion(sid, paths.companionId).catch(() => {});
    }

    // Phase 1.2: prefer the consolidated resolver when provided; fall
    // back to the individual deps so existing tests keep working.
    const inputs = deps.prompt.getTurnInputs
      ? await deps.prompt.getTurnInputs(sessionId).catch(() => undefined)
      : undefined;
    const search =
      inputs?.search ?? (await deps.store.getSearch().catch(() => null));
    const systemPrompt =
      inputs?.systemPrompt ?? (await deps.prompt.getSystemPrompt?.(sessionId).catch(() => undefined));
    const talentNames =
      inputs?.talentNames ?? ((await deps.prompt.getTalentNames?.(sessionId).catch(() => [])) ?? []);
    const thinking =
      inputs?.thinking ?? (await deps.prompt.getThinking?.(sessionId).catch(() => undefined));
    const effort =
      inputs?.effort ?? (await deps.prompt.getEffort?.(sessionId).catch(() => undefined));
    const jinja =
      inputs?.jinja ?? (await deps.prompt.getJinja?.().catch(() => undefined));
    const sampler =
      inputs?.sampler ?? (await deps.prompt.getSampler?.(sessionId).catch(() => null));
    const stopWords =
      inputs?.stopWords ?? ((await deps.prompt.getStopWords?.().catch(() => [])) ?? []);
    const chatTemplate =
      inputs?.chatTemplate ?? ((await deps.prompt.getChatTemplate?.().catch(() => "")) ?? "");
    const addGenerationPrompt =
      inputs?.addGenerationPrompt ??
      (await deps.prompt.getAddGenerationPrompt?.().catch(() => undefined));
// G8: every attached photo becomes a media path. One that cannot be
    // resolved is dropped rather than failing the turn -- the text still
    // went, and losing a photo is better than losing the message.
    let imagePaths: string[] | undefined;
    const ownedPaths: string[] = [];
    if (paths.images !== undefined && paths.images.length > 0) {
      const saved: string[] = [];
      for (const image of paths.images) {
        const resolved = await deps.media.resolveImage(image).catch(() => null);
        if (resolved === null) continue;
        saved.push(resolved.path);
        if (resolved.owned) ownedPaths.push(resolved.path);
      }
      if (saved.length > 0) imagePaths = saved;
    }
    // A local engine reads the paths as they stand (llama media_paths).
    // A remote server cannot see our cache directory, so THAT is the one
    // boundary where an attachment has to be encoded (D5-4) - and doing
    // it here rather than at pick time is what keeps the encoded copy
    // off every local turn.
    const remoteDataUris =
      source.kind === "remote" && paths.images !== undefined && paths.images.length > 0
        ? await ((deps.media.toDataUris ?? toDataUris)(paths.images)).catch(() => undefined)
        : undefined;

    let result: Awaited<ReturnType<typeof runLocalAgent>>;
    try {
      // ONE leading system message: the resolved prompt (companion or
      // per-model) plus the active talents' fragments, blank parts
      // dropped — a second system message makes strict chat templates
      // raise (PocketPal's assembleMessages).
      const fragments = collectSystemPromptFragments(talentNames, {
        now: new Date(),
        maxToolTurns: DEFAULT_MAX_TURNS,
      });
      const systemMessage = [
        systemPrompt ?? "",
        ...fragments,
        ...(paths.voiceMode ? [VOICE_MODE_SYSTEM_PROMPT] : []),
      ]
        .filter((part) => part.trim() !== "")
        .join("\n\n");
      result = await runLocalAgent({
      engine,
      messages: toAgentMessages(
        paths.history,
        trimmed,
        systemMessage,
        // A missing sampler means no override — default to including.
        sampler?.includeThinkingInContext !== false,
      ),
      // Gating: ONLY the session's companion pact's talents get schemas, so a
      // call to anything else is rejected by the runner as unadvertised
      // (and a no-companion chat offers none at all).
      tools: deriveToolSchemas(talentNames),
      // Local reads imagePaths (llama media_paths); remote reads the
      // data URIs (OpenAI content arrays — a server can't read our files).
      ...(imagePaths ? { imagePaths } : {}),
      ...(remoteDataUris !== undefined ? { imageDataUris: remoteDataUris } : {}),
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
      sessionSteps: await persistedStepsOf(store, sessionId),
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
      // The engine is done with the files the moment the run settles
      // (success or failure). Only the ones this turn wrote go; a
      // picked photo or camera frame outlives the turn because the
      // message history still shows it.
      await ((deps.media.removeImages ?? removeOwnedImages)(ownedPaths));
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
