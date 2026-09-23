/** Drafts slice: one composer draft per session, persisted on switch.
 *
 * Writes happen on lifecycle edges (switch, new, send, explicit persist)
 * — never per keystroke. A kill mid-typing loses the tail; history (the
 * Wave-1 guarantee) is unaffected.
 */

import { draftKey } from "../../lib/chat/drafts.ts";
import type { ChatCtx, ChatGet, ChatSet, ChatState } from "./types.ts";

/** Best-effort storage read for the given session ("" when absent). */
export async function readDraftFor(
  ctx: ChatCtx,
  sessionId: string | null,
): Promise<string> {
  try {
    return (await ctx.storage.getItem(draftKey(sessionId))) ?? "";
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
        await ctx.storage.setItem(draftKey(get().sessionId), get().draft);
      } catch {
        // Non-critical: the in-memory draft still survives the switch.
      }
    },
  };
}
