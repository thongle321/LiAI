/** Drafts slice: one composer draft per session, persisted on switch.
 *
 * Writes happen on lifecycle edges (switch, new, send, explicit persist)
 * — never per keystroke. A kill mid-typing loses the tail; history is
 * unaffected. Drafts live in the local Store (ADR-0012), one row per
 * session, with a fixed slot for a conversation not yet sent.
 */

import type { SessionStore } from "../../lib/chat/session-store.ts";
import type { ChatCtx, ChatGet, ChatSet, ChatState } from "./types.ts";

/** Store for the given session ("" when absent). A store that cannot be
 *  reached yields an empty draft rather than failing the screen. */
export async function readDraftFor(
  ctx: ChatCtx,
  sessionId: string | null,
): Promise<string> {
  try {
    const store: SessionStore | null = await ctx.getStore();
    if (!store) return "";
    return await store.getDraft(sessionId);
  } catch {
    return "";
  }
}

export function createDraftSlice(
  set: ChatSet,
  get: ChatGet,
  ctx: ChatCtx,
): Pick<ChatState, "draft" | "setDraft" | "persistDraft"> {
  return {
    draft: "",

    setDraft: (text: string) => {
      set({ draft: text });
    },

    persistDraft: async () => {
      try {
        const store: SessionStore | null = await ctx.getStore();
        await store?.setDraft(get().sessionId, get().draft);
      } catch {
        // Non-critical: the in-memory draft still survives the switch.
      }
    },
  };
}
