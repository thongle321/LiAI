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
import { canSeeImages, loadModelState } from "../../lib/inference/mmproj.ts";
import type { ChatCtx, ChatGet, ChatSet, ChatState } from "./types.ts";

function llmError(message: string): ApiError {
  return { code: "llm_error", message };
}

/** Can the ACTIVE engine see an image this turn? (G12, vision-series 02)
 *
 * PocketPal asks `modelStore.activeModelCaps.visionActive` — whether a
 * projector is loaded RIGHT NOW. LiAI's engine slot is lazy (loaded at
 * send time), so this answers the equivalent question predictively: the
 * ACTIVE local model's spec is completed AND records its paired
 * projector (ticket 01), which is exactly the path ensureEngine will
 * attach (lib/inference/mmproj.ts). A declaration alone never flips it.
 * Remote stays cannot-see until ticket 04.
 *
 * EXPORTED: the vision screen reads this same gate to show the can't-see
 * notice, so the strip and the notice can never disagree. */
export async function multimodalAvailable(): Promise<boolean> {
  const st = await loadModelState();
  return st !== undefined && canSeeImages(st);
}

/** What PocketPal says when images ride a turn the model cannot see.
 *  Shared with the vision screen's own notice surface (vision-series 01). */
export const MULTIMODAL_WARNING = "This model can't see images, so it was sent the text only.";

/** PocketPal parity (useChatSession.ts:722, YIELD_INTERVAL_MS): while a
 *  turn streams, hand the JS thread a macrotask beat every 100ms so touch
 *  dispatch — notably Stop — gets a turn during long streams. LiAI's token
 *  path is native callbacks all the way down (no async loop to hang
 *  PocketPal's in-chain `await setTimeout(0)` on), so the beat is held for
 *  exactly the streaming span of runLocal instead. Idle holds no timer at
 *  all. The token path never touches this: output ordering, coalescing and
 *  the blank-space animation cannot shift because of it.
 *
 *  ponytail: static analysis cannot prove this beat is what makes Stop
 *  dispatch — native token callbacks are separate JS tasks, so FIFO may
 *  already interleave touches. The ticket pre-admits device confirmation
 *  is the real check; if a device shows Stop responding without it, the
 *  upgrade path is DELETING this (the release handle and finally go with
 *  it), not growing it.
 *
 *  `onTick` is the test seam; production never passes it. Returns the
 *  release handle — every exit path calls it. */
export function startStreamYield(
  intervalMs = 100,
  onTick?: () => void,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = () => {
    if (stopped) return;
    onTick?.();
    timer = setTimeout(tick, intervalMs);
  };
  timer = setTimeout(tick, intervalMs);
  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}

export function createSendSlice(
  set: ChatSet,
  get: ChatGet,
  ctx: ChatCtx,
): Pick<
  ChatState,
  | "sending"
  | "turnStartedAt"
  | "pendingToolName"
  | "stopping"
  | "toolTokenCount"
  | "chatWarning"
  | "setChatWarning"
  | "send"
  | "stop"
  | "retry"
  | "regenerate"
  | "editingTurnId"
  | "startEdit"
  | "cancelEdit"
