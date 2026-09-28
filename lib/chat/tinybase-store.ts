/** TinyBase-backed session store (ADR-0012).
 *
 * Pure Store operations with no native import, so the whole data layer
 * runs under `node --test` against a bare `createStore()`. The SQLite
 * persister is wired separately in lib/tinybase.ts (device only) — that
 * split is why this file takes a Store in its constructor instead of
 * creating one.
 *
 * Store shape (TinyBase 10's Store is not generic; cells arrive as
 * AnyObject, so every read goes through a narrowing helper below and the
 * typed contract lives on the SessionStore port):
 *   sessions  { title, pinned, updatedAt }
 *   messages  { sessionId, role, content, type, at, seq, usage* }
 *   toolRuns  { messageId, position, tool, input?, result? }
 *   drafts    { text }
 *   Values    { activeSessionId, seq }
 *
 * ponytail: messages are UNBOUNDED. The 100-turn cap this replaces
 * existed to stop a remote Postgres table bloating; a local cap would
 * silently delete chat history, so device storage is the only ceiling.
 * Add a cap if storage pressure ever shows up on real devices.
 */

import { createStore, type Store } from "tinybase";

import type { AgentStep, SessionInfo } from "../../types/chat.ts";
import type { SessionStore, StoredTurn } from "./session-store.ts";
import { draftSlot } from "./session-store.ts";
import { DEFAULT_SAMPLER, type SamplerParams } from "../inference/sampler.ts";
import { newId } from "./messages.ts";

/** Row id: the timestamp prefix keeps ids unique across restarts, the
 *  counter keeps them ordered inside one millisecond. Named apart from
 *  messages.ts's newId(), which mints a bubble id — same words, opposite
 *  job. */
