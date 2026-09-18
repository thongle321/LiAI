/** Chat state: messages, session ownership, connection, in-flight guard. */

import { create } from "zustand";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";

import { getHealth, getHistory, postChat } from "../lib/api.ts";
import type { ApiError } from "../types/api.ts";
import type { KeyValueStorage } from "../lib/storage.ts";

export const SESSION_KEY = "liai_session_id";
export const HISTORY_KEY = "liai_history_v1";

/** One row in the drawer's on-device history list. */
export interface ChatSession {
  id: string;
  title: string;
  at: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Local creation time (ms) for the design's timestamp row. */
  at: number;
  /** Optional image ref — bubble shows the design's picture box when set. */
  image?: string;
  error?: ApiError;
}

export type Connection = "unknown" | "up" | "down";

interface ChatState {
  messages: ChatMessage[];
  sessionId: string | null;
  connection: Connection;
  sending: boolean;
  /** On-device history index (title = first user message). */
  sessions: ChatSession[];
  loadSession: () => Promise<void>;
  checkHealth: () => Promise<void>;
  send: (text: string, image?: string) => Promise<boolean>;
  retry: (messageId: string) => Promise<boolean>;
  newConversation: () => Promise<void>;
  switchSession: (sessionId: string) => Promise<boolean>;
  deleteSession: (sessionId: string) => Promise<void>;
  recordVisionTurn: (
    question: string,
    answer: string,
    sessionId?: string,
    image?: string,
  ) => Promise<void>;
}

// ponytail: lazy import keeps the native module out of plain-Node tests;
// Metro still bundles it statically for the app.
async function rnStorage(): Promise<AsyncStorageStatic> {
  const mod = await import("@react-native-async-storage/async-storage");
  // CJS/ESM interop differs between Metro and Node; the static lives on default.
  return (mod.default ?? mod) as unknown as AsyncStorageStatic;
}

const asyncStorage: KeyValueStorage = {
  getItem: async (key) => (await rnStorage()).getItem(key),
  setItem: async (key, value) => {
    await (await rnStorage()).setItem(key, value);
  },
  removeItem: async (key) => {
    await (await rnStorage()).removeItem(key);
  },
};

let nextId = 0;
function newId(): string {
  nextId += 1;
  return `${Date.now()}-${nextId}`;
}

