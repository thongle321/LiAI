/** Shared fakes for store tests: in-memory sessions, scripted turns.
 *
 * The chat slices take their collaborators by injection (session store,
 * turn runner, engine source), so these tests never touch fetch, XHR,
 * SQLite, or native modules. There is no storage fake here any more:
 * sessions, the active-session pointer and drafts all live in the
 * session store (ADR-0012).
 */

import type {
  SessionStore,
  StoredMessage,
  StoredTurn,
} from "../lib/chat/session-store.ts";
import { draftSlot } from "../lib/chat/session-store.ts";
import type { SamplerParams } from "../lib/inference/sampler.ts";
import type { AgentStep, SessionInfo } from "../types/chat.ts";
import type { TurnRunner } from "../store/chat/types.ts";

interface SeedSession {
  id: string;
  title?: string;
  pinned?: boolean;
  turns?: StoredTurn[];
}

export interface FakeStoreCalls {
  creates: number;
  appends: Array<{ sessionId: string; turn: StoredTurn }>;
  deletes: string[];
}

/** In-memory SessionStore with call counters (no native, no SDK).
 *  `activeSessionId` seeds the pointer, which is what the old
 *  `memoryStorage({liai_session_id})` seed used to do. */
export function fakeSessionStore(
  seeds: SeedSession[] = [],
  activeSessionId: string | null = null,
): {
  store: SessionStore;
  calls: FakeStoreCalls;
  /** Drafts by slot, so a test can assert what was persisted. */
  drafts: Map<string, string>;
} {
  const sessions = new Map<
    string,
    { title: string; pinned: boolean; turns: StoredMessage[]; seq: number }
  >();
  // Row ids, like the real store mints on append. Seeded turns get
  // stable, readable ids so a test can name one in a truncateFrom call.
  let turnSeq = 0;
  const mintId = (sessionId: string): string => `${sessionId}-t${(turnSeq += 1)}`;
  for (const seed of seeds) {
    sessions.set(seed.id, {
      title: seed.title ?? "",
      pinned: seed.pinned ?? false,
      turns: (seed.turns ?? []).map((t, i) => ({ ...t, id: `${seed.id}-t${i + 1}` })),
      seq: 0,
    });
  }
  const drafts = new Map<string, string>();
  const samplers = new Map<string, Partial<SamplerParams>>();
  let active: string | null = activeSessionId;
  let clock = 0;
  const calls: FakeStoreCalls = { creates: 0, appends: [], deletes: [] };
  const store: SessionStore = {
    create: async () => {
      calls.creates += 1;
      const id = `s-${calls.creates}`;
      sessions.set(id, { title: "", pinned: false, turns: [], seq: 0 });
      return id;
    },
    get: async (sessionId: string) => {
      const row = sessions.get(sessionId);
      if (!row) return null;
      // Tool calls come back in call order: the real store sorts the
      // child table by `position`, so the fake must honour the same
      // contract rather than returning whatever order it was written in.
      return row.turns.map((t) => ({
        ...t,
        ...(t.steps !== undefined
          ? { steps: [...t.steps].sort((a, b) => a.position - b.position) }
          : {}),
      }));
    },
    append: async (sessionId: string, turn: StoredTurn, id?: string) => {
      let row = sessions.get(sessionId);
      if (!row) {
        row = { title: "", pinned: false, turns: [], seq: 0 };
        sessions.set(sessionId, row);
      }
      // Same rule as the real store: a caller-supplied id pins the row, so
      // a bubble's id and its persisted id are one string.
      row.turns.push({ ...turn, id: id ?? mintId(sessionId) });
      calls.appends.push({ sessionId, turn: { ...turn } });
    },
 listSessions: async (): Promise<SessionInfo[]> =>
 // Mirrors the real store's drawer order: pinned first, insertion
 // order otherwise (the fake seeds share one seq).
 [...sessions.entries()]
 .map(([id, row]) => ({
 id,
 title: row.title,
 pinned: row.pinned,
 updatedAt: row.seq,
 }))
 .sort((a, b) => (a.pinned === b.pinned ? 0 : a.pinned ? -1 : 1)),
    renameSession: async (id: string, title: string) => {
      const row = sessions.get(id);
      if (!row) return false;
      row.title = title;
      return true;
    },
    setSessionPinned: async (id: string, pinned: boolean) => {
      const row = sessions.get(id);
      if (!row) return false;
      row.pinned = pinned;
      return true;
    },
      deleteSession: async (id: string) => {
      calls.deletes.push(id);
      // Mirrors the real store: the draft, the sampler override and the
      // pointer are its data.
      drafts.delete(draftSlot(id));
      samplers.delete(id);
      if (active === id) active = null;
      return sessions.delete(id);
    },
    setTitleIfEmpty: async (id: string, title: string) => {
      const row = sessions.get(id);
      // No mint-if-absent, matching the real store: a session row always
      // exists before this is called.
      if (row && row.title === "") row.title = title;
    },
popLastAssistant: async (id: string) => {
      const row = sessions.get(id);
      if (!row || row.turns.length === 0) return false;
      const last = row.turns[row.turns.length - 1];
      if (last.role !== "assistant") return false;
      row.turns.pop();
      return true;
    },
    truncateFrom: async (id: string, messageId: string) => {
      const row = sessions.get(id);
      if (!row) return false;
      const index = row.turns.findIndex((t) => t.id === messageId);
      // Unknown id drops nothing, same as the real store.
      if (index < 0) return false;
      // The fake keeps `steps` inline on each turn, so splicing the tail
      // takes the tool calls with it — no separate cascade needed here.
      row.turns.splice(index);
      return true;
    },
    getDraft: async (sessionId) => drafts.get(draftSlot(sessionId)) ?? "",
    setDraft: async (sessionId, text) => {
      clock += 1;
      if (text === "") drafts.delete(draftSlot(sessionId));
      else drafts.set(draftSlot(sessionId), text);
    },
    clearDraft: async (sessionId) => {
      drafts.delete(draftSlot(sessionId));
    },
    getActiveSessionId: async () => active,
    setActiveSessionId: async (sessionId) => {
      active = sessionId;
    },
    getSessionSampler: async (sessionId) => samplers.get(sessionId) ?? null,
    setSessionSampler: async (sessionId, override) => {
      if (override === null || Object.keys(override).length === 0) {
        samplers.delete(sessionId);
      } else {
        samplers.set(sessionId, override);
      }
    },
    duplicateSession: async (sessionId) => {
      const row = sessions.get(sessionId);
      if (!row) return null;
      calls.creates += 1;
      const copyId = `s-${calls.creates}`;
      // Deep-copied turns: a fork that shared turn objects with its source
      // would mutate both when one of them is regenerated.
      sessions.set(copyId, {
        title: `${row.title} - Copy`,
        pinned: false,
        turns: row.turns.map((t) => ({ ...t })),
        seq: 0,
      });
      const sampler = samplers.get(sessionId);
      if (sampler) samplers.set(copyId, { ...sampler });
      active = copyId;
      return copyId;
    },
  };
  return { store, calls, drafts };
}