function rowId(seq: number): string {
  return `${Date.now().toString(36)}-${seq.toString(36)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** A stored message row. `seq` — not the timestamp — is the ordering
 * key: two appends can land in the same millisecond. */
interface MessageRow {
  sessionId: string;
  role: string;
  content: string;
  type: string;
  at: number;
  seq: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

function messageRowFrom(raw: unknown): MessageRow | null {
  if (!isRecord(raw) || typeof raw["sessionId"] !== "string") return null;
  const usage = (key: "promptTokens" | "completionTokens" | "totalTokens") => {
    const value = raw[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  };
  return {
    sessionId: raw["sessionId"],
    role: raw["role"] === "assistant" ? "assistant" : "user",
    content: str(raw["content"]),
    type: str(raw["type"], "text"),
    at: num(raw["at"]),
    seq: num(raw["seq"]),
    promptTokens: usage("promptTokens"),
    completionTokens: usage("completionTokens"),
    totalTokens: usage("totalTokens"),
  };
}

export function createChatStore(): Store {
  return createStore();
}

export class TinyBaseSessionStore implements SessionStore {
  private readonly store: Store;

  constructor(store: Store) {
    this.store = store;
  }

  /** Monotonic counter for row ids and message ordering. */
  private nextSeq(): number {
    const seq = num(this.store.getValue("seq")) + 1;
    this.store.setValue("seq", seq);
    return seq;
  }

  private touch(sessionId: string): void {
    // Two orderings, two numbers: `updatedAt` is a wall clock for the
    // drawer to display, `seq` is a monotonic counter for the drawer to
    // SORT by. A single timestamp cannot do both — two sessions touched
    // in the same millisecond would order arbitrarily, and a clock that
    // jumps backward would reorder history.
    this.store.setCell("sessions", sessionId, "updatedAt", Date.now());
    this.store.setCell("sessions", sessionId, "seq", this.nextSeq());
  }

  async create(): Promise<string> {
    const seq = this.nextSeq();
    const id = rowId(seq);
    this.newSessionRow(id, "");
    return id;
  }

  /** A fresh session row. One place, so `create`, `append` and
   *  `setTitleIfEmpty` cannot drift on what a new session looks like. */
  private newSessionRow(id: string, title: string): void {
    this.store.setRow("sessions", id, {
      title,
      pinned: false,
      updatedAt: Date.now(),
      seq: this.nextSeq(),
    });
  }

  async get(sessionId: string): Promise<StoredTurn[] | null> {
    if (!this.store.hasRow("sessions", sessionId)) return null;
    return this.rowsOf(sessionId)
      .sort((a, b) => a.row.seq - b.row.seq)
      .map((entry) => this.toTurn(entry.id, entry.row));
  }

  /** One pass over the table, keeping each row's id with it. */
  private rowsOf(sessionId: string): { id: string; row: MessageRow }[] {
    const out: { id: string; row: MessageRow }[] = [];
    for (const [id, raw] of Object.entries(this.store.getTable("messages"))) {
      const row = messageRowFrom(raw);
      if (row !== null && row.sessionId === sessionId) out.push({ id, row });
    }
    return out;
  }

  async append(sessionId: string, turn: StoredTurn): Promise<void> {
    if (!this.store.hasRow("sessions", sessionId)) {
      this.newSessionRow(sessionId, "");
    }
    const seq = this.nextSeq();
    const id = rowId(seq);
    this.store.setRow("messages", id, {
      sessionId,
      role: turn.role,
      content: turn.content,
      type: turn.type ?? "text",
      at: turn.at ?? Date.now(),
      seq,
      ...(turn.usage !== undefined
        ? {
            promptTokens: turn.usage.promptTokens,
            completionTokens: turn.usage.completionTokens,
            totalTokens: turn.usage.totalTokens,
          }
        : {}),
    });
    for (const step of turn.steps ?? []) {
      this.store.setRow("toolRuns", step.id, {
        messageId: id,
        position: step.position,
        tool: step.tool,
        ...(step.input !== undefined ? { input: step.input } : {}),
        ...(step.result !== undefined ? { result: step.result } : {}),
      });
    }
    this.touch(sessionId);
  }

  /** Row -> turn, reattaching the turn's tool calls in call order. */
  private toTurn(messageId: string, row: MessageRow): StoredTurn {
    const steps = this.stepsFor(messageId);
    return {
      role: row.role === "assistant" ? "assistant" : "user",
      content: row.content,
      type: row.type,
      at: row.at,
      ...(row.promptTokens !== undefined &&
      row.completionTokens !== undefined &&
      row.totalTokens !== undefined
        ? {
            usage: {
              promptTokens: row.promptTokens,
              completionTokens: row.completionTokens,
              totalTokens: row.totalTokens,
            },
          }
        : {}),
      ...(steps.length > 0 ? { steps } : {}),
    };
  }

  /** Tool calls for a message, ordered by `position` — the child table
   * itself is unordered, so this column is the only thing that restores
   * call order. */
  private stepsFor(messageId: string): AgentStep[] {
    const steps: AgentStep[] = [];
    for (const [id, raw] of Object.entries(this.store.getTable("toolRuns"))) {
      if (!isRecord(raw) || raw["messageId"] !== messageId) continue;
      steps.push({
        id,
        tool: str(raw["tool"]),
        position: num(raw["position"]),
        ...(isRecord(raw["input"]) ? { input: raw["input"] } : {}),
        ...(typeof raw["result"] === "string" ? { result: raw["result"] } : {}),
      });
    }
    return steps.sort((a, b) => a.position - b.position);
  }

  async listSessions(): Promise<SessionInfo[]> {
    return Object.entries(this.store.getTable("sessions"))
      .map(([id, raw]) => ({
        id,
        title: isRecord(raw) ? str(raw["title"]) : "",
        pinned: isRecord(raw) && raw["pinned"] === true,
        updatedAt: isRecord(raw) ? num(raw["updatedAt"]) : 0,
        seq: isRecord(raw) ? num(raw["seq"]) : 0,
      }))
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.seq - a.seq;
      })
      .map(({ id, title, pinned, updatedAt }) => ({ id, title, pinned, updatedAt }));
  }

  async renameSession(sessionId: string, title: string): Promise<boolean> {
    if (!this.store.hasRow("sessions", sessionId)) return false;
    this.store.setCell("sessions", sessionId, "title", title);
    this.touch(sessionId);
    return true;
  }

  async setSessionPinned(sessionId: string, pinned: boolean): Promise<boolean> {
    if (!this.store.hasRow("sessions", sessionId)) return false;
    this.store.setCell("sessions", sessionId, "pinned", pinned);
    this.touch(sessionId);
    return true;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    if (!this.store.hasRow("sessions", sessionId)) return false;
    // Tool calls are keyed independently of their message, so they are
    // collected first: deleting the message rows would orphan them.
    for (const entry of this.rowsOf(sessionId)) {
      this.deleteStepsOf(entry.id);
      this.store.delRow("messages", entry.id);
    }
    this.store.delRow("sessions", sessionId);
    // A deleted conversation's draft, its sampler override and the pointer
    // to it are its data too: leaving them behind would strand a draft and
    // a tuning for a session that can never be reopened, and leave the app
    // pointing at nothing.
    await this.clearDraft(sessionId);
    await this.setSessionSampler(sessionId, null);
    if ((await this.getActiveSessionId()) === sessionId) {
      await this.setActiveSessionId(null);
    }
    return true;
  }

  async setTitleIfEmpty(sessionId: string, title: string): Promise<void> {
    // No mint-if-absent: a session row always exists before this is
    // called (append creates it), so creating one here would only
    // materialise a phantom conversation for an id that never existed.
    if (!this.store.hasRow("sessions", sessionId)) return;
    const current = str(this.store.getCell("sessions", sessionId, "title"));
    if (current !== "") return;
    this.store.setCell("sessions", sessionId, "title", title);
  }

  async popLastAssistant(sessionId: string): Promise<boolean> {
    const last = this.rowsOf(sessionId).sort((a, b) => a.row.seq - b.row.seq).pop();
    if (last === undefined || last.row.role !== "assistant") return false;
    this.deleteStepsOf(last.id);
    this.store.delRow("messages", last.id);
    return true;
  }

  private deleteStepsOf(messageId: string): void {
    for (const [id, raw] of Object.entries(this.store.getTable("toolRuns"))) {
      if (isRecord(raw) && raw["messageId"] === messageId) {
        this.store.delRow("toolRuns", id);
      }
    }
  }

  async getDraft(sessionId: string | null): Promise<string> {
    return str(this.store.getCell("drafts", draftSlot(sessionId), "text"));
  }

  async setDraft(sessionId: string | null, text: string): Promise<void> {
    const row = draftSlot(sessionId);
    // No row for an empty draft: an absent draft and an empty one mean
    // the same thing, and one of the two should not exist.
    if (text === "") this.store.delRow("drafts", row);
    else this.store.setCell("drafts", row, "text", text);
  }

  async clearDraft(sessionId: string | null): Promise<void> {
    this.store.delRow("drafts", draftSlot(sessionId));
  }

  async duplicateSession(sessionId: string): Promise<string | null> {
    if (!this.store.hasRow("sessions", sessionId)) return null;
    const turns = (await this.get(sessionId)) ?? [];
    const sampler = await this.getSessionSampler(sessionId);
    const seq = this.nextSeq();
    const copyId = rowId(seq);
    const title = str(this.store.getCell("sessions", sessionId, "title"));
    // New row, so append below cannot re-title it.
    this.newSessionRow(copyId, `${title} - Copy`);
    for (const turn of turns) {
      // Fresh step ids, and this is load-bearing: toolRuns is keyed by
      // step id, so appending the source's ids verbatim made every copied
      // step overwrite the SOURCE's row with the copy's messageId. The
      // fork looked perfect and the original lost every tool call.
      const forked: StoredTurn = turn.steps
        ? { ...turn, steps: turn.steps.map((s) => ({ ...s, id: newId() })) }
        : turn;
      await this.append(copyId, forked);
    }
    if (sampler) await this.setSessionSampler(copyId, sampler);
    // The fork is where you are going next; the drawer should show it.
    await this.setActiveSessionId(copyId);
    return copyId;
  }

  async getSessionSampler(sessionId: string): Promise<Partial<SamplerParams> | null> {
    const raw = this.store.getCell("sessionSampler", sessionId, "values");
    if (typeof raw !== "string" || raw === "") return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!isRecord(parsed)) return null;
    // Only finite numbers count as an override: a half-written save
    // degrades to "this session follows the global preset" rather than
    // pinning a value the user cannot see.
    const out: Record<string, number> = {};
    for (const key of Object.keys(DEFAULT_SAMPLER)) {
      const v = parsed[key];
      if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
    }
    return Object.keys(out).length > 0 ? (out as Partial<SamplerParams>) : null;
  }

  async setSessionSampler(
    sessionId: string,
    override: Partial<SamplerParams> | null,
  ): Promise<void> {
    // An empty override IS "follow the global preset", so it deletes the
    // row rather than storing "{}".
    if (override === null || Object.keys(override).length === 0) {
      this.store.delRow("sessionSampler", sessionId);
      return;
    }
    this.store.setCell("sessionSampler", sessionId, "values", JSON.stringify(override));
  }

  async getActiveSessionId(): Promise<string | null> {
    const value = this.store.getValue("activeSessionId");
    return typeof value === "string" ? value : null;
  }

  async setActiveSessionId(sessionId: string | null): Promise<void> {
    if (sessionId === null) this.store.delValue("activeSessionId");
    else this.store.setValue("activeSessionId", sessionId);
  }
}
