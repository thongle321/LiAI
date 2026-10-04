/** Sessions slice: Store-owned list + active-session lifecycle. */

import { toMessages, toSession } from "../../lib/chat/messages.ts";
import type { SessionStore } from "../../lib/chat/session-store.ts";
import { parseImport } from "../../lib/chat/import.ts";
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
  | "duplicateSession"
  | "renameSession"
  | "setPinned"
  | "importSessions"
  | "refreshSessions"
> {
  function cancelActive(): void {
    ctx.streamGen += 1;
    ctx.active.handle?.cancel();
    ctx.active.handle = null;
  }

  async function refreshSessions(): Promise<boolean> {
    const store = await storeOf(ctx);
    if (!store) return false;
    try {
      // Full re-list, not an optimistic patch: setCell bumps the row's
      // sort key (touch), so patching title/pinned in place would leave
      // the drawer sorted by the pre-touch order until the next refresh.
      set({ sessions: (await store.listSessions()).map(toSession) });
      return true;
    } catch {
      // best-effort: the drawer keeps whatever it has
      return false;
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
      if (await refreshSessions()) return true;
      // The write landed but the re-list failed: patch in place so the
      // drawer shows the accepted value (order catches up on the next
      // refresh) instead of the stale one.
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
      // A notice raised in the conversation you just left must not follow
      // you into the next one — "the image was dropped" is only ever true
      // of the turn that raised it.
      set({
        sessionId: null,
        messages: [],
        sending: false,
        turnStartedAt: null,
        chatWarning: null,
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
          chatWarning: null,
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
          turnStartedAt: null,
          chatWarning: null,
          draft: await readDraftFor(ctx, null),
        });
      }
    },

    duplicateSession: async (id: string) => {
    // Never fork mid-turn: the copy would be a snapshot of a reply that is
    // still being written.
    if (get().sending && get().sessionId === id) return false;
    const store = await storeOf(ctx);
    if (!store) return false;
    // The draft belongs to the source conversation; persist it before the
    // pointer moves or it would land on the copy.
    await quiet(get().persistDraft());
    let copyId: string | null = null;
    try {
      copyId = await store.duplicateSession(id);
    } catch {
      return false;
    }
    if (copyId === null) return false;
    // Deliberately no bail on a failed read: the port has already moved
    // the store's active pointer, so returning false here would leave the
    // store and Zustand disagreeing. Adopting the copy with no text yet is
    // recoverable; a desync is not.
    const turns = (await store.get(copyId).catch(() => null)) ?? [];
    // The store already pointed at the copy; adopt its text here.
    set({
      sessionId: copyId,
      messages: toMessages(turns),
      draft: await readDraftFor(ctx, copyId),
      sending: false,
      turnStartedAt: null,
      chatWarning: null,
    });
    await quiet(get().refreshSessions());
    return true;
  },

  renameSession: (id: string, title: string) => patchSession(id, { title }),

  setPinned: (id: string, pinned: boolean) => patchSession(id, { pinned }),

    // G10: read conversations back from our own JSON export. The file is
    // untrusted, so validation happens BEFORE anything is written and a
    // rejected file leaves the store untouched.
    importSessions: async (raw: string) => {
      const parsed = parseImport(raw);
      if (!parsed.ok) {
        return { ok: false, imported: 0, skipped: 0, error: parsed.error };
      }
      const store = await storeOf(ctx);
      if (!store) {
        return { ok: false, imported: 0, skipped: 0, error: "Storage isn't ready." };
      }
      let imported = 0;
      for (const s of parsed.sessions) {
        // A fresh id per session, and `append` is called WITHOUT an id, so
        // the store mints fresh row ids. Importing the file's own ids
        // would make a second import of the same backup collide with the
        // first and overwrite it.
        const id = await store.create();
        await quiet(store.renameSession(id, s.title));
        await quiet(store.setSessionPinned(id, s.pinned));
        for (const turn of s.turns) await quiet(store.append(id, turn));
        imported += 1;
      }
      await quiet(get().refreshSessions());
      return { ok: true, imported, skipped: parsed.skipped };
    },
  };
}
