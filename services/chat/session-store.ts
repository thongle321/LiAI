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
  TurnBlock,
  TurnOutcomeFlags,
} from "@/types/chat.ts";
import type { SamplerParams } from "../inference/sampler.ts";
import type { EffortLevel } from "@/utils/reasoning-capability.ts";

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
  /** How the turn ENDED. Persisted so a reloaded conversation still knows
   *  why a reply looks truncated — the G1 context banner and the G4 footer
   *  both read this, and neither can work off live state alone. */
  outcome?: TurnOutcomeFlags;
  /** Ordered blocks for the reply, when the turn was written with them.
   * Stored as a JSON column; old rows read through the blocksOf splitter. */
  blocks?: TurnBlock[];
}

/** A stored turn AS READ BACK, carrying the row id it was persisted under.
 *
 *  Split from `StoredTurn` deliberately: `append` takes the write shape
 *  (no id, because the store mints one) and `get` returns the read shape
 *  (id always present). One type with `id?: string` would compile for
 *  callers that omit the id and then silently produce a message that
 *  cannot be addressed by regenerate / edit / delete — the exact bug the
 *  split exists to prevent. */
export interface StoredMessage extends StoredTurn {
  id: string;
}

/** Row key for a session's composer draft. A conversation that has not
 *  been sent yet has no session id, so it gets a fixed slot of its own.
 *  Exported so the fake resolves the slot by the same rule as the store
 *  rather than re-implementing it. */
export function draftSlot(sessionId: string | null): string {
  return sessionId ?? "new";
}

/** One conversation's own settings override — the 'custom' layer of the
 *  session → companion → global chain. Every field optional: a field the user
 *  never touched stays absent so the layer below reaches it. */
export interface SessionOverride {
  sampler?: Partial<SamplerParams>;
  thinking?: boolean;
  effort?: EffortLevel;
}

/** Catalog of conversations: listing, minting, renaming, pinning, deleting,
 *  duplicating, and titling. */
export interface SessionCatalog {
  /** Mint a session and return its id. */
  create(): Promise<string>;
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
  /** Fork a conversation. Null when the source does not exist. */
  duplicateSession(sessionId: string): Promise<string | null>;
}

/** Reading and writing a conversation's turns. */
export interface TurnWriter {
  /** Turns in call order, or null when the session does not exist. */
  get(sessionId: string): Promise<StoredMessage[] | null>;
  /** Append one turn, creating the session row if it is not there yet. */
  append(sessionId: string, turn: StoredTurn, id?: string): Promise<void>;
  /** Drop the trailing assistant turn, for regenerate. */
  popLastAssistant(sessionId: string): Promise<boolean>;
  /** Drop the turn with `messageId` and everything after it. */
  truncateFrom(sessionId: string, messageId: string): Promise<boolean>;
}

/** Composer drafts. `null` is the slot for a conversation not yet sent. */
export interface DraftStore {
  getDraft(sessionId: string | null): Promise<string>;
  setDraft(sessionId: string | null, text: string): Promise<void>;
  clearDraft(sessionId: string | null): Promise<void>;
}

/** Per-conversation companion binding and settings override layer. */
export interface SessionSettings {
  getActiveSessionId(): Promise<string | null>;
  setActiveSessionId(sessionId: string | null): Promise<void>;
  getSessionCompanion(sessionId: string): Promise<string | null>;
  setSessionCompanion(sessionId: string, companionId: string | null): Promise<boolean>;
  getSessionSettingsSource(sessionId: string): Promise<"companion" | "custom" | null>;
  setSessionSettingsSource(
    sessionId: string,
    source: "companion" | "custom",
  ): Promise<boolean>;
  getSessionOverride(sessionId: string): Promise<SessionOverride | null>;
  setSessionOverride(
    sessionId: string,
    override: SessionOverride | null,
  ): Promise<void>;
}

/** Composite port: a full session store. Prefer depending on one of the
 *  four focused ports above when a caller only needs a slice. */
export interface SessionStore
  extends SessionCatalog,
    TurnWriter,
    DraftStore,
    SessionSettings {}
