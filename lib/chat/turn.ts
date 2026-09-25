/** Local turn builder: text → engine + agent + persisted turns (ADR-0009/0010).
 *
 * The default TurnRunner behind send(): resolves history + system prompt
 * into agent messages, runs the local loop, persists both turns with
 * tool/usage provenance, and returns the bubble outcome. Store failures
 * are best-effort (the reply still renders); a missing engine rejects.
 */

import type { AgentStep } from "../../types/chat.ts";
import type { ChatMessage } from "../../types/chat.ts";
import type {
  CompletionEngine,
  CompletionMessage,
  EngineSource,
} from "../inference/engine.ts";
import { runLocalAgent } from "../agent/runner.ts";
import { talentDefinitions, type TalentSearchAuth } from "../agent/registry.ts";

/** First user message becomes the session title, truncated here. */
export const SESSION_TITLE_LEN = 48;

export interface TurnSessionStore {
  create(): Promise<string>;
  append(
    sessionId: string,
    turn: {
      role: "user" | "assistant";
      content: string;
      type?: string;
      metadata?: Record<string, unknown> | null;
    },
  ): Promise<void>;
  setTitleIfEmpty(sessionId: string, title: string): Promise<void>;
}

export interface TurnOutcome {
  reply: string;
  sessionId: string;
  steps: AgentStep[];
  promptTokens: number;
  completionTokens: number;
}

export interface TurnDeps {
  ensureEngine(source: EngineSource): Promise<CompletionEngine>;
  getEngineSource(): Promise<EngineSource | null>;
  getStore(): Promise<TurnSessionStore | null>;
  getSearch(): Promise<TalentSearchAuth | null>;
  getSystemPrompt(): Promise<string | undefined>;
  /** Local-only thinking preference; omitted keeps the native default. */
  getThinking?: () => Promise<boolean>;
  /** Data-uri → temp file path for multimodal turns; null = text-only. */
  saveImage(dataUri: string): Promise<string | null>;
}

function toAgentMessages(
  history: ChatMessage[],
  text: string,
  systemPrompt: string | undefined,
): CompletionMessage[] {
  const messages: CompletionMessage[] = [];
  if (systemPrompt && systemPrompt.trim() !== "") {
    messages.push({ role: "system", content: systemPrompt });
  }
  for (const m of history) {
    if ((m.role !== "user" && m.role !== "assistant") || m.text.trim() === "") {
      continue;
    }
    messages.push({ role: m.role, content: m.text });
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
    paths: {
      sessionId: string | null;
      image?: string;
      history: ChatMessage[];
      retry?: boolean;
    },
    onToken?: (text: string) => void,
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
    let imagePaths: string[] | undefined;
    if (paths.image) {
      const saved = await deps.saveImage(paths.image).catch(() => null);
      if (saved) imagePaths = [saved];
    }

    const result = await runLocalAgent({
      engine,
      messages: toAgentMessages(paths.history, trimmed, systemPrompt),
      tools: talentDefinitions(),
      // Local reads imagePaths (llama media_paths); remote stays text-only.
      ...(imagePaths ? { imagePaths } : {}),
      ...(thinking !== undefined ? { enableThinking: thinking } : {}),
      fetchImpl: fetch,
      search,
      userTexts: userTextsOf(paths.history),
      onEvent: (event) => {
        if (event.type === "token" && event.text !== "") onToken?.(event.text);
      },
    });

    // Backend parity: an empty reply with no tool provenance is a failed
    // turn (error bubble), never a persisted empty assistant message.
    if (result.text.trim() === "" && result.steps.length === 0) {
      throw new Error("empty reply");
    }
    const steps: AgentStep[] = result.steps.map((s) => ({
      id: s.id,
      tool: s.tool,
      status: "done" as const,
      ...(s.input ? { input: s.input } : {}),
      ...(s.result !== undefined ? { result: s.result } : {}),
    }));
    const usage = {
      prompt_tokens: result.promptTokens,
      completion_tokens: result.completionTokens,
      total_tokens: result.promptTokens + result.completionTokens,
    };
    // Best-effort persistence: a store failure must not blank the reply.
    // Retry re-answers a stored question, so it skips the user append.
    try {
      if (store) {
        if (!paths.retry) {
          await store.append(sessionId, { role: "user", content: trimmed, type: "text" });
          await store.setTitleIfEmpty(sessionId, trimmed.slice(0, SESSION_TITLE_LEN));
        }
        await store.append(sessionId, {
          role: "assistant",
          content: result.text,
          type: "text",
          metadata: {
            tool_runs: steps.map((s) => ({
              name: s.tool,
              ...(s.input ? { input: s.input } : {}),
              ...(s.result !== undefined ? { result: s.result } : {}),
            })),
            usage,
          },
        });
      }
    } catch {
      // Reply already resolved; persistence retries on the next turn.
    }
    return {
      reply: result.text,
      sessionId,
      steps,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
    };
  };
}
