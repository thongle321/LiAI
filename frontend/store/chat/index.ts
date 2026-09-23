/** Chat store: backend-owned sessions, streamed turns.
 *
 * Composed from focused slices; the public path stays `../store/chat`
 * (that file re-exports this). The factory takes storage (and an optional
 * XHR factory) so tests inject memory fakes.
 */

import { create } from "zustand";
import type { AsyncStorageStatic } from "@react-native-async-storage/async-storage";

import { getHealth } from "../../lib/api.ts";
import type { KeyValueStorage } from "../../lib/storage.ts";
import { createSendSlice } from "./send.ts";
import { createSessionsSlice } from "./sessions.ts";
import type { ChatCtx, ChatDeps, ChatState } from "./types.ts";

// ponytail: lazy import keeps the native module out of plain-Node tests;
// Metro still bundles it statically for the app.
async function rnStorage(): Promise<AsyncStorageStatic> {
  const mod = await import("@react-native-async-storage/async-storage");
  // CJS/ESM interop differs between Metro and Node; the static lives on default.
  // SAFETY: the module's default export is the AsyncStorage instance; the
  // interop shim can surface it under `.default` or on the namespace itself.
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

export function createChatStore(storage: KeyValueStorage, deps?: ChatDeps) {
  const ctx: ChatCtx = {
    storage,
    openXhr: deps?.openXhr,
    active: { handle: null },
    streamGen: 0,
  };
  return create<ChatState>()((set, get) => ({
    messages: [],
    connection: "unknown",
    ...createSessionsSlice(set, get, ctx),
    ...createSendSlice(set, get, ctx),

    checkHealth: async () => {
      try {
        await getHealth();
        set({ connection: "up" });
      } catch {
        set({ connection: "down" });
      }
    },
  }));
}

export const useChatStore = createChatStore(asyncStorage);

export { SESSION_KEY } from "./types.ts";
export type { ChatDeps, ChatState, ChatCtx, Connection } from "./types.ts";
