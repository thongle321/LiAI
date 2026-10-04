/** Chat persistence port (ADR-0012).
 *
 * The app talks to this interface and never to TinyBase directly. It
 * exists as the TEST SEAM: the store slices inject a fake here, and the
 * real TinyBase implementation can be swapped without touching a screen.
 * The shape of a turn and a session belongs to types/chat.ts — restating
 * them here is how one contract ends up with two definitions.
 *
 * Deliberately local: there is no identity, no remote owner, and no user
 * id on any write. A conversation lives on exactly one device.
 */

import type {
  AgentStep,
  MessageUsage,
  SessionInfo,
} from "../../types/chat.ts";
import type { SamplerParams } from "../inference/sampler.ts";

/** One durable turn. Streaming/error are NOT here: they are live render
 * state owned by the chat store, and persisting them would resurrect a
 * stuck streaming bubble after a restart.
 *
 * The parts are the domain types, not local restatements: a turn's tool
 * calls are `AgentStep`s and its usage is `MessageUsage`, and a session
 * is a `SessionInfo`. Restating them here is how one contract ends up
 * with two definitions that drift. */
export interface StoredTurn {
  role: "user" | "assistant";
  content: string;
  /** Message kind, defaulting to text. */
  type?: string;
  /** Display timestamp (ms). */
  at?: number;
  /** Parsed reasoning behind an assistant reply (Q7=B). */
  reasoning?: string;
  usage?: MessageUsage;
  /** Tool calls behind this reply, in call order (`position` orders them:
   * the child table is an unordered map). */
  steps?: AgentStep[];
}

/** Row key for a session's composer draft. A conversation that has not
 *  been sent yet has no session id, so it gets a fixed slot of its own.
 *  Exported so the fake resolves the slot by the same rule as the store
 *  rather than re-implementing it. */
export function draftSlot(sessionId: string | null): string {
  return sessionId ?? "new";
}

export interface SessionStore {
  /** Mint a session and return its id. */
  create(): Promise<string>;
  /** Turns in call order, or null when the session does not exist. */
  get(sessionId: string): Promise<StoredTurn[] | null>;
  /** Append one turn, creating the session row if it is not there yet. */
  append(sessionId: string, turn: StoredTurn): Promise<void>;
  /** Every session, pinned first, then most recently updated. */
  listSessions(): Promise<SessionInfo[]>;
  /** False when the session does not exist. */
  renameSession(sessionId: string, title: string): Promise<boolean>;
  /** False when the session does not exist. */
  setSessionPinned(sessionId: string, pinned: boolean): Promise<boolean>;
  /** False when the session does not exist. */
  deleteSession(sessionId: string): Promise<boolean>;
  /** Title the session only while it is still empty (first turn wins). */
  setTitleIfEmpty(sessionId: string, title: string): Promise<void>;
  /** Drop the trailing assistant turn, for regenerate. False when the
   *  last turn is not an assistant turn. */
  popLastAssistant(sessionId: string): Promise<boolean>;
  /** Drop the turn at `turnIndex` and everything after it, cascading to
   *  those turns' tool calls. This is what edit-and-resend and
   *  regenerate-from-the-middle need: re-running anything but the last
   *  turn is meaningless unless the branch it sits on can be deleted.
   *
   *  `turnIndex` is the index into `get()`'s call order, so the caller
   *  cannot drift from the store's own ordering. False when the session
   *  does not exist or the index is out of range — an out-of-range index
   *  drops nothing rather than guessing.
   *
   *  Deliberately additive: `popLastAssistant` stays for the last-turn
   *  regenerate, which is cheaper and keeps its boolean contract. */
  truncateFrom(sessionId: string, turnIndex: number): Promise<boolean>;
  /** Composer draft for a session, or "" when there is none. `null` is
   *  the slot for a conversation that has not been sent yet. */
  getDraft(sessionId: string | null): Promise<string>;
  setDraft(sessionId: string | null, text: string): Promise<void>;
  clearDraft(sessionId: string | null): Promise<void>;
  /** Which conversation is open, or null. */
  getActiveSessionId(): Promise<string | null>;
  setActiveSessionId(sessionId: string | null): Promise<void>;
  /** Sampling override for one conversation, or null when it follows the
   *  global preset. Partial on purpose: only the fields the session actually
   *  changed are stored, so a new global default still reaches it. */
  getSessionSampler(sessionId: string): Promise<Partial<SamplerParams> | null>;
  setSessionSampler(
    sessionId: string,
    override: Partial<SamplerParams> | null,
  ): Promise<void>;
  /** Fork a conversation: its turns, its tool calls, and its sampler
   *  override. Titled "<title> - Copy", becomes the active conversation,
   *  and is never pinned. Null when the source does not exist.
   *
   *  The override travels with the copy on purpose: it is per
   *  conversation, so a fork that dropped it would silently revert to the
   *  preset — noticed only after trusting the fork. */
  duplicateSession(sessionId: string): Promise<string | null>;
}
