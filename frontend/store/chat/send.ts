/** Send slice: streamed turns, error retry, and regenerate.
 *
 * Every turn streams (stream:true). The backend `retry` contract regenerates
 * without resending text: the client drops nothing server-side itself, it
 * just asks for a fresh answer to the stored question.
 */

import {
  postChatStream,
  type StreamBody,
} from "../../lib/chat/api.ts";
import type { ApiError, ApiErrorCode } from "../../types/api.ts";
import type { ChatStreamEvent } from "../../lib/chat/sse.ts";
import type { AgentStep, ChatMessage } from "../../types/chat.ts";
import { newId } from "../../lib/chat/messages.ts";
import { SESSION_KEY } from "./types.ts";
import type { ChatCtx, ChatGet, ChatSet, ChatState } from "./types.ts";

/** Codes the backend may send mid-stream (its error envelope). Anything
 * else degrades to internal_error rather than smuggling an unknown code
 * into render state. */
const STREAM_ERROR_CODES: readonly string[] = [
  "invalid_request",
  "llm_error",
  "store_error",
  "not_found",
  "http_error",
  "internal_error",
  "network",
  "timeout",
  "conflict",
  "cancelled",
  "upload_failed",
  "list_failed",
  "delete_failed",
];

function toApiError(code: string, message: string): ApiError {
  const known = STREAM_ERROR_CODES.includes(code) ? code : "internal_error";
  return { code: known as ApiErrorCode, message };
}

export function createSendSlice(
  set: ChatSet,
  get: ChatGet,
  ctx: ChatCtx,
): Pick<ChatState, "sending" | "send" | "retry" | "regenerate"> {
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

  function removeBubble(id: string): void {
    set((s) => ({ messages: s.messages.filter((m) => m.id !== id) }));
  }

  function adoptSession(id: string): void {
    if (get().sessionId !== id) {
      set({ sessionId: id });
      void ctx.storage.setItem(SESSION_KEY, id).catch(() => {});
    }
  }

  async function runStream(opts: {
    assistantId: string;
    userId?: string;
    body: StreamBody;
    /** Reused bubbles drop stale text/steps on the first fresh token. */
    clearOnFirst: boolean;
  }): Promise<void> {
    const gen = (ctx.streamGen += 1);
    let started = false;
    let firstToken = true;
    // BYOK search creds ride every streamed turn (consent-gated); a
    // settings failure degrades to no-search rather than blocking the turn.
    const search = await ctx.getSearchAuth().catch(() => null);
    const handle = postChatStream(
      { ...opts.body, ...(search !== null ? { search } : {}) },
      (event: ChatStreamEvent) => {
        // Superseded (cancelled or replaced) streams never touch state.
        if (gen !== ctx.streamGen) return;
        switch (event.type) {
          case "start": {
            started = true;
            adoptSession(event.sessionId);
            break;
          }
          case "token": {
            if (opts.clearOnFirst && firstToken) {
              updateBubble(opts.assistantId, {
                text: "",
                steps: undefined,
                usage: undefined,
              });
            }
            firstToken = false;
            updateBubble(opts.assistantId, (m) => ({ text: m.text + event.text }));
            break;
          }
          case "tool": {
            updateBubble(opts.assistantId, (m) => {
              const steps = [...(m.steps ?? [])];
              const next: AgentStep = {
                id: event.id,
                tool: event.name,
                status: event.status,
                ...(event.input !== undefined ? { input: event.input } : {}),
                ...(event.result !== undefined ? { result: event.result } : {}),
              };
              // Pairs close by wire id: a done event completes its running
              // entry; an unmatched done (or a repeat call) appends, so
              // parallel same-name calls keep their own results.
              const at = steps.findIndex(
                (s) => s.id !== undefined && s.id === event.id,
              );
              if (at >= 0) steps[at] = { ...steps[at], ...next };
              else steps.push(next);
              return { steps };
            });
            break;
          }
          case "usage": {
            updateBubble(opts.assistantId, {
              usage: {
                promptTokens: event.promptTokens,
                completionTokens: event.completionTokens,
                totalTokens: event.totalTokens,
              },
            });
            break;
          }
          case "done": {
            updateBubble(opts.assistantId, { streaming: false, at: Date.now() });
            adoptSession(event.sessionId);
            set({ sending: false });
            void get().refreshSessions();
            break;
          }
          case "error": {
            updateBubble(opts.assistantId, {
              streaming: false,
              error: toApiError(event.code, event.message),
            });
            set({ sending: false });
            void get().refreshSessions();
            break;
          }
        }
      },
      ctx.openXhr,
    );
    ctx.active.handle = handle;
    try {
      await handle.done;
    } catch (err) {
      // Transport failure (never opened or cut mid-stream).
      if (gen !== ctx.streamGen) return;
      const apiErr = err as ApiError;
      if (!started && opts.userId !== undefined) {
        removeBubble(opts.assistantId);
        updateBubble(opts.userId, { error: apiErr });
      } else {
        updateBubble(opts.assistantId, { streaming: false, error: apiErr });
      }
      set({ sending: false });
    } finally {
      if (ctx.active.handle === handle) ctx.active.handle = null;
    }
  }

  return {
    sending: false,

    send: async (text: string, image?: string) => {
      const trimmed = text.trim();
      if (trimmed === "" || get().sending) return false;
      const userId = newId();
      const assistantId = newId();
      const sid = get().sessionId;
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
      await runStream({
        userId,
        assistantId,
        body: {
          message: trimmed,
          ...(image !== undefined ? { image } : {}),
          ...(sid !== null ? { session_id: sid } : {}),
          stream: true,
        },
        clearOnFirst: false,
      });
      return true;
    },

    retry: async (messageId: string) => {
      if (get().sending) return false;
      const target = get().messages.find((m) => m.id === messageId);
      if (!target || target.error === undefined) return false;
      if (target.role === "user") {
        // The turn never reached the backend: fresh re-send, same bubble.
        updateBubble(target.id, { error: undefined });
        const assistantId = newId();
        const sid = get().sessionId;
        set((s) => ({
          sending: true,
          messages: [
            ...s.messages,
            { id: assistantId, role: "assistant", text: "", at: Date.now(), streaming: true },
          ],
        }));
        await runStream({
          userId: target.id,
          assistantId,
          body: {
            message: target.text,
            ...(target.image !== undefined ? { image: target.image } : {}),
            ...(sid !== null ? { session_id: sid } : {}),
            stream: true,
          },
          clearOnFirst: false,
        });
        return true;
      }
      const sid = get().sessionId;
      if (sid === null) return false;
      updateBubble(target.id, { error: undefined, streaming: true });
      set({ sending: true });
      await runStream({
        assistantId: target.id,
        body: { session_id: sid, stream: true, retry: true },
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
        get().sending ||
        sid === null
      ) {
        return false;
      }
      updateBubble(target.id, { streaming: true });
      set({ sending: true });
      await runStream({
        assistantId: target.id,
        body: { session_id: sid, stream: true, retry: true },
        clearOnFirst: true,
      });
      return true;
    },
  };
}
