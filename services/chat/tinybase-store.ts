/** TinyBase-backed session store (ADR-0012).
 *
 * Pure Store operations with no native import, so the whole data layer
 * runs under `jest` against a bare `createStore()`. The SQLite
 * persister is wired separately in services/chat/tinybase.ts (device only) — that
 * split is why this file takes a Store in its constructor instead of
 * creating one.
 *
 * Store shape (TinyBase 10's Store is not generic; cells arrive as
 * AnyObject, so every read goes through a narrowing helper below and the
 * typed contract lives on the SessionStore port):
 *   sessions  { title, pinned, updatedAt }
 *   messages  { sessionId, role, content, type, at, seq, usage* }
 *   toolRuns  { messageId, position, tool, input?, result?, ok?, data?,
 *               metrics? }
 *   drafts    { text }
 *   Values    { activeSessionId, seq }
 *
 * ponytail: messages are UNBOUNDED. The 100-turn cap this replaces
 * existed to stop a remote Postgres table bloating; a local cap would
 * silently delete chat history, so device storage is the only ceiling.
 * Add a cap if storage pressure ever shows up on real devices.
 */

import { createStore, type Store } from "tinybase";

import type { AgentStep, SessionInfo, TurnBlock } from "@/types/chat.ts";
import type {
  SessionStore,
  StoredMessage,
  StoredTurn,
} from "./session-store.ts";
import { draftSlot } from "./session-store.ts";
import { sanitizeBlocks } from "./blocks.ts";
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
  reasoning?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** How the turn ended. TinyBase has one column space per table, so the
   *  flags and timings are FLAT siblings, exactly as `usage` already is —
   *  not a nested object. */
  contextFull?: boolean;
  interrupted?: boolean;
  stoppedEarly?: boolean;
  /** Ordered blocks, stored as a JSON cell — the same JSON-object column
   * shape `metrics` uses on toolRuns. One column, no schema migration. */
  blocks?: TurnBlock[];
  promptMs?: number;
  tokensPerSecond?: number;
  msPerToken?: number;
  /** Flat sibling of the other timings -- TinyBase has no nested cell.
   *  Absent on rows written before the field existed. */
  promptTokensPerSecond?: number;
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
    ...(typeof raw["reasoning"] === "string" && raw["reasoning"] !== ""
      ? { reasoning: raw["reasoning"] }
      : {}),
    promptTokens: usage("promptTokens"),
    completionTokens: usage("completionTokens"),
    totalTokens: usage("totalTokens"),
    ...(raw["contextFull"] === true ? { contextFull: true } : {}),
    ...(raw["interrupted"] === true ? { interrupted: true } : {}),
    ...(raw["stoppedEarly"] === true ? { stoppedEarly: true } : {}),
    // Malformed cells degrade to "no blocks" and the turn reads through
    // the splitter on load — never a crash in the renderer.
    ...(sanitizeBlocks(raw["blocks"]) !== undefined
      ? { blocks: sanitizeBlocks(raw["blocks"]) }
      : {}),
    ...(typeof raw["promptMs"] === "number"
      ? {
          promptMs: raw["promptMs"],
          tokensPerSecond: num(raw["tokensPerSecond"]),
          msPerToken: num(raw["msPerToken"]),
          ...(typeof raw["promptTokensPerSecond"] === "number"
            ? { promptTokensPerSecond: raw["promptTokensPerSecond"] }
            : {}),
        }
      : {}),
  };
}

export function createChatStore(): Store {
  return createStore();
}

export class TinyBaseSessionStore implements SessionStore {
  private readonly store: Store;

