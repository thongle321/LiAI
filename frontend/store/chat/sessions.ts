/** Sessions slice: backend-owned list + active-session lifecycle. */

import { deleteSession as deleteSessionApi, listSessions } from "../../lib/chat/api.ts";
import { updateSession as updateSessionApi } from "../../lib/chat/api.ts";
import { getHistory } from "../../lib/api.ts";
import { toMessages, toSession } from "../../lib/chat/messages.ts";
import { HISTORY_KEY, SESSION_KEY } from "./types.ts";
import type { ChatCtx, ChatGet, ChatSet, ChatState } from "./types.ts";

async function quiet(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {
    // best-effort persistence/UI refresh only
  }
}

export function createSessionsSlice(
  set: ChatSet,
  get: ChatGet,
  ctx: ChatCtx,
): Pick<
  ChatState,
  | "sessions"
  | "sessionId"
  | "loadSession"
  | "newConversation"
  | "switchSession"
  | "deleteSession"
  | "renameSession"
  | "setPinned"
  | "refreshSessions"
  | "recordVisionTurn"
> {
  function cancelActive(): void {
    ctx.streamGen += 1;
    ctx.active.handle?.cancel();
    ctx.active.handle = null;
  }

  async function refreshSessions(): Promise<void> {
    try {
      set({ sessions: (await listSessions()).map(toSession) });
    } catch {
      // best-effort: the drawer keeps whatever it has
    }
  }

  async function patchSession(
    id: string,
    patch: { title?: string; pinned?: boolean },
  ): Promise<boolean> {
    try {
      const updated = await updateSessionApi(id, patch);
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === id
            ? { ...sess, title: updated.title, pinned: updated.pinned }
            : sess,
        ),
      }));
      return true;
    } catch {
      return false;
    }
  }

  return {
    sessions: [],
    sessionId: null,

    refreshSessions,

    loadSession: async () => {
      await quiet(ctx.storage.removeItem(HISTORY_KEY));
      let listed = false;
      try {
        set({ sessions: (await listSessions()).map(toSession) });
        listed = true;
      } catch {
        // keep whatever is already in state
      }
      let stored: string | null = null;
      try {
        stored = await ctx.storage.getItem(SESSION_KEY);
      } catch {
        stored = null;
      }
      if (stored === null) {
        set({ sessionId: null, messages: [] });
        return;
      }
      if (!listed) {
        // Couldn't verify against the backend: keep the stored id.
        set({ sessionId: stored });
        return;
      }
      if (!get().sessions.some((s) => s.id === stored)) {
        await quiet(ctx.storage.removeItem(SESSION_KEY));
        set({ sessionId: null, messages: [] });
        return;
      }
      await get().switchSession(stored);
    },

    newConversation: async () => {
      cancelActive();
      await quiet(ctx.storage.removeItem(SESSION_KEY));
      set({ sessionId: null, messages: [], sending: false });
    },

    switchSession: async (id: string) => {
      if (get().sending || get().sessionId === id) return false;
      if (!get().sessions.some((s) => s.id === id)) return false;
      try {
        const res = await getHistory(id);
        await quiet(ctx.storage.setItem(SESSION_KEY, res.session_id));
        set({ sessionId: res.session_id, messages: toMessages(res.messages) });
        return true;
      } catch {
        return false;
      }
    },

    deleteSession: async (id: string) => {
      // Never pull the rug on an in-flight turn.
      if (get().sending && get().sessionId === id) return;
      await quiet(deleteSessionApi(id));
      set((s) => ({ sessions: s.sessions.filter((sess) => sess.id !== id) }));
      if (get().sessionId === id) {
        await quiet(ctx.storage.removeItem(SESSION_KEY));
        set({ sessionId: null, messages: [], sending: false });
      }
    },

    renameSession: (id: string, title: string) => patchSession(id, { title }),

    setPinned: (id: string, pinned: boolean) => patchSession(id, { pinned }),

    recordVisionTurn: async (question, answer, sessionId, image) => {
      const nextSessionId = sessionId ?? get().sessionId;
      const now = Date.now();
      if (nextSessionId !== null && nextSessionId !== get().sessionId) {
        await quiet(ctx.storage.setItem(SESSION_KEY, nextSessionId));
      }
      set((s) => ({
        sessionId: nextSessionId,
        sending: false,
        messages: [
          ...s.messages,
          {
            id: `${now}-q`,
            role: "user",
            text: question,
            at: now,
            ...(image !== undefined ? { image } : {}),
          },
          { id: `${now}-a`, role: "assistant", text: answer, at: now },
        ],
      }));
      // Vision turns persist server-side already; refresh so the drawer
      // lists sessions the chat tab never opened.
      await refreshSessions();
    },
  };
}
