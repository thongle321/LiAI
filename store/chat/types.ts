/** Chat store shared types: state, deps, and slice plumbing. */

import type { StoreApi } from "zustand";

import type { SearchAuth } from "../../types/api.ts";
import type { EngineSource } from "../../lib/inference/engine.ts";
import type { SessionStore } from "../../lib/chat/session-store.ts";
import type { ImportResult } from "../../lib/chat/import.ts";
import type { AgentStep, ChatMessage, ChatSession, TurnOutcomeFlags } from "../../types/chat.ts";

export type Connection = "unknown" | "up" | "down";

export type ChatSet = StoreApi<ChatState>["setState"];
export type ChatGet = StoreApi<ChatState>["getState"];

export interface TurnPaths {
  sessionId: string | null;
  /** Photos for this turn, as data-uris (G8: up to MAX_IMAGES). */
  images?: string[];
  /** Current bubbles for agent context (user/assistant texts). */
  history: ChatMessage[];
  /** Re-answer: skip the user append (question already stored). */
  retry?: boolean;
  /** Row id for the user turn the slice is about to show. Minted BEFORE
   *  the bubble exists so the bubble and the persisted row are one id —
   *  there is no window where a bubble exists but has no address. */
  userMessageId?: string;
  /** Row id for the assistant turn. On regenerate this is the EXISTING
   *  bubble's id, so the rerun overwrites that row instead of appending
   *  a second one. */
  assistantMessageId?: string;
}

export interface TurnRunner {
  (
    text: string,
    paths: TurnPaths,
    onToken?: (text: string) => void,
    /** Cumulative reasoning so far — the bubble replaces, never appends. */
    onReasoning?: (text: string) => void,
    /** A tool call started: `toolName` is the talent id. The store's
     *  pending row shows the tool's phase for exactly this span
     *  (ticket 02). */
    onToolStart?: (toolName: string) => void,
  ): Promise<{
    reply: string;
    reasoning?: string;
    sessionId: string;
    steps: AgentStep[];
    promptTokens: number;
    completionTokens: number;
    outcome?: TurnOutcomeFlags;
  }>;
}

export interface ChatDeps {
  getStore?: () => Promise<SessionStore | null>;
  getSearchAuth?: () => Promise<SearchAuth | null>;
  getEngineSource?: () => Promise<EngineSource | null>;
  runTurn?: TurnRunner;
  /** Screen wake lock. Injected so tests need no native module. */
  keepAwake?: (on: boolean) => void;
  /** Can the active engine see images this turn? (vision-series 02).
   *  Injected so tests decide capability without the modelStore graph
   *  (its native imports cannot load under plain node). */
  multimodalAvailable?: () => Promise<boolean>;
}

/** Per-factory mutable stream tracking (never in render state). */
export interface ChatCtx {
  getStore: () => Promise<SessionStore | null>;
  getSearchAuth: () => Promise<SearchAuth | null>;
  getEngineSource: () => Promise<EngineSource | null>;
  runTurn: TurnRunner;
  /** Can the active engine see images this turn? Defaults to the real
   *  pair-probe (lib/inference/mmproj.ts); tests inject it. */
  multimodalAvailable: () => Promise<boolean>;
  /** Stop the live generation; the loaded model stays cached. */
  stopEngine: () => void;
  /** Stop and free the loaded model (Unload). Drops the engine slot. */
  releaseEngine: () => void;
  /** Hold the screen awake for the life of a turn; released on settle or
   *  on Stop. Never throws. */
  keepAwake: (on: boolean) => void;
  active: { handle: { cancel(): void } | null };
  streamGen: number;
}

/** A transient chat notice (G7). Kept deliberately small: PocketPal's
 *  ErrorState carries a stack and metadata, none of which this app has a
 *  consumer for, and carrying fields nothing reads is how a warning
 *  surface starts lying about what it knows. */
export interface ChatWarning {
  message: string;
  /** `warning`: the turn sent, degraded. `error`: it did not send. */
  severity: "warning" | "error";
  /** Offers a Retry action, as PocketPal's does for recoverable faults. */
  recoverable: boolean;
}

export interface ChatState {
  messages: ChatMessage[];
  sessionId: string | null;
  connection: Connection;
  sending: boolean;
  /** Wall clock for the running turn: set when it starts, cleared when it
   *  settles, null when nothing is running. Exists so the pending row can
   *  show elapsed time — usage lands only on settle, and three anonymous
   *  dots are indistinguishable from a frozen screen. */
  turnStartedAt: number | null;
  /** The talent whose tool call is in flight, or null. Set from the
   *  runner's onToolStart, cleared when the turn settles — the pending
   *  row names a phase only while a tool genuinely runs, never while
   *  the model is merely writing text (ticket 02). */
  pendingToolName: string | null;
  /** A transient chat notice, or null. Distinct from an errored message:
   *  an errored message means the turn FAILED, while this means it went
   *  through in a degraded state the user should know about. PocketParity
   *  G7 -- PocketPal raises these via `uiStore.setChatWarning` and shows
   *  them in an `ErrorSnackbar`; without a surface, a recoverable failure
   *  is indistinguishable from a fatal one. */
  chatWarning: ChatWarning | null;
  /** Raise (or with null, clear) the chat notice. */
  setChatWarning: (warning: ChatWarning | null) => void;
  sessions: ChatSession[];
  /** Composer draft for the active session (persisted on switch/send). */
  draft: string;
  setDraft: (text: string) => void;
  persistDraft: () => Promise<void>;
  loadSession: () => Promise<void>;
  checkHealth: () => Promise<void>;
  send: (text: string, images?: string[]) => Promise<boolean>;
  /** Stop the live reply; the partial text stays in its bubble. */
  stop: () => void;
  /** Free the loaded model from memory (Unload); the next Load reloads. */
  releaseEngine: () => void;
  retry: (messageId: string) => Promise<boolean>;
  regenerate: (messageId: string) => Promise<boolean>;
  /** The user turn being edited, or null. Not an INDEX: the store is
   *  id-keyed, so the id survives the rewrite that committing performs. */
  editingTurnId: string | null;
  /** Pull conversations back from an exported JSON backup (G10).
   *  Validated before anything is written; ids are minted fresh, never
   *  read from the file. */
  importSessions: (raw: string) => Promise<ImportResult>;
  /** Enter edit mode on a user turn and seed the composer with its text.
   *  False for an assistant turn (that is regenerate), while a turn is
   *  running, or when nothing is persisted to rewind. */
  startEdit: (messageId: string) => boolean;
  /** Leave edit mode, restoring the composer to the turn's own text. */
  cancelEdit: () => void;
  newConversation: () => Promise<void>;
  switchSession: (sessionId: string) => Promise<boolean>;
  deleteSession: (sessionId: string) => Promise<void>;
  /** Bulk path: routes every id through deleteSession, so the mid-turn
   *  guard applies per row exactly as it does for a single delete.
   *  Resolves to the number actually deleted — rows the guard kept make
   *  it less than ids.length, so the UI's confirmed count can be
   *  reconciled instead of silently lying. */
  deleteSessions: (sessionIds: string[]) => Promise<number>;
  /** Fork a conversation and adopt the copy. False when it could not be
   *  forked, or when the source is mid-turn. */
  duplicateSession: (sessionId: string) => Promise<boolean>;
  renameSession: (sessionId: string, title: string) => Promise<boolean>;
  setPinned: (sessionId: string, pinned: boolean) => Promise<boolean>;
  /** True when the drawer now matches the store; false keeps stale UI. */
  refreshSessions: () => Promise<boolean>;
}
