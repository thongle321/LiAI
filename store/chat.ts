/** Public entry for the chat store.
 *
 * The implementation lives in `./chat/` slices; this path stays stable so
 * existing imports (`../store/chat`) keep working.
 */

export {
  createChatStore,
  useChatStore,
} from "./chat/index.ts";
export type { ChatDeps, ChatState, ChatCtx, Connection } from "./chat/index.ts";
export type { ChatMessage, ChatSession } from "../types/chat.ts";