export interface ScriptedTurn {
  reply?: string;
  steps?: AgentStep[];
  promptTokens?: number;
  completionTokens?: number;
  fail?: string;
}

export interface FakeTurnCalls {
  texts: string[];
  sessions: (string | null)[];
  /** The images actually handed to the engine, or undefined. G12's whole
   *  claim is about what the MODEL receives, not what the user attached,
   *  so it has to be observable here. */
  images: (string[] | undefined)[];
}

/** Scripted TurnRunner: shifts one outcome per call, records inputs. */
export function fakeRunTurn(script: ScriptedTurn[]): {
  runTurn: TurnRunner;
  calls: FakeTurnCalls;
} {
  const calls: FakeTurnCalls = { texts: [], sessions: [], images: [] };
  const queue = script.map((s) => ({ ...s }));
  const runTurn: TurnRunner = async (text, paths, onToken) => {
    calls.texts.push(text);
    calls.sessions.push(paths.sessionId);
    calls.images.push(paths.images);
    const next = queue.length > 0 ? queue.shift()! : {};
    if (next.fail !== undefined) throw new Error(next.fail);
    const reply = next.reply ?? `Echo ${text}`;
    // Stream in two chunks so the token path (not just the final
    // overwrite) is what fills the bubble mid-flight.
    const mid = Math.ceil(reply.length / 2);
    onToken?.(reply.slice(0, mid));
    onToken?.(reply.slice(mid));
    return {
      reply,
      sessionId: paths.sessionId ?? "s-new",
      steps: next.steps ?? [],
      promptTokens: next.promptTokens ?? 1,
      completionTokens: next.completionTokens ?? 2,
    };
  };
  return { runTurn, calls };
}

/** A TurnRunner gate that stays open until released (in-flight tests). */
export function gatedRunTurn(): {
  runTurn: TurnRunner;
  release: (reply?: string) => void;
  calls: FakeTurnCalls;
} {
  const calls: FakeTurnCalls = { texts: [], sessions: [], images: [] };
  let release: (reply?: string) => void = () => {};
  const runTurn: TurnRunner = (text, paths, onToken) =>
    new Promise((resolve) => {
      calls.texts.push(text);
      calls.sessions.push(paths.sessionId);
      calls.images.push(paths.images);
      release = (reply = `Echo ${text}`) => {
        onToken?.(reply);
        resolve({
          reply,
          sessionId: paths.sessionId ?? "s-new",
          steps: [],
          promptTokens: 1,
          completionTokens: 2,
        });
      };
    });
  return { runTurn, release: (reply) => release(reply), calls };
}