export function createChatStore(storage: KeyValueStorage) {
  return create<ChatState>()((set, get) => {
    async function readIndex(): Promise<ChatSession[]> {
      try {
        const raw = await storage.getItem(HISTORY_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(
          (s): s is ChatSession =>
            typeof s === "object" &&
            s !== null &&
            typeof (s as ChatSession).id === "string" &&
            typeof (s as ChatSession).title === "string",
        );
      } catch {
        return [];
      }
    }

    async function writeIndex(sessions: ChatSession[]): Promise<void> {
      // ponytail: best-effort — the index is a convenience, never a gate.
      try {
        await storage.setItem(HISTORY_KEY, JSON.stringify(sessions));
      } catch {
        // keep in-memory state even if persistence fails
      }
    }

    /** Touch the index entry for a session (title sticks from first send). */
    async function touchSession(id: string, title: string): Promise<void> {
      const sessions = get().sessions;
      const existing = sessions.find((s) => s.id === id);
      const next =
        existing === undefined
          ? [...sessions, { id, title: title.slice(0, 40), at: Date.now() }]
          : sessions.map((s) => (s.id === id ? { ...s, at: Date.now() } : s));
      next.sort((a, b) => b.at - a.at);
      set({ sessions: next });
      await writeIndex(next);
    }

    function toMessages(res: { messages: { role: "user" | "assistant"; content: string }[] }): ChatMessage[] {
      return res.messages.map((m) => ({
        id: newId(),
        role: m.role,
        text: m.content,
        at: Date.now(),
      }));
    }

    async function runSend(id: string, text: string, image?: string): Promise<void> {
      try {
        const res = await postChat(text, get().sessionId ?? undefined, image);
        if (get().sessionId !== res.session_id) {
          await storage.setItem(SESSION_KEY, res.session_id);
        }
        await touchSession(res.session_id, text);
        set((s) => ({
          sessionId: res.session_id,
          sending: false,
          messages: [
            ...s.messages,
            { id: newId(), role: "assistant", text: res.reply, at: Date.now() },
          ],
        }));
      } catch (err) {
        set((s) => ({
          sending: false,
          messages: s.messages.map((m) =>
            m.id === id
              ? { ...m, error: err as ApiError }
              : m,
          ),
        }));
      }
    }

    return {
      messages: [],
      sessionId: null,
      connection: "unknown",
      sending: false,
      sessions: [],

      loadSession: async () => {
        set({ sessions: await readIndex() });
        const sessionId = await storage.getItem(SESSION_KEY);
        if (sessionId) set({ sessionId });
        // ponytail: best-effort hydration, never a second gate — chat works
        // with or without history, so any failure leaves state untouched.
        try {
          const res = await getHistory(sessionId ?? undefined);
          if (!Array.isArray(res.messages)) return;
          if (res.session_id !== sessionId) {
            await storage.setItem(SESSION_KEY, res.session_id);
          }
          set({
            sessionId: res.session_id,
            messages: toMessages(res),
          });
        } catch {
          // keep whatever is already in state
        }
      },

      checkHealth: async () => {
        try {
          await getHealth();
          set({ connection: "up" });
        } catch {
          set({ connection: "down" });
        }
      },

      send: async (text: string, image?: string) => {
        const trimmed = text.trim();
        if (trimmed === "" || get().sending) return false;
        const id = newId();
        set((s) => ({
          sending: true,
          messages: [...s.messages, { id, role: "user", text: trimmed, at: Date.now(), ...(image !== undefined ? { image } : {}) }],
        }));
        await runSend(id, trimmed, image);
        return true;
      },

      retry: async (messageId: string) => {
        if (get().sending) return false;
        const message = get().messages.find((m) => m.id === messageId);
        if (!message || !message.error) return false;
        set((s) => ({
          sending: true,
          messages: s.messages.map((m) =>
            m.id === messageId ? { ...m, error: undefined } : m,
          ),
        }));
        await runSend(messageId, message.text, message.image);
        return true;
      },

      newConversation: async () => {
        await storage.removeItem(SESSION_KEY);
        set({ sessionId: null, messages: [], sending: false });
      },

      switchSession: async (id: string) => {
        if (get().sending || get().sessionId === id) return false;
        if (!get().sessions.some((s) => s.id === id)) return false;
        try {
          const res = await getHistory(id);
          await storage.setItem(SESSION_KEY, res.session_id);
          set({ sessionId: res.session_id, messages: toMessages(res) });
          return true;
        } catch {
          return false;
        }
      },

      deleteSession: async (id: string) => {
        // Never pull the rug on an in-flight turn: runSend would re-touch it.
        if (get().sending && get().sessionId === id) return;
        const next = get().sessions.filter((s) => s.id !== id);
        set({ sessions: next });
        await writeIndex(next);
        if (get().sessionId === id) {
          await storage.removeItem(SESSION_KEY);
          set({ sessionId: null, messages: [], sending: false });
        }
      },

      recordVisionTurn: async (question, answer, sessionId, image) => {
        const nextSessionId = sessionId ?? get().sessionId;
        const now = Date.now();
        if (nextSessionId !== null && nextSessionId !== get().sessionId) {
          await storage.setItem(SESSION_KEY, nextSessionId);
        }
        set((s) => ({
          sessionId: nextSessionId,
          sending: false,
          messages: [
            ...s.messages,
            {
              id: newId(),
              role: "user",
              text: question,
              at: now,
              ...(image !== undefined ? { image } : {}),
            },
            { id: newId(), role: "assistant", text: answer, at: now },
          ],
        }));
        if (nextSessionId !== null) await touchSession(nextSessionId, question);
      },
    };
  });
}

export const useChatStore = createChatStore(asyncStorage);
