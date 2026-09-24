/** Shared fakes for store tests: memory KV, in-memory sessions, scripted turns.
 *
 * The chat slices take all collaborators by injection (storage, session
 * store, turn runner, engine source), so these tests never touch fetch,
 * XHR, Supabase, or native modules.
 */

import type { KeyValueStorage } from "../lib/storage.ts";
import type {
  ChatTurn,
  SessionRow,
  SessionStore,
} from "../lib/chat/supabase-store.ts";
import type { AgentStep } from "../types/chat.ts";
import type { TurnRunner } from "../store/chat/types.ts";

export function memoryStorage(seed: Record<string, string> = {}): KeyValueStorage & {
  data: Record<string, string>;
} {
  const data: Record<string, string> = { ...seed };
  return {
    data,
    getItem: async (k: string) => data[k] ?? null,
    setItem: async (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: async (k: string) => {
      delete data[k];
    },
  };
}

interface SeedSession {
  id: string;
  title?: string;
  pinned?: boolean;
  turns?: ChatTurn[];
}

export interface FakeStoreCalls {
  creates: number;
  appends: Array<{ sessionId: string; turn: ChatTurn }>;
  deletes: string[];
}

/** In-memory SessionStore with call counters (no network, no SDK). */
export function fakeSessionStore(seeds: SeedSession[] = []): {
  store: SessionStore;
  calls: FakeStoreCalls;
} {
  const sessions = new Map<
    string,
    { title: string; pinned: boolean; turns: ChatTurn[] }
  >();
  for (const seed of seeds) {
    sessions.set(seed.id, {
      title: seed.title ?? "",
      pinned: seed.pinned ?? false,
      turns: (seed.turns ?? []).map((t) => ({ ...t })),
    });
  }
  const calls: FakeStoreCalls = { creates: 0, appends: [], deletes: [] };
  const store: SessionStore = {
    create: async () => {
      calls.creates += 1;
      const id = `s-${calls.creates}`;
      sessions.set(id, { title: "", pinned: false, turns: [] });
      return id;
    },
    get: async (sessionId: string) => {
      const row = sessions.get(sessionId);
      return row ? row.turns.map((t) => ({ ...t })) : null;
    },
    append: async (sessionId: string, turn: ChatTurn) => {
      let row = sessions.get(sessionId);
      if (!row) {
        row = { title: "", pinned: false, turns: [] };
        sessions.set(sessionId, row);
      }
      row.turns.push({ ...turn });
      calls.appends.push({ sessionId, turn: { ...turn } });
    },
    listSessions: async (): Promise<SessionRow[]> =>
      [...sessions.entries()].map(([id, row]) => ({
        id,
        title: row.title,
        pinned: row.pinned,
        updated_at: "t",
      })),
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
      return sessions.delete(id);
    },
    setTitleIfEmpty: async (id: string, title: string) => {
      const row = sessions.get(id);
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
  };
  return { store, calls };
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
}

/** Scripted TurnRunner: shifts one outcome per call, records inputs. */
export function fakeRunTurn(script: ScriptedTurn[]): {
  runTurn: TurnRunner;
  calls: FakeTurnCalls;
} {
  const calls: FakeTurnCalls = { texts: [], sessions: [] };
  const queue = script.map((s) => ({ ...s }));
  const runTurn: TurnRunner = async (text, paths, onToken) => {
    calls.texts.push(text);
    calls.sessions.push(paths.sessionId);
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
  const calls: FakeTurnCalls = { texts: [], sessions: [] };
  let release: (reply?: string) => void = () => {};
  const runTurn: TurnRunner = (text, paths, onToken) =>
    new Promise((resolve) => {
      calls.texts.push(text);
      calls.sessions.push(paths.sessionId);
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
