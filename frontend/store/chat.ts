/** Chat state: messages, session ownership, connection, in-flight guard. */

import { create } from "zustand";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";

import { getHealth, getHistory, postChat } from "../lib/api.ts";
import type { ApiError } from "../types/api.ts";
import type { KeyValueStorage } from "../lib/storage.ts";

export const SESSION_KEY = "liai_session_id";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  error?: ApiError;
}

export type Connection = "unknown" | "up" | "down";

interface ChatState {
  messages: ChatMessage[];
  sessionId: string | null;
  connection: Connection;
  sending: boolean;
  loadSession: () => Promise<void>;
  checkHealth: () => Promise<void>;
  send: (text: string) => Promise<boolean>;
  retry: (messageId: string) => Promise<boolean>;
  newConversation: () => Promise<void>;
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
    async function runSend(id: string, text: string): Promise<void> {
      try {
        const res = await postChat(text, get().sessionId ?? undefined);
        if (get().sessionId !== res.session_id) {
          await storage.setItem(SESSION_KEY, res.session_id);
        }
        set((s) => ({
          sessionId: res.session_id,
          sending: false,
          messages: [
            ...s.messages,
            { id: newId(), role: "assistant", text: res.reply },
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

      loadSession: async () => {
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
            messages: res.messages.map((m) => ({
              id: newId(),
              role: m.role,
              text: m.content,
            })),
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

      send: async (text: string) => {
        const trimmed = text.trim();
        if (trimmed === "" || get().sending) return false;
        const id = newId();
        set((s) => ({
          sending: true,
          messages: [...s.messages, { id, role: "user", text: trimmed }],
        }));
        await runSend(id, trimmed);
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
        await runSend(messageId, message.text);
        return true;
      },

      newConversation: async () => {
        await storage.removeItem(SESSION_KEY);
        set({ sessionId: null, messages: [], sending: false });
      },
    };
  });
}

export const useChatStore = createChatStore(asyncStorage);
