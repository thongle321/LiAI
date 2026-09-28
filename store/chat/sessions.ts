/** Sessions slice: Store-owned list + active-session lifecycle. */

import { toMessages, toSession } from "../../lib/chat/messages.ts";
import type { SessionStore } from "../../lib/chat/session-store.ts";
import { readDraftFor } from "./draft.ts";
import type { ChatCtx, ChatGet, ChatSet, ChatState } from "./types.ts";

async function quiet(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {
    // best-effort persistence/UI refresh only
  }
}

async function storeOf(ctx: ChatCtx): Promise<SessionStore | null> {
  try {
    return await ctx.getStore();
  } catch {
    return null;
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
> {
  function cancelActive(): void {
    ctx.streamGen += 1;
    ctx.active.handle?.cancel();
    ctx.active.handle = null;
  }

  async function refreshSessions(): Promise<void> {
    const store = await storeOf(ctx);
    if (!store) return;
    try {
      set({ sessions: (await store.listSessions()).map(toSession) });
    } catch {
      // best-effort: the drawer keeps whatever it has
    }
  }

  async function patchSession(
    id: string,
    patch: { title?: string; pinned?: boolean },
  ): Promise<boolean> {
    const store = await storeOf(ctx);
    if (!store) return false;
    try {
      const ok =
        patch.title !== undefined
          ? await store.renameSession(id, patch.title)
          : await store.setSessionPinned(id, patch.pinned ?? false);
      if (!ok) return false;
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === id ? { ...sess, ...patch } : sess,
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
      const store = await storeOf(ctx);
      let listed = false;
      try {
        if (store) {
          set({ sessions: (await store.listSessions()).map(toSession) });
          listed = true;
        }
      } catch {
        // keep whatever is already in state
      }
      // The pointer is the store's own value, so it cannot name a session
      // that does not exist: there is nothing to validate against a
      // remote list any more.
      let stored: string | null = null;
      try {
        stored = store ? await store.getActiveSessionId() : null;
      } catch {
        stored = null;
      }
      if (stored === null) {
        set({ sessionId: null, messages: [], draft: await readDraftFor(ctx, null) });
        return;
      }
      if (!listed) {
        // Couldn't verify against the store: keep the stored id.
        set({ sessionId: stored });
        return;
      }
      if (!get().sessions.some((s) => s.id === stored)) {
        if (store) await quiet(store.setActiveSessionId(null));
        set({ sessionId: null, messages: [], draft: await readDraftFor(ctx, null) });
        return;
      }
      await get().switchSession(stored);
    },

    newConversation: async () => {
      cancelActive();
      await quiet(get().persistDraft());
      const store = await storeOf(ctx);
      if (store) await quiet(store.setActiveSessionId(null));
      set({
        sessionId: null,
        messages: [],
        sending: false,
        draft: await readDraftFor(ctx, null),
      });
    },

    switchSession: async (id: string) => {
      if (get().sending || get().sessionId === id) return false;
      if (!get().sessions.some((s) => s.id === id)) return false;
      await quiet(get().persistDraft());
      const store = await storeOf(ctx);
      if (!store) return false;
      try {
        const turns = await store.get(id);
        if (turns === null) return false;
        await quiet(store.setActiveSessionId(id));
        set({
          sessionId: id,
          messages: toMessages(turns),
          draft: await readDraftFor(ctx, id),
        });
        return true;
      } catch {
        return false;
      }
    },

    deleteSession: async (id: string) => {
      // Never pull the rug on an in-flight turn.
      if (get().sending && get().sessionId === id) return;
      const store = await storeOf(ctx);
      // deleteSession also clears the session's draft and the pointer to
      // it, so nothing is left pointing at a conversation that is gone.
      if (store) await quiet(store.deleteSession(id));
      set((s) => ({ sessions: s.sessions.filter((sess) => sess.id !== id) }));
      if (get().sessionId === id) {
        // The deleted session's text must not haunt the fresh composer:
        // fall back to whatever is parked in the unsent slot.
        set({
          sessionId: null,
          messages: [],
          sending: false,
          draft: await readDraftFor(ctx, null),
        });
      }
    },

    renameSession: (id: string, title: string) => patchSession(id, { title }),

    setPinned: (id: string, pinned: boolean) => patchSession(id, { pinned }),
  };
}
