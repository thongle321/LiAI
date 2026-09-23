/** Chat store shared types: state, deps, and slice plumbing. */

import type { StoreApi } from "zustand";

import type { KeyValueStorage } from "../../lib/storage.ts";
import type { MinimalXhr } from "../../lib/chat/api.ts";
import type { ChatMessage, ChatSession } from "../../types/chat.ts";

export type Connection = "unknown" | "up" | "down";

/** Active-session key. The legacy on-device history index is removed on
 * load — the backend owns sessions now (ADR-005). */
export const SESSION_KEY = "liai_session_id";
export const HISTORY_KEY = "liai_history_v1";

export type ChatSet = StoreApi<ChatState>["setState"];
export type ChatGet = StoreApi<ChatState>["getState"];

export interface ChatDeps {
  openXhr?: () => MinimalXhr;
}

/** Per-factory mutable stream tracking (never in render state). */
export interface ChatCtx {
  storage: KeyValueStorage;
  openXhr?: () => MinimalXhr;
  active: { handle: { cancel(): void } | null };
  streamGen: number;
}

export interface ChatState {
  messages: ChatMessage[];
  sessionId: string | null;
  connection: Connection;
  sending: boolean;
  sessions: ChatSession[];
  loadSession: () => Promise<void>;
  checkHealth: () => Promise<void>;
  send: (text: string, image?: string) => Promise<boolean>;
  retry: (messageId: string) => Promise<boolean>;
  regenerate: (messageId: string) => Promise<boolean>;
  newConversation: () => Promise<void>;
  switchSession: (sessionId: string) => Promise<boolean>;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<boolean>;
  setPinned: (sessionId: string, pinned: boolean) => Promise<boolean>;
  refreshSessions: () => Promise<void>;
  recordVisionTurn: (
    question: string,
    answer: string,
    sessionId?: string,
    image?: string,
  ) => Promise<void>;
}