> {
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
    /** Row id for the user turn. Undefined on retry/regenerate, which
     *  re-answer an already-stored question. */
    userId?: string;
    text: string;
    sessionId: string | null;
    /** Photos for this turn (G8). */
    images?: string[];
    history: ChatMessage[];
    retry?: boolean;
    clearOnFirst: boolean;
  }): Promise<void> {
    const gen = (ctx.streamGen += 1);
    // Hold the screen awake for the life of the turn (audit G2). Every
    // send/retry/regenerate funnels through here, so this is the one
    // place that has to know a turn started.
    ctx.keepAwake(true);
    set({ turnStartedAt: Date.now() });
    // Ticket 03: each turn's tool-call token count starts from zero.
    ctx.toolTokens.turnStart();
    set({ toolTokenCount: 0 });
    if (opts.clearOnFirst) {
      updateBubble(opts.assistantId, {
        text: "",
        reasoning: undefined,
        steps: undefined,
        blocks: undefined,
        usage: undefined,
        // A rerun replaces the turn's ending: keeping the old flags would
        // claim the new answer finished the way the old one did.
        outcome: undefined,
      });
    }
    // G12 (PocketParity) -- do the same as PocketPal's useChatSession.
    //
    // PocketPal gates on whether a projector is actually loaded; when
    // images ride a turn that cannot see them it STILL sends the message
    // as plain text and raises a warning (useChatSession.ts:97-105). It
    // does not block, and it does not fail the turn -- which is why the
    // user gets a turn back instead of a raw engine error.
    //
    // The guard sits HERE, not in each caller: send, retry, regenerate and
    // edit all route through runLocal, so one check covers every path and
    // none of them can drift into disagreeing about it.
    // No images → the capability question never gets asked (and its
    // native modelStore probe never fires for a text-only turn).
    const images =
      opts.images !== undefined &&
      opts.images.length > 0 &&
      (await ctx.multimodalAvailable())
        ? opts.images
        : undefined;
    if (opts.images !== undefined && opts.images.length > 0 && images === undefined) {
      set({
        chatWarning: {
          message: MULTIMODAL_WARNING,
          // PocketPal's createMultimodalWarning: not recoverable, because
          // there is nothing to retry into until a projector can be paired.
          severity: "warning",
          recoverable: false,
        },
      });
    }
    // C16: the macrotask beat lives exactly as long as this turn.
    const endStreamYield = startStreamYield();
    try {
      const outcome = await ctx.runTurn(
        opts.text,
        {
          sessionId: opts.sessionId,
          ...(images !== undefined ? { images } : {}),
          history: opts.history,
          ...(opts.retry ? { retry: true } : {}),
          // The bubble ids ARE the row ids: minted up front so there is
          // never a moment where a bubble exists but cannot be addressed.
          ...(opts.userId !== undefined ? { userMessageId: opts.userId } : {}),
          assistantMessageId: opts.assistantId,
        },
        (token) => {
          if (gen !== ctx.streamGen) return;
          updateBubble(opts.assistantId, (m) => ({ text: m.text + token }));
        },
        (cumulative) => {
          if (gen !== ctx.streamGen) return;
          updateBubble(opts.assistantId, { reasoning: cumulative });
        },
        (toolName) => {
          if (gen !== ctx.streamGen) return;
          // The call's fragments are done: the next assembly starts the
          // count over (the reset lives at the start of each tool call).
          ctx.toolTokens.settleCall();
          set({ pendingToolName: toolName });
        },
        // onToolDelta callback: the store's count ticks ONLY on
        // tool-call assembly deltas — reply-text deltas flow through
        // onToken, which never touches the counter. That distinction
        // is the count's honesty.
        () => {
          if (gen !== ctx.streamGen) return;
          set({ toolTokenCount: ctx.toolTokens.delta("tool") });
        },
      );
      if (gen !== ctx.streamGen) return;
      updateBubble(opts.assistantId, {
        text: outcome.reply,
        ...(outcome.reasoning !== undefined ? { reasoning: outcome.reasoning } : {}),
        streaming: false,
        at: Date.now(),
        ...(outcome.steps.length > 0 ? { steps: outcome.steps } : {}),
        ...(outcome.blocks !== undefined ? { blocks: outcome.blocks } : {}),
        usage: {
          promptTokens: outcome.promptTokens,
          completionTokens: outcome.completionTokens,
          totalTokens: outcome.promptTokens + outcome.completionTokens,
        },
        ...(outcome.outcome !== undefined ? { outcome: outcome.outcome } : {}),
      });
      adoptSession(outcome.sessionId);
      set({ sending: false, turnStartedAt: null, pendingToolName: null });
      // Released with the turn. The `gen` guard above means a superseded
      // run never reaches this, so a NEW turn's lock is never stomped.
      ctx.keepAwake(false);
      void get().refreshSessions();
    } catch (err) {
      if (gen !== ctx.streamGen) return;
      const message = err instanceof Error ? err.message : "Local run failed";
      updateBubble(opts.assistantId, {
        streaming: false,
        error: llmError(message),
      });
      set({ sending: false, turnStartedAt: null, pendingToolName: null });
      ctx.keepAwake(false);
    } finally {
      // Success, failure or supersede: idle must hold no timer.
      endStreamYield();
      // A stopped turn acknowledging goes clear exactly when ITS loop
      // exits — a later turn's finally must not clear a NEWER stop.
      if (ctx.stoppingGen === gen) {
        ctx.stoppingGen = null;
        set({ stopping: false });
      }
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
    turnStartedAt: null,
    pendingToolName: null,
    stopping: false,
    toolTokenCount: 0,
    chatWarning: null,
    setChatWarning: (warning) => set({ chatWarning: warning }),
    editingTurnId: null,

    startEdit: (messageId: string): boolean => {
      if (get().sending) return false;
      const target = get().messages.find((m) => m.id === messageId);
      // User rows only: re-answering an assistant turn is regenerate, and
      // letting a user "edit" one would be the same verb with two meanings.
      if (!target || target.role !== "user") return false;
      // Nothing persisted means nothing to rewind.
      if (get().sessionId === null) return false;
      set({ editingTurnId: messageId, draft: target.text });
      // persistDraft reads get().draft and get().sessionId, both of which
      // the line above just set — no reason to hand-roll it.
      void get().persistDraft();
      return true;
    },

    cancelEdit: () => {
      const editingId = get().editingTurnId;
      if (editingId === null) return;
      const target = get().messages.find((m) => m.id === editingId);
      // Back to the turn's own text, not to whatever the composer happened
      // to hold before edit mode was entered.
      const restored = target?.text ?? "";
      set({ editingTurnId: null, draft: restored });
      void get().persistDraft();
    },

    stop: () => {
      if (!get().sending) return;
      // Mark the run this Stop belongs to BEFORE invalidating its
      // callbacks; its finally clears `stopping` when it unwinds.
      ctx.stoppingGen = ctx.streamGen;
      // Invalidate in-flight token callbacks, then halt the engine.
      // The partial reply stays in its bubble as the turn's text.
      ctx.streamGen += 1;
      ctx.stopEngine();
      // Drop the wake lock HERE, not when the aborted run unwinds: the
      // engine teardown is exactly when the screen must not sleep, and
      // the `gen` guard keeps the unwinding run from touching it again.
      ctx.keepAwake(false);
      set((s) => ({
        sending: false,
        turnStartedAt: null,
        // The turn is no longer running: a stale name would mislabel
        // the next turn's text-only span (phaseLabel's undefined case).
        pendingToolName: null,
        // ...but the row must keep acknowledging the stop while the
        // engine unwinds: a distinct flag, NOT the in-flight one (which
        // we just cleared, so the composer stays usable).
        stopping: true,
        messages: s.messages.map((m) =>
          m.streaming === true ? { ...m, streaming: false, at: Date.now() } : m,
        ),
      }));
    },

    send: async (text: string, images?: string[]) => {
      const trimmed = text.trim();
      if (trimmed === "" || get().sending) return false;
      const sid = get().sessionId;
      const editingId = get().editingTurnId;

      let userId: string;
      let assistantId: string;
      let history: ChatMessage[];
      let keep: ChatMessage[];

      if (editingId !== null) {
        // Committing an edit. The edited turn AND everything after it are
        // replaced by this send -- that is what makes an edit an edit
        // rather than a second message. A FULL send, never a retry:
        // truncateFrom removes the question's own row, and retry skips
        // the user append, so the model would answer a question that is
        // no longer in history.
        const editIndex = get().messages.findIndex((m) => m.id === editingId);
        if (editIndex < 0 || sid === null) return false;
        try {
          const store: SessionStore | null = await ctx.getStore();
          if (!store || !(await store.truncateFrom(sid, editingId))) return false;
        } catch {
          return false;
        }
        history = get().messages.slice(0, editIndex);
        keep = history;
        // The edited turn keeps its id, so it stays addressable.
        userId = editingId;
        assistantId = newId();
      } else {
        userId = newId();
        assistantId = newId();
        history = get().messages;
        keep = history;
      }

      set({
        sending: true,
        ...(editingId !== null ? { editingTurnId: null } : {}),
        messages: [
          ...keep,
          {
            id: userId,
            role: "user",
            text: trimmed,
            at: Date.now(),
            ...(images !== undefined ? { images } : {}),
          },
          { id: assistantId, role: "assistant", text: "", at: Date.now(), streaming: true },
        ],
      });
      await runLocal({
        assistantId,
        userId,
        text: trimmed,
        sessionId: sid,
        ...(images !== undefined ? { images } : {}),
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
          ...(target.images !== undefined ? { images: target.images } : {}),
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
        ...(question.images !== undefined ? { images: question.images } : {}),
        history: get().messages.filter((m) => m.id !== target.id),
        retry: true,
        clearOnFirst: true,
      });
      return true;
    },

    regenerate: async (messageId: string) => {
      const messages = get().messages;
      const target = messages.find((m) => m.id === messageId);
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
      const questionIndex = messages.findIndex((m) => m.id === question.id);
      const isLastTurn = messages[messages.length - 1]?.id === target.id;

      if (isLastTurn) {
        // Nothing follows, so the cheap path is enough: drop the trailing
        // assistant turn and re-answer the question already stored above it.
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
          ...(question.images !== undefined ? { images: question.images } : {}),
          history: messages.filter((m) => m.id !== target.id),
          retry: true,
          clearOnFirst: true,
        });
        return true;
      }

      // Something follows, so re-answering means discarding the question
      // AND everything after it -- that is the only definition of
      // "regenerate this answer" that leaves a coherent thread.
      if (sid === null) return false;
      const store = await ctx.getStore();
      if (!store) return false;
      try {
        if (!(await store.truncateFrom(sid, question.id))) return false;
      } catch {
        return false;
      }

      // A FULL send, not a retry: truncateFrom removed the question's own
      // row, and retry skips the user append, so the model would be asked
      // to answer a question that is no longer in history.
      const before = messages.slice(0, questionIndex);
      set({
        sending: true,
        messages: [
          ...before,
          {
            id: question.id,
            role: "user",
            text: question.text,
            at: question.at,
            ...(question.images !== undefined ? { images: question.images } : {}),
          },
          // The bubble keeps its id, so the turn stays addressable across
          // the rewrite.
          { id: target.id, role: "assistant", text: "", at: Date.now(), streaming: true },
        ],
      });
      await runLocal({
        assistantId: target.id,
        userId: question.id,
        text: question.text,
        sessionId: sid,
        ...(question.images !== undefined ? { images: question.images } : {}),
        history: before,
        clearOnFirst: false,
      });
      return true;
    },
  };
}