  /** Hydrated transcripts, served on re-open without re-reading (C17).
   *
   *  THE STALENESS CONTRACT, and the whole of it: the port is the only
   *  writer (ADR-0012), so every method that mutates turn bodies clears
   *  its session's entry BEFORE writing — append, popLastAssistant,
   *  truncateFrom, deleteSession — unconditionally, even on refusal
   *  paths. Clearing costs one re-read; a MISSED clear costs a
   *  conversation that looks lost. The persister restores the tables
   *  BEFORE this instance exists (services/chat/tinybase.ts awaits
   *  startAutoPersisting first), so an entry can never predate the
   *  data it would serve.
   *
   *  ponytail: unbounded — an entry lives until its session is next
   *  written or deleted. Realistic open-session counts are small; add
   *  an LRU only if memory ever shows up in a profile. */
  private readonly hydrated = new Map<string, StoredMessage[]>();

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

  async get(sessionId: string): Promise<StoredMessage[] | null> {
    if (!this.store.hasRow("sessions", sessionId)) {
      this.hydrated.delete(sessionId);
      return null;
    }
    // C17: hydrate once — the first open reads, later re-opens are
    // served from memory.
    let turns = this.hydrated.get(sessionId);
    if (turns === undefined) {
      // ONE pass over toolRuns for the WHOLE session (audit finding 7):
      // the old path scanned the full table once per message —
      // O(messages × toolRuns) — which froze the UI on a large imported
      // history (the import cap alone allows 10k turns).
      const index = this.stepsIndex();
      turns = this.rowsOf(sessionId)
        .sort((a, b) => a.row.seq - b.row.seq)
        .map((entry) => this.toTurn(entry.id, entry.row, index.get(entry.id) ?? []));
      this.hydrated.set(sessionId, turns);
    }
    // A fresh array per caller: the cached one must never be sorted or
    // pushed on by a reader.
    return [...turns];
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

  async append(sessionId: string, turn: StoredTurn, id?: string): Promise<void> {
    // C17: invalidate first — see the `hydrated` contract.
    this.hydrated.delete(sessionId);
    if (!this.store.hasRow("sessions", sessionId)) {
      this.newSessionRow(sessionId, "");
    }
    const seq = this.nextSeq();
    // The caller's id wins: the chat slice mints it before the bubble
    // exists so a bubble's id and its row id are one string. Fall back to
    // a fresh one for any caller that has no id to offer.
    const rowKey = id ?? newId();
    this.store.setRow("messages", rowKey, {
      sessionId,
      role: turn.role,
      content: turn.content,
      type: turn.type ?? "text",
      at: turn.at ?? Date.now(),
      seq,
      ...(turn.reasoning !== undefined ? { reasoning: turn.reasoning } : {}),
      ...(turn.blocks !== undefined ? { blocks: turn.blocks } : {}),
      ...(turn.usage !== undefined
        ? {
            promptTokens: turn.usage.promptTokens,
            completionTokens: turn.usage.completionTokens,
            totalTokens: turn.usage.totalTokens,
          }
        : {}),
      // Flat, like usage: TinyBase has no nested cell.
      ...(turn.outcome?.contextFull === true ? { contextFull: true } : {}),
      ...(turn.outcome?.interrupted === true ? { interrupted: true } : {}),
    ...(turn.outcome?.stoppedEarly === true ? { stoppedEarly: true } : {}),
      ...(turn.outcome?.timings !== undefined
        ? {
            promptMs: turn.outcome.timings.promptMs,
            tokensPerSecond: turn.outcome.timings.tokensPerSecond,
            msPerToken: turn.outcome.timings.msPerToken,
            // Optional: an old turn carries no prompt throughput, and
            // writing an absent cell as 0 would invent a measurement.
            ...(turn.outcome.timings.promptTokensPerSecond !== undefined
              ? { promptTokensPerSecond: turn.outcome.timings.promptTokensPerSecond }
              : {}),
          }
        : {}),
    });
    for (const step of turn.steps ?? []) {
      this.store.setRow("toolRuns", step.id, {
        messageId: rowKey,
        position: step.position,
        tool: step.tool,
        ...(step.input !== undefined ? { input: step.input } : {}),
        ...(step.result !== undefined ? { result: step.result } : {}),
    // `ok: false` is the load-bearing value, so it is stored even when
    // false -- unlike the turn outcome flags, which drop a false. Dropping
    // it here would make every failure indistinguishable from a row
    // written before the discriminant existed.
    ...(step.ok !== undefined ? { ok: step.ok } : {}),
    ...(step.data !== undefined ? { data: step.data } : {}),
    // C15: per-call cost, a JSON object column like input/data, with its
    // two numbers normalized on the way in so a malformed step cannot
    // poison the cell. Absent stays absent — an old row reads as "no
    // metrics", which is exactly what the renderer needs to show none.
    ...(step.metrics !== undefined
      ? {
          metrics: {
            tokens: step.metrics.tokens,
            durationMs: step.metrics.durationMs,
          },
        }
      : {}),
      });
    }
    this.touch(sessionId);
  }

  /** Row -> turn, reattaching the turn's tool calls in call order.
   *  `steps` arrives pre-grouped from the ONE-pass index below. */
  private toTurn(messageId: string, row: MessageRow, steps: AgentStep[]): StoredMessage {
    return {
      // The row id travels with the turn, so callers can address it
      // later without re-deriving an index.
      id: messageId,
      role: row.role === "assistant" ? "assistant" : "user",
      content: row.content,
      type: row.type,
      at: row.at,
      ...(row.reasoning !== undefined ? { reasoning: row.reasoning } : {}),
      ...(row.blocks !== undefined ? { blocks: row.blocks } : {}),
      // Rebuilt as the nested shape the port declares, from the flat
      // columns. Omitted entirely when the engine reported nothing, so an
      // old row simply has no `outcome` key.
...(row.contextFull !== undefined || row.interrupted !== undefined
        || row.stoppedEarly !== undefined
        || row.promptMs !== undefined
        ? {
            outcome: {
              ...(row.contextFull !== undefined ? { contextFull: row.contextFull } : {}),
              ...(row.interrupted !== undefined ? { interrupted: row.interrupted } : {}),
              ...(row.stoppedEarly !== undefined ? { stoppedEarly: row.stoppedEarly } : {}),
              ...(row.promptMs !== undefined && row.promptMs !== null
                ? {
                    timings: {
                      promptMs: row.promptMs,
                      tokensPerSecond: row.tokensPerSecond ?? 0,
                      msPerToken: row.msPerToken ?? 0,
                      ...(row.promptTokensPerSecond !== undefined
                        ? { promptTokensPerSecond: row.promptTokensPerSecond }
                        : {}),
                    },
                  }
                : {}),
            },
          }
        : {}),
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

  /** Tool calls for MANY messages in ONE pass over the child table,
   * grouped by messageId (audit finding 7). The table itself is
   * unordered, so each group sorts by `position` — the column that
   * restores call order. */
  private stepsIndex(): Map<string, AgentStep[]> {
    const index = new Map<string, AgentStep[]>();
    for (const [id, raw] of Object.entries(this.store.getTable("toolRuns"))) {
      if (!isRecord(raw) || typeof raw["messageId"] !== "string") continue;
      const step: AgentStep = {
        id,
        tool: str(raw["tool"]),
        position: num(raw["position"]),
        ...(isRecord(raw["input"]) ? { input: raw["input"] } : {}),
        ...(typeof raw["result"] === "string" ? { result: raw["result"] } : {}),
    // Absent -> undefined -> UNKNOWN, which is not the same as true. A
    // row written before the column reads as "never recorded", not as
    // "succeeded", so it renders conservatively.
    ...(typeof raw["ok"] === "boolean" ? { ok: raw["ok"] } : {}),
    // Mirrors `input`: a JSON object column, read back only when it really
    // is an object, so a malformed cell cannot reach a renderer.
    ...(isRecord(raw["data"]) ? { data: raw["data"] } : {}),
    // Mirrors `data`: numbers only, or the step reads as having no
    // metrics at all (C15).
    ...(isRecord(raw["metrics"]) &&
    typeof raw["metrics"]["tokens"] === "number" &&
    typeof raw["metrics"]["durationMs"] === "number"
      ? {
          metrics: {
            tokens: raw["metrics"]["tokens"],
            durationMs: raw["metrics"]["durationMs"],
          },
        }
      : {}),
      };
      const list = index.get(raw["messageId"]);
      if (list) list.push(step);
      else index.set(raw["messageId"], [step]);
    }
    for (const list of index.values()) list.sort((a, b) => a.position - b.position);
    return index;
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
    // C17: invalidate first — see the `hydrated` contract.
    this.hydrated.delete(sessionId);
    if (!this.store.hasRow("sessions", sessionId)) return false;
    // Tool calls are keyed independently of their message, so they are
    // collected first: deleting the message rows would orphan them.
    // ONE pass over the child table for the WHOLE session (audit finding 7).
    const sessionRows = this.rowsOf(sessionId);
    this.deleteStepsOfMany(new Set(sessionRows.map((entry) => entry.id)));
    for (const entry of sessionRows) {
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
    // C17: invalidate first — see the `hydrated` contract.
    this.hydrated.delete(sessionId);
    const last = this.rowsOf(sessionId).sort((a, b) => a.row.seq - b.row.seq).pop();
    if (last === undefined || last.row.role !== "assistant") return false;
    this.deleteStepsOf(last.id);
    this.store.delRow("messages", last.id);
    return true;
  }

  private deleteStepsOf(messageId: string): void {
    this.deleteStepsOfMany(new Set([messageId]));
  }

  /** Drop tool rows for MANY messages in ONE pass over the table. */
  private deleteStepsOfMany(messageIds: ReadonlySet<string>): void {
    for (const [id, raw] of Object.entries(this.store.getTable("toolRuns"))) {
      if (
        isRecord(raw) &&
        typeof raw["messageId"] === "string" &&
        messageIds.has(raw["messageId"])
      ) {
        this.store.delRow("toolRuns", id);
      }
    }
  }

  async truncateFrom(sessionId: string, messageId: string): Promise<boolean> {
    // C17: invalidate first — see the `hydrated` contract.
    this.hydrated.delete(sessionId);
    if (!this.store.hasRow("sessions", sessionId)) return false;
    const ordered = this.rowsOf(sessionId).sort((a, b) => a.row.seq - b.row.seq);
    const index = ordered.findIndex((entry) => entry.id === messageId);
    // Unknown id drops nothing rather than guessing at the caller's
    // intent: a bad id is a bug to surface, not a conversation to
    // silently destroy.
    if (index < 0) return false;
    for (const { id } of ordered.slice(index)) {
      this.store.delRow("messages", id);
    }
    // ONE pass over the child table for the whole tail (audit finding 7),
    // after the message ids are known.
    this.deleteStepsOfMany(new Set(ordered.slice(index).map((entry) => entry.id)));
    return true;
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
        ? (() => {
            const ids = new Map<string, string>();
            const steps = turn.steps!.map((s) => {
              const id = newId();
              ids.set(s.id, id);
              return { ...s, id };
            });
            // Blocks point at step ids, so the forked ids must be
            // threaded through them or every tool block dangles.
            return {
              ...turn,
              steps,
              ...(turn.blocks !== undefined
                ? {
                    blocks: turn.blocks.map((b) =>
                      b.kind === "tool"
                        ? { kind: "tool", stepId: ids.get(b.stepId) ?? b.stepId }
                        : b,
                    ),
                  }
                : {}),
            };
          })()
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
    // Finite numbers AND booleans count as an override: a boolean flag
    // (includeThinkingInContext) is a real per-session choice, and a
    // number-only filter would silently drop `false` and fall back to the
    // preset. A half-written save still degrades the same way.
    const out: Record<string, number | boolean> = {};
    for (const key of Object.keys(DEFAULT_SAMPLER)) {
      const v = parsed[key];
      if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
      else if (typeof v === "boolean") out[key] = v;
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
