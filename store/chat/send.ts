/** Send slice: on-device turns, error retry, and regenerate (ADR-0009).
 *
 * Every turn runs locally through the injected TurnRunner: tokens stream
 * into the bubble as they arrive, steps/usage land at the end. Failures
 * mark the bubble (tap-to-retry) and persist nothing.
 */

import type { ApiError } from "../../types/api.ts";
import type { ChatMessage } from "../../types/chat.ts";
import { newId } from "../../lib/chat/messages.ts";
import type { SessionStore } from "../../lib/chat/session-store.ts";
import type { ChatCtx, ChatGet, ChatSet, ChatState } from "./types.ts";

function llmError(message: string): ApiError {
  return { code: "llm_error", message };
}

export function createSendSlice(
  set: ChatSet,
  get: ChatGet,
  ctx: ChatCtx,
): Pick<ChatState, "sending" | "send" | "stop" | "retry" | "regenerate"> {
  function updateBubble(
    id: string,
    patch: Partial<ChatMessage> | ((m: ChatMessage) => Partial<ChatMessage>),
  ): void {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m,
      ),
    }));
  }

  function adoptSession(id: string): void {
    if (get().sessionId !== id) {
      set({ sessionId: id });
      void ctx
        .getStore()
        .then((store: SessionStore | null) => {
          // Only write if this is STILL the active session: a slow store
          // must not resurrect a pointer for a conversation the user has
          // already navigated away from.
          if (get().sessionId !== id) return undefined;
          return store?.setActiveSessionId(id);
        })
        .catch(() => {});
    }
  }

  /** Run one turn, streaming tokens live into the bubble. Retry reruns a
   * stored question, so it skips the user append (no duplicate). */
  async function runLocal(opts: {
    assistantId: string;
    text: string;
    sessionId: string | null;
    image?: string;
    history: ChatMessage[];
    retry?: boolean;
    clearOnFirst: boolean;
  }): Promise<void> {
    const gen = (ctx.streamGen += 1);
    if (opts.clearOnFirst) {
      updateBubble(opts.assistantId, {
        text: "",
        reasoning: undefined,
        steps: undefined,
        usage: undefined,
      });
    }
    try {
      const outcome = await ctx.runTurn(
        opts.text,
        {
          sessionId: opts.sessionId,
          ...(opts.image !== undefined ? { image: opts.image } : {}),
          history: opts.history,
          ...(opts.retry ? { retry: true } : {}),
        },
        (token) => {
          if (gen !== ctx.streamGen) return;
          updateBubble(opts.assistantId, (m) => ({ text: m.text + token }));
        },
        (cumulative) => {
          if (gen !== ctx.streamGen) return;
          updateBubble(opts.assistantId, { reasoning: cumulative });
        },
      );
      if (gen !== ctx.streamGen) return;
      updateBubble(opts.assistantId, {
        text: outcome.reply,
        ...(outcome.reasoning !== undefined ? { reasoning: outcome.reasoning } : {}),
        streaming: false,
        at: Date.now(),
        ...(outcome.steps.length > 0 ? { steps: outcome.steps } : {}),
        usage: {
          promptTokens: outcome.promptTokens,
          completionTokens: outcome.completionTokens,
          totalTokens: outcome.promptTokens + outcome.completionTokens,
        },
      });
      adoptSession(outcome.sessionId);
      set({ sending: false });
      void get().refreshSessions();
    } catch (err) {
      if (gen !== ctx.streamGen) return;
      const message = err instanceof Error ? err.message : "Local run failed";
      updateBubble(opts.assistantId, {
        streaming: false,
        error: llmError(message),
      });
      set({ sending: false });
    }
  }

  /** Last user text before (excluding) a bubble — the question to rerun. */
  function priorUserText(beforeId: string): ChatMessage | null {
    const messages = get().messages;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].id === beforeId) {
        for (let j = i - 1; j >= 0; j -= 1) {
          if (messages[j].role === "user") return messages[j];
        }
        return null;
      }
    }
    const last = [...messages].reverse().find((m) => m.role === "user");
    return last ?? null;
  }

  return {
    sending: false,

    stop: () => {
      if (!get().sending) return;
      // Invalidate in-flight token callbacks, then halt the engine.
      // The partial reply stays in its bubble as the turn's text.
      ctx.streamGen += 1;
      ctx.stopEngine();
      set((s) => ({
        sending: false,
        messages: s.messages.map((m) =>
          m.streaming === true ? { ...m, streaming: false, at: Date.now() } : m,
        ),
      }));
    },

    send: async (text: string, image?: string) => {
      const trimmed = text.trim();
      if (trimmed === "" || get().sending) return false;
      const userId = newId();
      const assistantId = newId();
      const sid = get().sessionId;
      const history = get().messages;
      set((s) => ({
        sending: true,
        messages: [
          ...s.messages,
          {
            id: userId,
            role: "user",
            text: trimmed,
            at: Date.now(),
            ...(image !== undefined ? { image } : {}),
          },
          { id: assistantId, role: "assistant", text: "", at: Date.now(), streaming: true },
        ],
      }));
      await runLocal({
        assistantId,
        text: trimmed,
        sessionId: sid,
        ...(image !== undefined ? { image } : {}),
        history,
        clearOnFirst: false,
      });
      // The text now lives in its bubble (or its error retry): the
      // composer draft is spent — clear memory and the stored draft.
      set({ draft: "" });
      try {
        const store: SessionStore | null = await ctx.getStore();
        await store?.clearDraft(sid);
      } catch {
        // Non-critical: an empty string overwrites it next persist.
      }
      return true;
    },

    retry: async (messageId: string) => {
      if (get().sending) return false;
      const target = get().messages.find((m) => m.id === messageId);
      if (!target || target.error === undefined) return false;
      if (target.role === "user") {
        // The turn never persisted: fresh re-send, same bubble text.
        updateBubble(target.id, { error: undefined });
        const assistantId = newId();
        const sid = get().sessionId;
        const history = get().messages.filter((m) => m.id !== target.id);
        set((s) => ({
          sending: true,
          messages: [
            ...s.messages,
            { id: assistantId, role: "assistant", text: "", at: Date.now(), streaming: true },
          ],
        }));
        await runLocal({
          assistantId,
          text: target.text,
          sessionId: sid,
          ...(target.image !== undefined ? { image: target.image } : {}),
          history,
          retry: true,
          clearOnFirst: false,
        });
        return true;
      }
      const question = priorUserText(target.id);
      if (!question) return false;
      // A failed first turn mints no session; the runner creates one.
      const sid = get().sessionId;
      updateBubble(target.id, { error: undefined, streaming: true });
      set({ sending: true });
      await runLocal({
        assistantId: target.id,
        text: question.text,
        sessionId: sid,
        ...(question.image !== undefined ? { image: question.image } : {}),
        history: get().messages.filter((m) => m.id !== target.id),
        retry: true,
        clearOnFirst: true,
      });
      return true;
    },

    regenerate: async (messageId: string) => {
      const target = get().messages.find((m) => m.id === messageId);
      const sid = get().sessionId;
      if (
        !target ||
        target.role !== "assistant" ||
        target.error !== undefined ||
        target.streaming === true ||
        get().sending
      ) {
        return false;
      }
      const question = priorUserText(target.id);
      if (!question) return false;
      // Drop the stored assistant turn so history + bubble agree.
      if (sid !== null) {
        try {
          await (await ctx.getStore())?.popLastAssistant(sid);
        } catch {
          // Best-effort: the rerun overwrites the bubble regardless.
        }
      }
      updateBubble(target.id, { streaming: true });
      set({ sending: true });
      await runLocal({
        assistantId: target.id,
        text: question.text,
        sessionId: sid,
        ...(question.image !== undefined ? { image: question.image } : {}),
        history: get().messages.filter((m) => m.id !== target.id),
        retry: true,
        clearOnFirst: true,
      });
      return true;
    },
  };
}
