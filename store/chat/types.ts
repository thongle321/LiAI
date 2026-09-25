/** Chat store shared types: state, deps, and slice plumbing. */

import type { StoreApi } from "zustand";

import type { SearchAuth } from "../../types/api.ts";
import type { EngineSource } from "../../lib/inference/engine.ts";
import type { SessionStore } from "../../lib/chat/supabase-store.ts";
import type { KeyValueStorage } from "../../lib/storage.ts";
import type { AgentStep, ChatMessage, ChatSession } from "../../types/chat.ts";

export type Connection = "unknown" | "up" | "down";

/** Active-session key. The legacy on-device history index is removed on
 * load — Supabase owns sessions now (ADR-0010). */
export const SESSION_KEY = "liai_session_id";
export const HISTORY_KEY = "liai_history_v1";

export type ChatSet = StoreApi<ChatState>["setState"];
export type ChatGet = StoreApi<ChatState>["getState"];

export interface TurnPaths {
  sessionId: string | null;
  image?: string;
  /** Current bubbles for agent context (user/assistant texts). */
  history: ChatMessage[];
  /** Re-answer: skip the user append (question already stored). */
  retry?: boolean;
}

export interface TurnRunner {
  (
    text: string,
    paths: TurnPaths,
    onToken?: (text: string) => void,
  ): Promise<{
    reply: string;
    sessionId: string;
    steps: AgentStep[];
    promptTokens: number;
    completionTokens: number;
  }>;
}

export interface ChatDeps {
  getStore?: () => Promise<SessionStore | null>;
  getSearchAuth?: () => Promise<SearchAuth | null>;
  getEngineSource?: () => Promise<EngineSource | null>;
  runTurn?: TurnRunner;
}

/** Per-factory mutable stream tracking (never in render state). */
export interface ChatCtx {
  storage: KeyValueStorage;
  getStore: () => Promise<SessionStore | null>;
  getSearchAuth: () => Promise<SearchAuth | null>;
  getEngineSource: () => Promise<EngineSource | null>;
  runTurn: TurnRunner;
  active: { handle: { cancel(): void } | null };
  streamGen: number;
}

export interface ChatState {
  messages: ChatMessage[];
  sessionId: string | null;
  connection: Connection;
  sending: boolean;
  sessions: ChatSession[];
  /** Composer draft for the active session (persisted on switch/send). */
  draft: string;
  setDraft: (text: string) => void;
  persistDraft: () => Promise<void>;
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
}
