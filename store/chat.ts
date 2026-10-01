/** Public entry for the chat store.
 *
 * The implementation lives in `./chat/` slices; this path stays stable so
 * existing imports (`../store/chat`) keep working.
 */

export {
  createChatStore,
  useChatStore,
  // The Generation settings sheet needs one field of the session store; it
  // is exported rather than put on ChatState so the public state surface
  // stays about chat, not persistence.
  defaultGetStore,
} from "./chat/index.ts";
export type { ChatDeps, ChatState, ChatCtx, Connection } from "./chat/index.ts";
export type { ChatMessage, ChatSession } from "../types/chat.ts";
